This cluster
============

One process per GPU. Do not co-schedule anything else on these cards.

| Side | Cluster | Node | GPU sharing | LAN URL | Model |
| --- | --- | --- | --- | --- | --- |
| Ollama | homelab-2 | k3s-gpu2 (**10.10.1.39**) | none (1/1) | NodePort on `10.10.1.39` (`make` looks it up) | `qwen2.5:3b-instruct-fp16` |
| vLLM | homelab-1 | k3s-gpu1 (10.10.1.37) | time-sliced 4-way, but every other GPU pod is replicas=0 | NodePort on `10.10.1.37` (`make` looks it up; `.242` is a UniFi switch) | `Qwen/Qwen2.5-3B-Instruct` |

Same family, same size, FP16/BF16 on both. Default Ollama `qwen2.5:3b` is Q4_K_M — that would not be a fair sweep.

```bash
cd ollama-lb-test
make deploy-ollama    # helm install on homelab-2; pulls the 6.2 GiB model
make deploy-vllm      # scale Helmfile vLLM to 1, util 0.90, exclusive card
make status
make smoke            # /v1/models + one short completion each
make sweep-ollama     # writes sweep_ollama.csv  (run first or second; sequential)
make sweep-vllm       # writes sweep_vllm.csv
```

Pinned versions: Ollama image `0.33.2` (`sha256:020e4134285e2ef4d8fd801234176de3b4faadc992a3eb06c8e66a2f9d4c4ba2`), vLLM `vllm/vllm-openai:v0.11.0` (already on homelab-1). Ollama knobs in `apps/ollama/chart/values.yaml`: `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_QUEUE=512`, `OLLAMA_KEEP_ALIVE=-1`, `OLLAMA_CONTEXT_LENGTH=8192` (matches vLLM `--max-model-len`).

---

Why it breaks — the actual mechanism

Three things stack up:

1. Slots, not continuous batching. Ollama allocates a fixed number of parallel "slots" (OLLAMA_NUM_PARALLEL, default 1, sometimes auto-bumped to 4 if VRAM allows). A request occupies a slot for its entire generation. Request #5 with 4 slots waits for a full generation to finish — head-of-line blocking. vLLM's continuous batching admits new sequences at every decode step, so a request joins the running batch within milliseconds.

2. KV cache is multiplicative, not shared. Ollama sets context as per-request context × slot count. Going 1 → 4 slots quadruples KV VRAM at the same context length. Nothing is shared. vLLM's PagedAttention pages the KV cache like virtual memory — blocks are allocated on demand, shared across prefixes, and evictable. This is why "just raise NUM_PARALLEL" doesn't rescue you: past your VRAM headroom, layers spill to CPU and every request gets slower, including single ones.

3. Queue, then hard reject. Overflow past the slots goes into a queue (OLLAMA_MAX_QUEUE, default 512). When that fills, you get HTTP 503: server busy, please try again. maximum pending requests exceeded. No backpressure signal before that — just growing latency, then a wall.

Published 2026 benchmarks on a single GPU with an 8B model put the shape at roughly: at 1 user Ollama actually wins TTFT (~45ms vs ~82ms); at 8 users ~82 tok/s with 4s p99 vs vLLM's ~187 tok/s at 1.2s p99; at 20 users Ollama is queueing 16+ requests at 9s p99; at 50 users p99 ~25s vs vLLM ~2.8s. Your numbers will differ, but the shape — flat throughput, linearly exploding latency — is the fingerprint.

The tests that prove it

I've sent you llm_load_sweep.py. Run the same model/quant against both endpoints:

bash
python llm_load_sweep.py --base-url http://ollama-host:11434/v1 \
    --model llama3.1:8b --levels 1,2,4,8,16,32,64 --tag ollama
python llm_load_sweep.py --base-url http://vllm-host:8000/v1 \
    --model meta-llama/Llama-3.1-8B-Instruct --api-key EMPTY \
    --levels 1,2,4,8,16,32,64 --tag vllm

Test 1 — the knee (the money shot). The script prints the concurrency where aggregate tok/s stops rising but p99 TTFT keeps climbing. That's your saturation point. Ollama's knee lands at roughly NUM_PARALLEL; vLLM's lands far later. Graph both CSVs on one axis and the argument is over.

Test 2 — head-of-line blocking. Fire one request with max_tokens=2000, then 50ms later fire a trivial one (max_tokens=8). On Ollama with 1 slot, the short request's TTFT ≈ the long request's total time. On vLLM it returns in ~100ms. This single test is the cleanest proof that slots ≠ batching.

Test 3 — the 503 cliff. Set OLLAMA_MAX_QUEUE=32 and ramp. You'll get clean 200s, then a sharp edge of 503s with zero graceful degradation. Show that to anyone arguing "we'll just add a retry."

Test 4 — the VRAM trap. Raise OLLAMA_NUM_PARALLEL 1→4→8 and watch nvidia-smi plus your single-user latency. KV cache grows linearly with slots; at some point layers offload and the concurrency=1 row in your sweep gets worse than the baseline. That's the proof it isn't a config problem.

Test 5 — soak. 30–60 min at your knee concurrency. Watch for VRAM creep, model unload/reload thrash (ollama ps — models idle out and get evicted, then a request eats a multi-second cold reload), and p99 drift.

How to remember it

"Ollama is a taxi rank, vLLM is a subway." A taxi rank has N cars; passenger N+1 waits for a whole round trip. The subway keeps moving and people board at every station. Slots vs. continuous batching, in one image.

For the failure order, "Slots → Queue → 503": you run out of slots (latency rises), then you run out of queue (hard rejects). Latency degrades gracefully right up until it doesn't.

And the boundary rule of thumb: Ollama is fine to about the number of humans who could plausibly be in one room with you. Dev laptop, homelab, internal tool with a handful of users, batch jobs where latency doesn't matter — great. Anything with an SLA, unpredictable arrival rates, or more than ~4–8 truly concurrent streams — that's vLLM's job, which is exactly the split you've already built into your cluster.

https://runaihome.com/blog/vllm-vs-ollama-when-each-wins-2026/

https://www.ssdnodes.com/learn/ollama-num-parallel-and-max-queue

https://codingprotocols.com/blog/when-to-move-off-ollama-production-inference


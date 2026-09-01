#!/usr/bin/env python3
"""
llm_load_sweep.py — concurrency sweep for OpenAI-compatible LLM endpoints.

Point it at Ollama (http://host:11434/v1) and vLLM (http://host:8000/v1) with the
same model/quant and overlay the two curves. The Ollama curve flattens; the vLLM
curve keeps climbing. That gap IS the answer.

Usage:
  pip install httpx
  python llm_load_sweep.py --base-url http://192.168.1.50:11434/v1 \
      --model llama3.1:8b --levels 1,2,4,8,16,32,64 --requests-per-level 40

  python llm_load_sweep.py --base-url http://192.168.1.51:8000/v1 \
      --model meta-llama/Llama-3.1-8B-Instruct --api-key EMPTY ...

Outputs a table + CSV (sweep_<tag>.csv) you can graph.
"""

import argparse, asyncio, csv, json, statistics, sys, time
import httpx

PROMPT = (
    "Explain how a key-value cache works in transformer inference. "
    "Be specific about memory growth with sequence length and batch size."
)


async def one_request(client, base_url, model, api_key, max_tokens, results):
    """Fire one streaming completion; record TTFT, total time, output tokens."""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    body = {
        "model": model,
        "messages": [{"role": "user", "content": PROMPT}],
        "max_tokens": max_tokens,
        "temperature": 0.0,
        "stream": True,
    }
    t0 = time.perf_counter()
    ttft = None
    tokens = 0
    try:
        async with client.stream(
            "POST", f"{base_url}/chat/completions", json=body, headers=headers
        ) as r:
            if r.status_code != 200:
                await r.aread()
                results.append({"status": r.status_code, "ttft": None,
                                "total": time.perf_counter() - t0, "tokens": 0})
                return
            async for line in r.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if payload.strip() == "[DONE]":
                    break
                try:
                    delta = json.loads(payload)["choices"][0].get("delta", {})
                except Exception:
                    continue
                if delta.get("content"):
                    if ttft is None:
                        ttft = time.perf_counter() - t0
                    tokens += 1
        results.append({"status": 200, "ttft": ttft,
                        "total": time.perf_counter() - t0, "tokens": tokens})
    except Exception as e:
        results.append({"status": type(e).__name__, "ttft": None,
                        "total": time.perf_counter() - t0, "tokens": 0})


async def run_level(base_url, model, api_key, concurrency, n_requests, max_tokens):
    """Keep exactly `concurrency` requests in flight until n_requests complete."""
    results = []
    sem = asyncio.Semaphore(concurrency)
    limits = httpx.Limits(max_connections=concurrency + 10)
    timeout = httpx.Timeout(600.0, connect=10.0)

    async with httpx.AsyncClient(limits=limits, timeout=timeout) as client:
        async def guarded():
            async with sem:
                await one_request(client, base_url, model, api_key, max_tokens, results)

        wall0 = time.perf_counter()
        await asyncio.gather(*[guarded() for _ in range(n_requests)])
        wall = time.perf_counter() - wall0
    return results, wall


def pct(vals, p):
    if not vals:
        return float("nan")
    vals = sorted(vals)
    k = max(0, min(len(vals) - 1, int(round((p / 100) * len(vals)) - 1)))
    return vals[k]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", required=True, help="e.g. http://host:11434/v1")
    ap.add_argument("--model", required=True)
    ap.add_argument("--api-key", default=None)
    ap.add_argument("--levels", default="1,2,4,8,16,32,64")
    ap.add_argument("--requests-per-level", type=int, default=40)
    ap.add_argument("--max-tokens", type=int, default=256)
    ap.add_argument("--tag", default="run")
    args = ap.parse_args()

    levels = [int(x) for x in args.levels.split(",")]
    rows = []
    print(f"\n{'conc':>5} {'ok':>4} {'err':>4} {'tok/s':>8} {'ttft_p50':>9} "
          f"{'ttft_p99':>9} {'e2e_p50':>8} {'e2e_p99':>8}")
    print("-" * 64)

    for c in levels:
        n = max(args.requests_per_level, c * 2)  # at least 2 waves per level
        results, wall = asyncio.run(
            run_level(args.base_url, args.model, args.api_key, c, n, args.max_tokens)
        )
        ok = [r for r in results if r["status"] == 200 and r["tokens"] > 0]
        errs = [r for r in results if r["status"] != 200]
        tok_s = sum(r["tokens"] for r in ok) / wall if wall else 0
        ttfts = [r["ttft"] for r in ok if r["ttft"] is not None]
        e2es = [r["total"] for r in ok]
        row = {
            "concurrency": c, "ok": len(ok), "errors": len(errs),
            "agg_tok_per_s": round(tok_s, 1),
            "ttft_p50": round(pct(ttfts, 50), 3), "ttft_p99": round(pct(ttfts, 99), 3),
            "e2e_p50": round(pct(e2es, 50), 2), "e2e_p99": round(pct(e2es, 99), 2),
            "wall_s": round(wall, 2),
            "error_kinds": ",".join(sorted({str(r["status"]) for r in errs})) or "-",
        }
        rows.append(row)
        print(f"{c:>5} {row['ok']:>4} {row['errors']:>4} {row['agg_tok_per_s']:>8} "
              f"{row['ttft_p50']:>9} {row['ttft_p99']:>9} "
              f"{row['e2e_p50']:>8} {row['e2e_p99']:>8}"
              + (f"   [{row['error_kinds']}]" if errs else ""))

    out = f"sweep_{args.tag}.csv"
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"\nwrote {out}")

    # Knee detection: first level where aggregate throughput gains < 15%
    # while p99 TTFT grows > 50%. That is the queueing wall.
    for prev, cur in zip(rows, rows[1:]):
        tp_gain = (cur["agg_tok_per_s"] - prev["agg_tok_per_s"]) / max(prev["agg_tok_per_s"], 1e-9)
        lat_gain = (cur["ttft_p99"] - prev["ttft_p99"]) / max(prev["ttft_p99"], 1e-9)
        if tp_gain < 0.15 and lat_gain > 0.5:
            print(f"KNEE: saturation between concurrency {prev['concurrency']} and "
                  f"{cur['concurrency']} — throughput +{tp_gain*100:.0f}%, "
                  f"p99 TTFT +{lat_gain*100:.0f}%. Past here you are queueing, not serving.")
            break
    else:
        print("No knee found in the tested range — push --levels higher.")


if __name__ == "__main__":
    main()
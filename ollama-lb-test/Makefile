# Cluster wiring for the Ollama vs vLLM concurrency sweep.
#
# Placement (one process per 16GB Blackwell, nothing else on that GPU):
#   Ollama  → homelab-2 / k3s-gpu2 (10.10.1.39) NodePort
#   vLLM    → homelab-1 / k3s-gpu1 (10.10.1.37) NodePort
#
# Model: Qwen2.5-3B-Instruct FP16/BF16 on both (ungated, already proven on
# these cards). Do not use ollama `qwen2.5:3b` (Q4_K_M) against vLLM BF16.

CONTEXT_OLLAMA ?= homelab-2
CONTEXT_VLLM   ?= homelab-1

CHART_OLLAMA := ../apps/ollama/chart
CHART_VLLM   := ../apps/vllm/chart

# Sweep does not need kubectl. NodePorts are pinned (k3s allocates them once
# per Service). Override if `kubectl get svc` shows a different port.
# Cilium VIP 10.10.1.242 is a UniFi USW-Flex, not vLLM.
OLLAMA_NODEIP ?= 10.10.1.39
OLLAMA_PORT   ?= 31896
VLLM_NODEIP   ?= 10.10.1.37
VLLM_PORT     ?= 30403
OLLAMA_URL    ?= http://$(OLLAMA_NODEIP):$(OLLAMA_PORT)/v1
VLLM_URL      ?= http://$(VLLM_NODEIP):$(VLLM_PORT)/v1
PYTHON        ?= .venv/bin/python3
OLLAMA_MODEL ?= qwen2.5:3b-instruct-fp16
VLLM_MODEL   ?= Qwen/Qwen2.5-3B-Instruct

LEVELS ?= 1,2,4,8,16,32,64
REQUESTS_PER_LEVEL ?= 40

.PHONY: deploy-ollama deploy-vllm status smoke deps sweep-ollama sweep-vllm teardown-ollama scale-down-vllm

deploy-ollama:
	helm --kube-context $(CONTEXT_OLLAMA) upgrade --install ollama $(CHART_OLLAMA) \
		-n ollama --create-namespace --wait --timeout 25m

# Exclusive occupancy: embeddings / vllm-pipeline / vllm-promo are already at
# 0 replicas. Raise gpu-memory-utilization from the shared-GPU 0.55 default.
deploy-vllm:
	helm --kube-context $(CONTEXT_VLLM) upgrade vllm $(CHART_VLLM) \
		-n vllm --reuse-values \
		--set replicas=1 \
		--set model.gpuMemoryUtilization=0.90 \
		--wait --timeout 20m

status:
	@echo '--- Ollama (homelab-2 / k3s-gpu2) ---'
	kubectl --context $(CONTEXT_OLLAMA) -n ollama get deploy,pods,svc,job
	@echo '--- vLLM (homelab-1 / k3s-gpu1) ---'
	kubectl --context $(CONTEXT_VLLM) -n vllm get deploy,pods,svc
	kubectl --context $(CONTEXT_VLLM) get deploy -n rag embeddings -o jsonpath='embeddings replicas={.spec.replicas}{"\n"}'
	kubectl --context $(CONTEXT_VLLM) get deploy -n vllm-promo vllm-promo -o jsonpath='vllm-promo replicas={.spec.replicas}{"\n"}'

smoke:
	@echo '=== Ollama /v1/models ==='
	curl -sf $(OLLAMA_URL)/models | python3 -m json.tool
	@echo '=== vLLM /v1/models ==='
	curl -sf $(VLLM_URL)/models | python3 -m json.tool
	@echo '=== Ollama one-shot ==='
	curl -sf $(OLLAMA_URL)/chat/completions \
		-H 'Content-Type: application/json' \
		-d '{"model":"$(OLLAMA_MODEL)","messages":[{"role":"user","content":"Reply with the single word pong."}],"max_tokens":8,"temperature":0}' \
		| python3 -c "import json,sys; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'])"
	@echo '=== vLLM one-shot ==='
	curl -sf $(VLLM_URL)/chat/completions \
		-H 'Content-Type: application/json' \
		-H 'Authorization: Bearer EMPTY' \
		-d '{"model":"$(VLLM_MODEL)","messages":[{"role":"user","content":"Reply with the single word pong."}],"max_tokens":8,"temperature":0}' \
		| python3 -c "import json,sys; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'])"

.venv/.deps: requirements.txt
	python3 -m venv .venv
	.venv/bin/pip install -q -r requirements.txt
	touch $@

deps: .venv/.deps

sweep-ollama: deps
	$(PYTHON) llm-load-sweep.py --base-url $(OLLAMA_URL) \
		--model $(OLLAMA_MODEL) --levels $(LEVELS) \
		--requests-per-level $(REQUESTS_PER_LEVEL) --tag ollama

sweep-vllm: deps
	$(PYTHON) llm-load-sweep.py --base-url $(VLLM_URL) \
		--model $(VLLM_MODEL) --api-key EMPTY --levels $(LEVELS) \
		--requests-per-level $(REQUESTS_PER_LEVEL) --tag vllm

teardown-ollama:
	helm --kube-context $(CONTEXT_OLLAMA) uninstall ollama -n ollama --ignore-not-found

scale-down-vllm:
	kubectl --context $(CONTEXT_VLLM) -n vllm scale deploy/vllm --replicas=0

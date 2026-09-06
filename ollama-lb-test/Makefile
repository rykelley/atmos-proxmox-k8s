# Two exclusive vLLM cards (Ollama experiment torn down).
#
#   GPU1  → homelab-1 / k3s-gpu1 (10.10.1.37) NodePort
#   GPU2  → homelab-2 / k3s-gpu2 (10.10.1.39) Cilium VIP 10.10.1.253:8000
#
# Same model on both: Qwen/Qwen2.5-3B-Instruct, vllm/vllm-openai:v0.11.0, util 0.90.
# 10.10.1.242 is a UniFi USW-Flex — do not use it for GPU1.

CONTEXT_GPU1 ?= homelab-1
CONTEXT_GPU2 ?= homelab-2

VLLM_GPU1_IP   ?= 10.10.1.37
VLLM_GPU1_PORT ?= 30403
VLLM_GPU2_IP   ?= 10.10.1.253
VLLM_GPU2_PORT ?= 8000
VLLM_URL       ?= http://$(VLLM_GPU1_IP):$(VLLM_GPU1_PORT)/v1
VLLM_URL_GPU2  ?= http://$(VLLM_GPU2_IP):$(VLLM_GPU2_PORT)/v1
PYTHON         ?= .venv/bin/python3
VLLM_MODEL     ?= Qwen/Qwen2.5-3B-Instruct

LEVELS ?= 1,2,4,8,16,32,64
REQUESTS_PER_LEVEL ?= 40

.PHONY: status smoke deps sweep-vllm sweep-vllm-gpu2 scale-down-vllm

status:
	@echo '--- vLLM GPU1 (homelab-1 / k3s-gpu1) ---'
	kubectl --context $(CONTEXT_GPU1) -n vllm get deploy,pods,svc
	@echo '--- vLLM GPU2 (homelab-2 / k3s-gpu2) ---'
	kubectl --context $(CONTEXT_GPU2) -n vllm get deploy,pods,svc

smoke:
	@echo '=== GPU1 /v1/models ==='
	curl -sf $(VLLM_URL)/models | python3 -m json.tool
	@echo '=== GPU2 /v1/models ==='
	curl -sf $(VLLM_URL_GPU2)/models | python3 -m json.tool

.venv/.deps: requirements.txt
	python3 -m venv .venv
	.venv/bin/pip install -q -r requirements.txt
	touch $@

deps: .venv/.deps

sweep-vllm: deps
	$(PYTHON) llm-load-sweep.py --base-url $(VLLM_URL) \
		--model $(VLLM_MODEL) --api-key EMPTY --levels $(LEVELS) \
		--requests-per-level $(REQUESTS_PER_LEVEL) --tag vllm-gpu1

sweep-vllm-gpu2: deps
	$(PYTHON) llm-load-sweep.py --base-url $(VLLM_URL_GPU2) \
		--model $(VLLM_MODEL) --api-key EMPTY --levels $(LEVELS) \
		--requests-per-level $(REQUESTS_PER_LEVEL) --tag vllm-gpu2

scale-down-vllm:
	kubectl --context $(CONTEXT_GPU1) -n vllm scale deploy/vllm --replicas=0
	kubectl --context $(CONTEXT_GPU2) -n vllm scale deploy/vllm --replicas=0

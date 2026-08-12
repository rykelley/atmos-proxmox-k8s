# Metric-gated LLM model promotion pipeline
#
# Two k3s clusters, one GPU each (NVIDIA RTX PRO 2000 Blackwell 16GB):
#   staging = kubectl context **homelab-1**
#   prod    = kubectl context **homelab-2**
#
# Argo CD + Kargo hub live on staging and (from Phase 4+) manage both clusters.
# This tree is the GitOps source of truth for the promotion path; existing
# `gitops/` Applications continue to own cluster wiring and reuse these files.

## Architecture (target)

```
Freight (vLLM image digest + model ref)
        │
        ▼
   Kargo Warehouse ──► Stage: staging ──► AnalysisTemplate (PromQL)
                              │                    │
                              │                    ▼
                              │              staging Prometheus
                              │              (homelab-1)
                              ▼
                     manual approval
                              │
                              ▼
                        Stage: prod ──► prod Prometheus (homelab-2)
                              │
                              ▼
                   Grafana annotation (HTTP API)
```

Serving: vLLM. Models: Gemma 4 E4B (staging default), Gemma 4 26B A4B MoE 4-bit (prod candidate).

## Build order

| Phase | Scope | Status |
|-------|--------|--------|
| 1 | Monitoring foundation (Prometheus + DCGM on both clusters) | **done** |
| 2 | vLLM chart + staging deploy | **in progress** |
| 3 | Unified Grafana (both Prometheus datasources + dashboards) | pending |
| 4 | Argo CD multi-cluster + prod apps | pending |
| 5 | Kargo project / warehouse / stages | pending |
| 6 | AnalysisTemplate verification gate | pending |
| 7 | Grafana annotations + runbook polish | pending |

## Phase 1 — Monitoring foundation

### What already exists

- **homelab-1 (staging):** `kube-prometheus-stack` in `monitoring` (Argo app `monitoring`), DCGM exporter in `gpu-operator`, ServiceMonitor `dcgm-exporter`, Grafana at `10.10.1.245`.
- **homelab-2 (prod):** kube-prometheus-stack installed via Helm (Phase 1 approval); Grafana disabled; DCGM scraped.

### Chart pin

- **kube-prometheus-stack `87.17.0`** — matches the live staging release; avoids a drive-by upgrade while extracting values into this tree.

### Files in this phase

| Path | Purpose |
|------|---------|
| `monitoring/kube-prometheus-stack/staging-values.yaml` | Staging Helm values (Grafana kept, Prometheus PVC on `local-path`, DCGM scrape, Ingress host) |
| `monitoring/kube-prometheus-stack/prod-values.yaml` | Prod Helm values (Grafana off, same Prometheus/DCGM shape) |
| `monitoring/dcgm-servicemonitor.yaml` | Standalone ServiceMonitor fallback |
| `monitoring/prometheus-ingress.yaml` | Reviewable Ingress for both hosts |
| `../gitops/apps/monitoring.yaml` | Staging Argo app → multi-source valueFiles into this tree |
| `bootstrap/argocd/monitoring-prod.yaml` | **Prepared only** — kept OUT of `gitops/apps/` so root app-of-apps does not create it until Phase 4 + your OK |

### Ingress / DNS

| Host | Cluster | Expected backend |
|------|---------|------------------|
| `prometheus-staging.rykelley.com` | homelab-1 | Cilium Ingress VIP `10.10.1.248` → Prometheus `:9090` |
| `prometheus-prod.rykelley.com` | homelab-2 | Prod Cilium Ingress VIP (enable `ingressController` on edge first) |

**Known gap:** `cilium-ingress` was not present when Phase 1 was scaffolded on homelab-1 despite catalog `enable_ingress_controller: true`. Until that Service exists, verify Prometheus via port-forward. Prod (edge catalog) does not enable Ingress yet.

### Verify — staging (homelab-1) — safe read-only

```bash
# Contexts
kubectl config get-contexts

# Stack health
kubectl --context homelab-1 -n monitoring get pods,svc,servicemonitor
kubectl --context homelab-1 -n gpu-operator get pods,svc -l app=nvidia-dcgm-exporter

# DCGM targets up?
kubectl --context homelab-1 -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090
# other terminal:
curl -sG 'http://127.0.0.1:9090/api/v1/query' --data-urlencode 'query=up{job=~".*dcgm.*"}' | jq .
curl -sG 'http://127.0.0.1:9090/api/v1/query' --data-urlencode 'query=DCGM_FI_DEV_GPU_UTIL' | jq .
curl -sG 'http://127.0.0.1:9090/api/v1/query' --data-urlencode 'query=DCGM_FI_DEV_FB_USED' | jq .
curl -sG 'http://127.0.0.1:9090/api/v1/query' --data-urlencode 'query=DCGM_FI_DEV_GPU_TEMP' | jq .
curl -sG 'http://127.0.0.1:9090/api/v1/query' --data-urlencode 'query=DCGM_FI_DEV_POWER_USAGE' | jq .
```

If metric names differ, scrape the exporter directly:

```bash
kubectl --context homelab-1 -n gpu-operator port-forward svc/nvidia-dcgm-exporter 9400:9400
curl -s localhost:9400/metrics | grep -E 'DCGM_FI_DEV_(GPU_UTIL|FB_USED|GPU_TEMP|POWER_USAGE)'
```

### Verify — prod (homelab-2) — only after you approve an install

Do **not** apply until you explicitly confirm. Preferred path once Phase 4 registers the remote cluster: copy `bootstrap/argocd/monitoring-prod.yaml` into `gitops/apps/` and Sync manually in Argo CD.

Manual Helm fallback (confirmation gate required):

```bash
# STOP: only after explicit "apply to homelab-2" approval
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --version 87.17.0 \
  --kube-context homelab-2 \
  --namespace monitoring --create-namespace \
  -f model-promotion/monitoring/kube-prometheus-stack/prod-values.yaml
```

Then repeat the same four DCGM queries against prod Prometheus.

### Safety rails

- Never run apply/sync against **homelab-2** without an explicit confirmation in chat.
- Prod Stage (later) keeps a **manual approval** button in Kargo even after AnalysisTemplate passes.
- Image digests and freight pinning land in Phases 2/5.

## Phase 2 — vLLM chart + staging deploy

### 16GB model sizing

| Env | Model | Quantization | max-model-len | Why |
|-----|--------|--------------|---------------|-----|
| staging | `google/gemma-4-E4B-it` | `bitsandbytes` | 8192 | BF16 ≈ 17.9 GiB does **not** fit 16GB; Q4-class weights ≈ 4.5 GiB + KV headroom |
| prod (stub) | `google/gemma-4-26B-A4B-it` | `bitsandbytes` | 4096 | Q4 ≈ 14.4 GiB weights — tight; short context for KV |

Image: `vllm/vllm-openai:gemma4` pinned to linux/amd64 digest `sha256:8e86cb93b724092cd4dc892fb129a6c5538613b38a5cd34e40aab9e6aea72b03`.

### Files

| Path | Purpose |
|------|---------|
| `charts/vllm-server/` | Deployment, Service, ServiceMonitor; digest-pinned image; `/v1/models` probes |
| `envs/staging/values.yaml` | E4B + bitsandbytes |
| `envs/prod/values.yaml` | 26B A4B stub — **not applied** in Phase 2 |
| `../gitops/apps/vllm-promo-staging.yaml` | Argo app → staging only |

### HuggingFace token

You do **not** currently have an `HF_TOKEN` Secret on either cluster (checked). Gemma 4 weights are Apache-2.0 / public, so the pod can start without a token, but anonymous HF downloads are rate-limited — a token is strongly recommended.

1. Create a free account at https://huggingface.co/join  
2. Create a token: https://huggingface.co/settings/tokens (read access is enough)  
3. After the `vllm-promo` namespace exists:

```bash
kubectl --context homelab-1 -n vllm-promo create secret generic hf-token \
  --from-literal=HF_TOKEN='hf_...'
# then set hfTokenSecret: "hf-token" in envs/staging/values.yaml and sync
```

### Free GPU VRAM on staging (required)

Scale down competing GPU workloads before first sync (time-sliced VRAM is shared):

```bash
# Helmfile-managed chat vLLM
kubectl --context homelab-1 -n vllm scale deploy/vllm --replicas=0

# Argo-managed — disable auto-sync first so self-heal does not restore replicas
kubectl --context homelab-1 -n argocd patch app embeddings --type json \
  -p '[{"op":"remove","path":"/spec/syncPolicy/automated"}]'
kubectl --context homelab-1 -n argocd patch app vllm-pipeline-staging --type json \
  -p '[{"op":"remove","path":"/spec/syncPolicy/automated"}]'
kubectl --context homelab-1 -n rag scale deploy/embeddings --replicas=0
kubectl --context homelab-1 -n vllm-pipeline scale rollout/vllm-pipeline --replicas=0
```

### Verify (after merge + sync)

```bash
kubectl --context homelab-1 -n vllm-promo get deploy,pods,svc,servicemonitor
kubectl --context homelab-1 -n vllm-promo port-forward svc/vllm-promo 8000:8000
curl -s localhost:8000/v1/models | jq .
curl -s localhost:8000/metrics | grep -E 'time_to_first_token|generation_tokens|kv_cache|num_requests_waiting'
```

## Later phases (stubs)

Kargo + AnalysisTemplate + Grafana annotations land in Phases 3–7. Existing `apps/vllm*`, `kargo/`, and `gitops/` remain until each phase cuts over deliberately.

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
| 1 | Monitoring foundation (Prometheus + DCGM on both clusters) | **in progress** |
| 2 | vLLM chart + staging deploy | pending |
| 3 | Unified Grafana (both Prometheus datasources + dashboards) | pending |
| 4 | Argo CD multi-cluster + prod apps | pending |
| 5 | Kargo project / warehouse / stages | pending |
| 6 | AnalysisTemplate verification gate | pending |
| 7 | Grafana annotations + runbook polish | pending |

## Phase 1 — Monitoring foundation

### What already exists

- **homelab-1 (staging):** `kube-prometheus-stack` in `monitoring` (Argo app `monitoring`), DCGM exporter in `gpu-operator`, ServiceMonitor `dcgm-exporter`, Grafana at `10.10.1.245`.
- **homelab-2 (prod):** GPU Operator + DCGM exporter running; **no** Prometheus yet.

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
- Image digests and freight pinning land in Phases 2/5 — not Phase 1.

## Later phases (stubs)

Directories for charts, envs, kargo, and automation will appear as those phases start. Existing `apps/vllm*`, `kargo/`, and `gitops/` remain the live system until each phase cuts over deliberately.

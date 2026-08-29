# Bootstrap / Argo helpers

Live Argo Applications for Phase 4+ live under `gitops/apps/`:

- `monitoring-prod.yaml` — prod Prometheus (manual sync; already installed via Helm)
- `vllm-promo-prod.yaml` — prod Gemma 4 26B A4B (manual sync; do not Sync without confirmation)
- `model-promotion-project.yaml` — AppProject whitelisting staging + cluster-b

Keep prepared-only drafts here when you do not want root app-of-apps to create them yet.

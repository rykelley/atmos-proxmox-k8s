# Kargo: vLLM model promotion (staging → prod)

Kargo promotes the vLLM inference config from **staging** (cluster-A, GPU
canary) to **prod** (cluster-B, CPU) on top of the hub's Argo CD, gated by an
Argo Rollouts canary + a Prometheus verification.

## What gets promoted (and why not an image tag)

Staging runs the CUDA image `vllm/vllm-openai` and prod runs the CPU image
`vllm/vllm-openai-cpu` — different repos with unrelated tag schemes — so a single
image tag can't flow across both. Instead **a Git commit is the promotable
unit**:

- The `vllm-config` **Warehouse** watches `apps/vllm-pipeline/`. Any commit
  touching the chart or the per-stage values (`chart/env/staging.yaml`,
  `chart/env/prod.yaml`) produces new **Freight** (= that commit).
- Promoting to a Stage pushes a tiny commit that pins that stage's Argo CD
  Application `targetRevision` to the Freight commit, then syncs it.
- Each cluster renders its **own** env values file at that commit, so the GPU
  and CPU variants stay independent while advancing in lockstep.

```
apps/vllm-pipeline/** commit ─► Warehouse(Freight)
                                     │ direct
                                     ▼
                                  staging  ──(canary + vllm-canary-gate verify)──►  prod
                                (cluster-A, GPU)                                 (cluster-B, CPU)
```

Promotion commits only touch `gitops/apps/` (outside the Warehouse
`includePaths`), so they never create a feedback-loop Freight.

## Resources

| File | Purpose |
| --- | --- |
| `project.yaml` | `Project vllm-promo` → creates the `vllm-promo` namespace |
| `pipeline.yaml` | `Warehouse`, `PromotionTask`, `staging`/`prod` `Stage`s, verification `AnalysisTemplate` |
| `../scripts/setup-kargo-project.sh` | applies the above + creates the Git credential `Secret` from `KARGO_GIT_*` |

## Install

Prereqs: cluster-A + cluster-B up, Argo CD running (`deploy-rag`), cluster-B
registered (`register-cluster-b`), and `KARGO_ADMIN_*` + `KARGO_GIT_*` set in
`.env` (see `.env.example`).

```bash
set -a; . ./.env; set +a
atmos workflow deploy-kargo -f cluster
```

This installs cert-manager, installs Kargo, and bootstraps the pipeline.

## Promote

Open the UI (or use the CLI):

```bash
kubectl -n kargo port-forward svc/kargo-api 8080:80   # http://localhost:8080, user: admin
```

1. Make a "release": edit `chart/env/staging.yaml` (and `chart/env/prod.yaml`),
   commit, and push to `main`. Kargo discovers a new Freight within ~a minute.
2. Promote the Freight to **staging**. Kargo pins `vllm-pipeline-staging` to that
   commit; the Rollout runs its canary, then the `vllm-canary-gate` verification
   must pass for the Freight to be marked *verified in staging*.
3. Promote the same Freight to **prod** (only allowed once verified in staging).
   Kargo pins `vllm-pipeline-prod`; Argo CD rolls it out on cluster-B.

CLI equivalent:

```bash
kargo promote --project vllm-promo --stage staging --freight <id>
kargo promote --project vllm-promo --stage prod    --freight <id>
```

## Notes

- `targetRevision` in `gitops/apps/vllm-pipeline-{staging,prod}.yaml` starts at
  `main` and is rewritten to a commit SHA by Kargo on first promotion. That's
  expected — the app-of-apps `selfHeal` won't revert it because Kargo backs the
  change with a real Git commit.
- Verification uses the Argo Rollouts `AnalysisTemplate` CRDs installed by the
  `argo-rollouts` app on cluster-A. The query targets Prometheus in `monitoring`.
- Tear down with `atmos workflow destroy-kargo -f cluster`.

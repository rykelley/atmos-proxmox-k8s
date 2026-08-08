#!/usr/bin/env bash
# Bootstrap the Kargo vLLM promotion pipeline on cluster-A (the hub).
#
# Creates the Project (and its namespace), a Git credential Secret so Kargo can
# push promotion commits, and the Warehouse/Stages/PromotionTask/AnalysisTemplate.
#
# Run AFTER `helmfile apply kargo` (see `atmos workflow deploy-kargo`). Requires
# KARGO_GIT_USERNAME + KARGO_GIT_PAT in the environment (see .env.example).
set -euo pipefail

KUBECONFIG="${KUBECONFIG:-$HOME/.kube/atmos-k3s.yaml}"
export KUBECONFIG

: "${KARGO_GIT_USERNAME:?set KARGO_GIT_USERNAME in .env (GitHub username)}"
: "${KARGO_GIT_PAT:?set KARGO_GIT_PAT in .env (PAT with Contents:read/write)}"
REPO_URL="${KARGO_GITOPS_REPO_URL:-https://github.com/rykelley/atmos-proxmox-k8s.git}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Creating Kargo Project (namespace vllm-promo)"
kubectl apply -f "${REPO_ROOT}/kargo/project.yaml"

echo "==> Waiting for the vllm-promo namespace to be created by Kargo"
for i in $(seq 1 30); do
  if kubectl get namespace vllm-promo >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
kubectl get namespace vllm-promo >/dev/null

echo "==> Creating/updating the Git credential Secret (kargo cred-type: git)"
kubectl -n vllm-promo create secret generic vllm-gitops-repo \
  --from-literal=repoURL="${REPO_URL}" \
  --from-literal=username="${KARGO_GIT_USERNAME}" \
  --from-literal=password="${KARGO_GIT_PAT}" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n vllm-promo label secret vllm-gitops-repo \
  kargo.akuity.io/cred-type=git --overwrite

echo "==> Applying the Warehouse / Stages / PromotionTask / AnalysisTemplate"
kubectl apply -f "${REPO_ROOT}/kargo/pipeline.yaml"

cat <<'EOF'

==> Done. The Kargo pipeline is live.

Open the UI:   http://10.10.1.247  (user: admin)
               fallback: kubectl -n kargo port-forward svc/kargo-api 8080:80

Promote (UI):  select project vllm-promo, drag Freight onto `staging`, wait for
               the canary + verification to pass, then promote it to `prod`.

Promote (CLI): kargo promote --project vllm-promo --stage staging --freight <id>
               kargo promote --project vllm-promo --stage prod    --freight <id>
EOF

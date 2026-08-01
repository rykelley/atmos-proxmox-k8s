#!/usr/bin/env bash
# Register cluster-B (the "edge" stage) with the hub Argo CD running on cluster-A,
# so the hub can deploy Applications onto cluster-B. This is the Kargo "prod"
# destination.
#
# It mirrors what `argocd cluster add` does, but with plain kubectl (no argocd
# CLI / login needed) and against the two local kubeconfigs:
#   1. On cluster-B: create an `argocd-manager` ServiceAccount + cluster-admin
#      ClusterRoleBinding + a long-lived token Secret.
#   2. On the hub: create an Argo CD cluster Secret (labeled secret-type=cluster)
#      pointing at cluster-B's API VIP with that token + CA.
#
# Run AFTER `atmos workflow deploy-cluster-b` and after Argo CD is up on cluster-A.
# Override any default via env vars, e.g. `CLUSTER_SERVER=https://10.10.1.50:6443`.
set -euo pipefail

EDGE_KUBECONFIG="${EDGE_KUBECONFIG:-$HOME/.kube/atmos-k3s-edge.yaml}"
HUB_KUBECONFIG="${HUB_KUBECONFIG:-$HOME/.kube/atmos-k3s.yaml}"
CLUSTER_NAME="${CLUSTER_NAME:-cluster-b}"
CLUSTER_SERVER="${CLUSTER_SERVER:-https://10.10.1.50:6443}"
ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
SA_NAME="argocd-manager"
SA_NAMESPACE="kube-system"

b64d() { python3 -c 'import sys,base64;sys.stdout.buffer.write(base64.b64decode(sys.stdin.buffer.read()))'; }

echo ">> Checking connectivity to both clusters..."
kubectl --kubeconfig "$EDGE_KUBECONFIG" version -o yaml >/dev/null
kubectl --kubeconfig "$HUB_KUBECONFIG" -n "$ARGOCD_NAMESPACE" get deploy argocd-server >/dev/null \
  || { echo "!! Argo CD not found on the hub ($HUB_KUBECONFIG, ns $ARGOCD_NAMESPACE)." >&2; exit 1; }

echo ">> [cluster-B] Creating ${SA_NAME} ServiceAccount + cluster-admin binding + token Secret..."
kubectl --kubeconfig "$EDGE_KUBECONFIG" apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${SA_NAME}
  namespace: ${SA_NAMESPACE}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${SA_NAME}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
  - kind: ServiceAccount
    name: ${SA_NAME}
    namespace: ${SA_NAMESPACE}
---
apiVersion: v1
kind: Secret
metadata:
  name: ${SA_NAME}-token
  namespace: ${SA_NAMESPACE}
  annotations:
    kubernetes.io/service-account.name: ${SA_NAME}
type: kubernetes.io/service-account-token
EOF

echo ">> [cluster-B] Waiting for the token to populate..."
TOKEN=""
for _ in $(seq 1 30); do
  TOKEN=$(kubectl --kubeconfig "$EDGE_KUBECONFIG" -n "$SA_NAMESPACE" \
    get secret "${SA_NAME}-token" -o jsonpath='{.data.token}' 2>/dev/null | b64d || true)
  [ -n "$TOKEN" ] && break
  sleep 2
done
[ -z "$TOKEN" ] && { echo "!! Token never populated on cluster-B." >&2; exit 1; }

# CA stays base64-encoded: Argo CD's tlsClientConfig.caData expects base64 PEM.
CA_DATA=$(kubectl --kubeconfig "$EDGE_KUBECONFIG" -n "$SA_NAMESPACE" \
  get secret "${SA_NAME}-token" -o jsonpath='{.data.ca\.crt}')

echo ">> [hub] Creating/updating the Argo CD cluster Secret '${CLUSTER_NAME}' -> ${CLUSTER_SERVER}..."
CONFIG_JSON=$(printf '{"bearerToken":"%s","tlsClientConfig":{"caData":"%s"}}' "$TOKEN" "$CA_DATA")
kubectl --kubeconfig "$HUB_KUBECONFIG" apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${CLUSTER_NAME}
  namespace: ${ARGOCD_NAMESPACE}
  labels:
    argocd.argoproj.io/secret-type: cluster
type: Opaque
stringData:
  name: ${CLUSTER_NAME}
  server: ${CLUSTER_SERVER}
  config: |
    ${CONFIG_JSON}
EOF

echo ">> Done. Verify in the Argo CD UI (Settings > Clusters) or with:"
echo "   KUBECONFIG=$HUB_KUBECONFIG kubectl -n $ARGOCD_NAMESPACE get secret -l argocd.argoproj.io/secret-type=cluster"

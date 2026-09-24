#!/usr/bin/env bash
# One-time Garage layout + bucket/key bootstrap for the hub cluster.
# Usage:
#   export KUBECONFIG=~/.kube/atmos-k3s.yaml
#   ./scripts/garage-bootstrap.sh
#
# Creates bucket `short-order` and prints access key material. Store app
# credentials in a per-namespace Secret named `s3-creds` (never commit them).
set -euo pipefail

NS="${GARAGE_NAMESPACE:-garage}"
BUCKET="${GARAGE_BUCKET:-short-order}"
KEY_NAME="${GARAGE_KEY_NAME:-short-order-key}"
CAPACITY="${GARAGE_CAPACITY:-50G}"
ZONE="${GARAGE_ZONE:-dc1}"

GARAGE=(/garage --allow-world-readable-secrets -c /etc/garage/garage.toml)

echo ">> Waiting for garage-0 in namespace ${NS}..."
kubectl -n "${NS}" rollout status statefulset/garage --timeout=300s
kubectl -n "${NS}" wait --for=condition=Ready pod/garage-0 --timeout=300s

NODE_ID="$(kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" status | awk '/HEALTHY NODES/{f=1;next} f && NF{print $1; exit}')"
if [[ -z "${NODE_ID}" || "${NODE_ID}" == "ID" ]]; then
  echo "!! Could not parse node id from garage status" >&2
  kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" status >&2 || true
  exit 1
fi
echo ">> Node id: ${NODE_ID}"

if kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" status | grep -q 'NO ROLE ASSIGNED'; then
  echo ">> Assigning layout ${ZONE} / ${CAPACITY}..."
  kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" layout assign -z "${ZONE}" -c "${CAPACITY}" "${NODE_ID}"
  kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" layout apply --version 1
else
  echo ">> Layout already assigned; skipping."
fi

if ! kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" bucket list | grep -qx "${BUCKET}"; then
  echo ">> Creating bucket ${BUCKET}..."
  kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" bucket create "${BUCKET}"
fi

if ! kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" key list | grep -q "${KEY_NAME}"; then
  echo ">> Creating key ${KEY_NAME} (save the secret output)..."
  kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" key create "${KEY_NAME}"
else
  echo ">> Key ${KEY_NAME} already exists; showing info..."
  kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" key info "${KEY_NAME}" || true
fi

echo ">> Allowing key on bucket..."
kubectl -n "${NS}" exec garage-0 -- "${GARAGE[@]}" bucket allow \
  --read --write --owner \
  "${BUCKET}" \
  --key "${KEY_NAME}"

LB_IP="$(kubectl -n "${NS}" get svc garage -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
echo
echo "S3 endpoint:  http://${LB_IP:-10.10.1.247}:3900"
echo "Region:       garage"
echo "Bucket:       ${BUCKET}"
echo
echo "Create app creds (example for namespace models):"
echo "  kubectl -n models create secret generic s3-creds \\"
echo "    --from-literal=AWS_ACCESS_KEY_ID='<Key ID from above>' \\"
echo "    --from-literal=AWS_SECRET_ACCESS_KEY='<Secret key from above>' \\"
echo "    --from-literal=AWS_ENDPOINT_URL='http://${LB_IP:-10.10.1.247}:3900' \\"
echo "    --from-literal=AWS_DEFAULT_REGION='garage' \\"
echo "    --from-literal=S3_BUCKET='${BUCKET}'"

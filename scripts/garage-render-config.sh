#!/usr/bin/env bash
# Render Secret garage-config (full garage.toml) for the Garage chart.
# Invoked by the helmfile garage presync hook. Never commit the rendered secret.
set -euo pipefail

NS="${GARAGE_NAMESPACE:-garage}"
REPLICATION="${GARAGE_REPLICATION_FACTOR:-1}"
REGION="${GARAGE_S3_REGION:-garage}"
ROOT_DOMAIN="${GARAGE_ROOT_DOMAIN:-.s3.lan}"

kubectl create namespace "${NS}" --dry-run=client -o yaml | kubectl apply -f -

if ! kubectl -n "${NS}" get secret garage-secrets >/dev/null 2>&1; then
  kubectl -n "${NS}" create secret generic garage-secrets \
    --from-literal=rpc-secret="$(openssl rand -hex 32)" \
    --from-literal=admin-token="$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)"
fi

b64decode() {
  openssl base64 -d -A 2>/dev/null || openssl base64 -d
}

RPC="$(kubectl -n "${NS}" get secret garage-secrets -o jsonpath='{.data.rpc-secret}' | b64decode)"
ADMIN="$(kubectl -n "${NS}" get secret garage-secrets -o jsonpath='{.data.admin-token}' | b64decode)"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

cat > "$TMP" <<EOF
metadata_dir = "/var/lib/garage/meta"
data_dir     = "/var/lib/garage/data"
db_engine    = "sqlite"
replication_factor = ${REPLICATION}

rpc_bind_addr = "0.0.0.0:3901"
rpc_public_addr = "garage.${NS}.svc.cluster.local:3901"
rpc_secret = "${RPC}"

[s3_api]
s3_region = "${REGION}"
api_bind_addr = "0.0.0.0:3900"
root_domain = "${ROOT_DOMAIN}"

[admin]
api_bind_addr = "0.0.0.0:3903"
admin_token = "${ADMIN}"
EOF

kubectl -n "${NS}" create secret generic garage-config \
  --from-file=garage.toml="$TMP" \
  --dry-run=client -o yaml | kubectl apply -f -

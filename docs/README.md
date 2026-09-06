# Monitoring (Prometheus + Grafana + Loki)

Deployed by the `monitoring` helmfile component (see
[components/helmfile/monitoring/helmfile.yaml.gotmpl](../components/helmfile/monitoring/helmfile.yaml.gotmpl)):
kube-prometheus-stack + Loki + Grafana Alloy + the local `monitoring-extras`
chart.

```bash
atmos helmfile apply monitoring -s prod
kubectl -n monitoring get pods
```

## Accessing Grafana

Grafana is exposed on a dedicated Cilium L2 LoadBalancer VIP:

- Browse to **http://10.10.1.245** and log in as `admin`.
- Anonymous **Viewer** access is enabled, so dashboards are browsable without a
  login.

The admin credentials come from the out-of-band `grafana-admin` Secret (not in
Git). Read the current password with:

```bash
kubectl -n monitoring get secret grafana-admin \
  -o jsonpath='{.data.admin-password}' | base64 -d; echo
```

Don't change the password in the UI (Grafana has no PV, so a UI change is lost
on pod recreation). Instead update the Secret and restart Grafana:

```bash
kubectl -n monitoring create secret generic grafana-admin \
  --from-literal=admin-user=admin \
  --from-literal=admin-password='<new-password>' \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n monitoring rollout restart deploy/monitoring-grafana
```

## Accessing Prometheus

Prometheus is reached through the shared cilium-ingress entrypoint
(`10.10.1.248`). Point DNS `prometheus-staging.rykelley.com -> 10.10.1.248`, or
port-forward for a quick look:

```bash
kubectl -n monitoring port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090
# then open http://localhost:9090
```

## Dashboards

The GPU/vLLM dashboards ship as sidecar-imported ConfigMaps from the
`monitoring-extras` chart
([apps/monitoring-extras/chart/dashboards/](../apps/monitoring-extras/chart/dashboards/)).
Drop any `*.json` into that directory and re-apply the component to add a
dashboard - no Helm values edit needed.

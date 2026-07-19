# Argo CD

Deployed release:

```
NAME     NAMESPACE  REVISION  UPDATED                              STATUS    CHART           APP VERSION
argocd   argocd     1         2026-07-18 20:58:55.79846 -0500 CDT  deployed  argo-cd-10.1.4  v3.4.5
```

## Accessing the Server UI

In order to access the server UI you have the following options:

1. Port-forward the Argo CD server service:

   ```bash
   kubectl port-forward service/argocd-server -n argocd 8080:443
   ```

   Then open your browser at [http://localhost:8080](http://localhost:8080) and accept the certificate.

2. Enable ingress in the values file (`server.ingress.enabled`) and either:
   - Add the annotation for SSL passthrough: <https://argo-cd.readthedocs.io/en/stable/operator-manual/ingress/#option-1-ssl-passthrough>
   - Set `configs.params."server.insecure"` in the values file and terminate SSL at your ingress: <https://argo-cd.readthedocs.io/en/stable/operator-manual/ingress/#option-2-multiple-ingress-objects-and-hosts>

## Logging In

After reaching the UI the first time you can login with username `admin` and the random password generated during the installation. You can find the password by running:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

You should delete the initial secret afterwards as suggested by the [Getting Started Guide](https://argo-cd.readthedocs.io/en/stable/getting_started/#4-login-using-the-cli).

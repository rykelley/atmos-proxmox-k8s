# Atmos-Orchestrated Proxmox k3s HA Cluster

A complete, [Atmos](https://atmos.tools/)-driven workflow that stands up a
**6-node HA [k3s](https://k3s.io/) cluster on Proxmox** using:

| Layer | Tool | What it does |
| --- | --- | --- |
| Infrastructure | **OpenTofu** (`bpg/proxmox`) | Clones 6 Ubuntu 24.04 VMs from a cloud-init template |
| Configuration | **Ansible** | OS prep, HA k3s install, `kube-vip` control-plane VIP |
| Add-ons | **Helmfile** | **Cilium** (CNI, kube-proxy replacement) + **Kyverno** (policy) |
| Orchestration | **Atmos** | Ties all three layers together via stacks + workflows |

## Topology

```
                 kube-vip control-plane VIP: 10.10.1.30  (bridged on vmbr0 / 10.10.1.0/24, gw 10.10.1.1)
                 ┌──────────────────────────────────────────────┐
  servers (HA    │  k3s-server-1  10.10.1.31  (--cluster-init)   │
  embedded etcd) │  k3s-server-2  10.10.1.32  (joins via VIP)    │
                 │  k3s-server-3  10.10.1.33  (joins via VIP)    │
                 └──────────────────────────────────────────────┘
  agents         ┌──────────────────────────────────────────────┐
  (workers)      │  k3s-agent-1   10.10.1.34                     │
                 │  k3s-agent-2   10.10.1.35                     │
                 │  k3s-agent-3   10.10.1.36                     │
                 └──────────────────────────────────────────────┘
```

- **Pod CIDR** `10.42.0.0/16`, **Service CIDR** `10.43.0.0/16` (k3s defaults; do not overlap with the node `10.10.1.0/24` network).
- k3s flags: `--flannel-backend=none --disable-network-policy --disable-kube-proxy --disable=traefik,servicelb` so Cilium fully owns networking.

## Prerequisites

1. **Tooling on your workstation**
   - [`atmos`](https://atmos.tools/install)
   - [`tofu`](https://opentofu.org/docs/intro/install/) (or set `components.terraform.command: terraform` in `atmos.yaml`)
   - [`ansible`](https://docs.ansible.com/) (`ansible`, `ansible-playbook`)
   - [`helmfile`](https://helmfile.readthedocs.io/) + [`helm`](https://helm.sh/) + the `helm-diff` plugin
   - `kubectl`, `cilium` CLI (optional, for verification)

2. **A Proxmox Ubuntu 24.04 cloud-init template** named `ubuntu-2404-cloudinit`
   (or change `template_name` in the catalog). Create one like:

   ```bash
   # On the Proxmox host
   cd /var/lib/vz/template/iso
   wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img

   qm create 9000 --name ubuntu-2404-cloudinit --memory 2048 --cores 2 \
     --net0 virtio,bridge=vmbr0 --scsihw virtio-scsi-pci
   qm importdisk 9000 noble-server-cloudimg-amd64.img local-lvm
   qm set 9000 --scsi0 local-lvm:vm-9000-disk-0
   qm set 9000 --ide2 local-lvm:cloudinit --boot c --bootdisk scsi0 --serial0 socket --vga serial0
   qm set 9000 --agent enabled=1
   qm template 9000
   ```

3. **Credentials / SSH** — copy `.env.example` to `.env`, fill it in, then:

   ```bash
   set -a; . ./.env; set +a
   ```

## Repository layout

```
atmos.yaml                        # Atmos root config (terraform/ansible/helmfile + stacks + workflows)
components/
  terraform/proxmox-vms/          # bpg/proxmox VM clones
  ansible/k3s/                    # site.yml, inventory, group_vars, roles
  helmfile/cilium/                # Cilium CNI
  helmfile/kyverno/               # Kyverno policy engine + starter policies
stacks/
  catalog/cluster.yaml            # single source of truth (nodes, VIP, CIDRs, Proxmox params)
  deploy/prod/cluster.yaml        # prod stack wiring all 4 components
  workflows/cluster.yaml          # deploy-cluster / destroy-cluster
```

## Deploy

End-to-end with the Atmos workflow:

```bash
atmos workflow deploy-cluster -f cluster
```

Or step by step:

```bash
# 1. Create the VMs
atmos terraform apply proxmox-vms -s prod

# 2. Install HA k3s + kube-vip
atmos ansible playbook k3s -s prod

# 3. Networking + policy
atmos helmfile apply cilium -s prod
atmos helmfile apply kyverno -s prod
```

After Ansible runs, a kubeconfig pointing at the VIP is written to
`components/ansible/k3s/fetched/kubeconfig`. Point `kubectl`/`helmfile` at it:

```bash
export KUBECONFIG=$PWD/components/ansible/k3s/fetched/kubeconfig
kubectl get nodes -o wide
```

## Configuration

All cluster-wide settings live in
[`stacks/catalog/cluster.yaml`](stacks/catalog/cluster.yaml): node names/IPs/VMIDs,
the control-plane VIP, network gateway/bridge, and the pod/service CIDRs. The
`prod` stack ([`stacks/deploy/prod/cluster.yaml`](stacks/deploy/prod/cluster.yaml))
imports it and passes the values down to every component, so there is one place
to edit when adapting this to your environment.

## Secrets

- **Proxmox** endpoint/token → environment variables (see `.env.example`).
- **k3s join token** → encrypted with Ansible Vault in
  [`components/ansible/k3s/group_vars/all/vault.yml`](components/ansible/k3s/group_vars/all/vault.yml).
  Replace the placeholder and re-encrypt:

  ```bash
  ansible-vault encrypt components/ansible/k3s/group_vars/all/vault.yml
  ```

Nothing sensitive is committed; `.gitignore` excludes state, kubeconfig, and `.env`.

## Teardown

```bash
atmos workflow destroy-cluster -f cluster
```

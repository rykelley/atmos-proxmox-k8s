# Phase 0 — GPU check

## Goal

Prove that `[k3s-1]` can schedule a Pod onto the Blackwell node using the
extended resource `nvidia.com/gpu`, and that the container can see the card
via `nvidia-smi`.

## Done when

```bash
kubectl --context k3s-1 logs gpu-check
```

shows **NVIDIA RTX PRO 2000 Blackwell** (or similar product string) in the
`nvidia-smi` table, and the Pod phase is `Succeeded`.

## What the NVIDIA device plugin advertises

The NVIDIA device plugin (DaemonSet under `gpu-operator`) runs on each GPU
node and talks to the kubelet:

1. It discovers GPUs on the host (via driver/`nvidia-smi` / NVML).
2. It reports them to the kubelet as an **extended resource** named
   `nvidia.com/gpu`.
3. The kubelet publishes that on the Node object under **Capacity** and
   **Allocatable** (for example `nvidia.com/gpu: 1` on `k3s-gpu1`).

Those values are what `kubectl describe node k3s-gpu1` shows. Labels such as
`nvidia.com/gpu.product=...` and `nvidia.com/gpu.present=true` are metadata
for humans and for affinity; the **scheduler matches on the resource name
and count**, not on those labels alone.

This phase does **not** install or change the GPU Operator / device plugin.

## How the scheduler matches the request

When you create `gpu-check.yaml`:

1. The Pod asks for `resources.limits["nvidia.com/gpu"] = 1` (for this
   extended resource, Kubernetes treats the limit as the request).
2. The default scheduler filters nodes: only nodes with **enough free**
   `nvidia.com/gpu` remain candidates.
3. It also honors **taints/tolerations**. `k3s-gpu1` has
   `nvidia.com/gpu=present:NoSchedule`, so the Pod must tolerate that or it
   will never schedule there even if a GPU is free.
4. After binding, the device plugin **allocates** a specific GPU to the Pod
   and the `nvidia` RuntimeClass makes the device nodes visible inside the
   container so `nvidia-smi` works.

If every GPU on the node is already allocated (for example to vLLM), the Pod
stays `Pending` with `Insufficient nvidia.com/gpu` until something releases a
GPU. That is expected scheduler behavior, not a missing device plugin.

## Apply (context `k3s-1` only)

```bash
kubectl --context k3s-1 apply -f phase-0/gpu-check.yaml
kubectl --context k3s-1 wait --for=jsonpath='{.status.phase}'=Succeeded pod/gpu-check --timeout=120s
kubectl --context k3s-1 logs gpu-check
```

Cleanup when finished:

```bash
kubectl --context k3s-1 delete pod gpu-check
```

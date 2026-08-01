#!/usr/bin/env bash
# Create the `ubuntu-2404-cloudinit` template that the proxmox-vms Terraform
# component clones from. Run this ON the Proxmox host (as root) that lacks the
# template — e.g. the standalone cluster-B host pve2 (10.10.1.82):
#
#   scp scripts/create-ubuntu-template.sh root@10.10.1.82:/tmp/
#   ssh root@10.10.1.82 'bash /tmp/create-ubuntu-template.sh'
#
# Idempotent-ish: it refuses to clobber an existing VMID. Override any default
# via environment variables, e.g. `TEMPLATE_VMID=9001 DATASTORE=local-lvm ...`.
set -euo pipefail

# --- Config (matches stacks/catalog/cluster-edge.yaml) ---
TEMPLATE_VMID="${TEMPLATE_VMID:-9000}"
TEMPLATE_NAME="${TEMPLATE_NAME:-ubuntu-2404-cloudinit}"
DATASTORE="${DATASTORE:-local-lvm}"        # where the template disk lives
SNIPPETS_DATASTORE="${SNIPPETS_DATASTORE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"
IMAGE_URL="${IMAGE_URL:-https://cloud-images.ubuntu.com/releases/24.04/release/ubuntu-24.04-server-cloudimg-amd64.img}"
WORKDIR="${WORKDIR:-/var/lib/vz/template/iso}"

IMAGE_FILE="${WORKDIR}/$(basename "${IMAGE_URL}")"

echo ">> Creating Proxmox template '${TEMPLATE_NAME}' (VMID ${TEMPLATE_VMID}) on $(hostname)"

if qm status "${TEMPLATE_VMID}" >/dev/null 2>&1; then
  echo "!! VMID ${TEMPLATE_VMID} already exists. Set TEMPLATE_VMID to a free id or remove it first." >&2
  exit 1
fi

mkdir -p "${WORKDIR}"
if [[ ! -f "${IMAGE_FILE}" ]]; then
  echo ">> Downloading Ubuntu 24.04 cloud image..."
  # qemu-guest-agent is installed via cloud-init below; the base image is minimal.
  wget -O "${IMAGE_FILE}" "${IMAGE_URL}"
fi

echo ">> Creating VM shell..."
qm create "${TEMPLATE_VMID}" \
  --name "${TEMPLATE_NAME}" \
  --memory 2048 \
  --cores 2 \
  --cpu host \
  --net0 "virtio,bridge=${BRIDGE}" \
  --ostype l26 \
  --agent enabled=1 \
  --serial0 socket \
  --vga serial0

echo ">> Importing cloud image disk to ${DATASTORE}..."
qm importdisk "${TEMPLATE_VMID}" "${IMAGE_FILE}" "${DATASTORE}"

echo ">> Attaching disk + cloud-init drive..."
qm set "${TEMPLATE_VMID}" --scsihw virtio-scsi-pci --scsi0 "${DATASTORE}:vm-${TEMPLATE_VMID}-disk-0"
qm set "${TEMPLATE_VMID}" --ide2 "${DATASTORE}:cloudinit"
qm set "${TEMPLATE_VMID}" --boot c --bootdisk scsi0

echo ">> Converting to template..."
qm template "${TEMPLATE_VMID}"

echo ">> Done. Terraform can now clone '${TEMPLATE_NAME}' by name (template_id: 0)."
echo "   Ensure the '${SNIPPETS_DATASTORE}' datastore has the 'snippets' content type enabled in the Proxmox UI."

# The bpg/proxmox provider reads its connection settings from environment
# variables, so no credentials are hard-coded here:
#   PROXMOX_VE_ENDPOINT, PROXMOX_VE_API_TOKEN (or USERNAME/PASSWORD),
#   PROXMOX_VE_INSECURE, PROXMOX_VE_SSH_USERNAME
#
# See .env.example for the full list.
provider "proxmox" {
  # Endpoint/credentials intentionally sourced from the environment.
  # The ssh block lets the provider upload cloud-init snippets when needed.
  ssh {
    agent = true
  }
}

variable "stage" {
  type        = string
  description = "Atmos stage (environment) name. Injected by the stack; used for tagging/naming context."
  default     = ""
}

variable "target_node" {
  type        = string
  description = "Name of the Proxmox node (PVE host) to create the VMs on."
}

variable "template_name" {
  type        = string
  description = "Name of the existing Ubuntu 24.04 cloud-init template to clone from."
}

variable "template_id" {
  type        = number
  description = "Optional VMID of the template to clone. If 0, clone by name via template_name."
  default     = 0
}

variable "datastore_id" {
  type        = string
  description = "Proxmox datastore ID for VM disks (e.g. local-lvm, ceph)."
  default     = "local-lvm"
}

variable "snippets_datastore_id" {
  type        = string
  description = "Datastore ID that has the 'snippets' content type enabled (for cloud-init)."
  default     = "local"
}

variable "bridge" {
  type        = string
  description = "Linux bridge the VM NIC attaches to (control-plane/network bridge)."
  default     = "vmbr0"
}

variable "vlan_id" {
  type        = number
  description = "Optional VLAN tag for the VM NIC. 0 = no VLAN tag."
  default     = 0
}

variable "gateway" {
  type        = string
  description = "Default gateway for the node network."
  default     = "10.10.1.1"
}

variable "netmask" {
  type        = number
  description = "CIDR prefix length for the node network."
  default     = 24
}

variable "dns_servers" {
  type        = list(string)
  description = "DNS servers configured on the VMs via cloud-init."
  default     = ["1.1.1.1", "8.8.8.8"]
}

variable "dns_domain" {
  type        = string
  description = "DNS search domain for the VMs."
  default     = "lan"
}

variable "ssh_public_keys" {
  type        = list(string)
  description = "SSH public keys injected into the default cloud-init user."
}

variable "ci_user" {
  type        = string
  description = "Default cloud-init username created on each VM."
  default     = "ubuntu"
}

variable "vm_defaults" {
  type = object({
    cores     = number
    sockets   = number
    memory    = number # MiB
    disk_size = number # GiB
    cpu_type  = string
    os_type   = string
    started   = bool
    on_boot   = bool
    agent     = bool
  })
  description = "Default hardware settings applied to every node unless overridden per-node."
  default = {
    cores     = 2
    sockets   = 1
    memory    = 4096
    disk_size = 40
    cpu_type  = "host"
    os_type   = "l26"
    started   = true
    on_boot   = true
    agent     = true
  }
}

variable "nodes" {
  description = <<-EOT
    Map of cluster nodes keyed by hostname. Each node defines its role,
    static IP (without prefix), VMID, and optional hardware overrides.
  EOT
  type = map(object({
    role      = string # "server" or "agent"
    ip        = string # e.g. "10.10.1.31"
    vmid      = number
    cores     = optional(number)
    sockets   = optional(number)
    memory    = optional(number)
    disk_size = optional(number)
  }))
}

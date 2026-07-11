locals {
  # Merge per-node hardware overrides on top of vm_defaults.
  nodes = {
    for name, n in var.nodes : name => {
      role      = n.role
      ip        = n.ip
      vmid      = n.vmid
      cores     = coalesce(n.cores, var.vm_defaults.cores)
      sockets   = coalesce(n.sockets, var.vm_defaults.sockets)
      memory    = coalesce(n.memory, var.vm_defaults.memory)
      disk_size = coalesce(n.disk_size, var.vm_defaults.disk_size)
    }
  }
}

resource "proxmox_virtual_environment_vm" "node" {
  for_each = local.nodes

  name        = each.key
  description = "k3s ${each.value.role} node (managed by Atmos/OpenTofu)"
  tags        = ["atmos", "k3s", each.value.role]
  node_name   = var.target_node
  vm_id       = each.value.vmid

  on_boot = var.vm_defaults.on_boot
  started = var.vm_defaults.started

  agent {
    enabled = var.vm_defaults.agent
  }

  clone {
    vm_id = var.template_id != 0 ? var.template_id : data.proxmox_virtual_environment_vms.template[0].vms[0].vm_id
    full  = true
  }

  cpu {
    cores = each.value.cores
    type  = var.vm_defaults.cpu_type
  }

  memory {
    dedicated = each.value.memory
  }

  operating_system {
    type = var.vm_defaults.os_type
  }

  disk {
    datastore_id = var.datastore_id
    interface    = "scsi0"
    size         = each.value.disk_size
    file_format  = "raw"
    iothread     = true
    discard      = "on"
  }

  network_device {
    bridge  = var.bridge
    model   = "virtio"
    vlan_id = var.vlan_id != 0 ? var.vlan_id : null
  }

  initialization {
    datastore_id = var.datastore_id

    dns {
      servers = var.dns_servers
      domain  = var.dns_domain
    }

    ip_config {
      ipv4 {
        address = "${each.value.ip}/${var.netmask}"
        gateway = var.gateway
      }
    }

    user_account {
      username = var.ci_user
      keys     = var.ssh_public_keys
    }
  }

  lifecycle {
    ignore_changes = [
      # The cloud-init user password/network can drift after first boot.
      initialization[0].user_account[0].password,
    ]
  }
}

# Resolve the template VMID by name when template_id is not provided.
data "proxmox_virtual_environment_vms" "template" {
  count = var.template_id == 0 ? 1 : 0

  node_name = var.target_node

  filter {
    name   = "name"
    values = [var.template_name]
  }

  filter {
    name   = "template"
    values = ["true"]
  }
}

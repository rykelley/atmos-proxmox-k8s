output "node_ips" {
  description = "Map of node hostname => static IPv4 address."
  value       = { for name, n in local.nodes : name => n.ip }
}

output "servers" {
  description = "List of control-plane (server) node hostnames."
  value       = [for name, n in local.nodes : name if n.role == "server"]
}

output "agents" {
  description = "List of worker (agent) node hostnames."
  value       = [for name, n in local.nodes : name if n.role == "agent"]
}

output "vm_ids" {
  description = "Map of node hostname => Proxmox VMID."
  value       = { for name, vm in proxmox_virtual_environment_vm.node : name => vm.vm_id }
}

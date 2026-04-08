#!/bin/bash
# Configure libvirt networking for guest VMs
set -u

echo "[1/3] Checking default network..."
if virsh net-info default 2>/dev/null | grep -q "Active.*yes"; then
  echo "Default network already active"
else
  echo "Starting default network..."
  virsh net-start default 2>/dev/null || true
  virsh net-autostart default
fi

echo "[2/3] Enabling IP forwarding..."
sysctl -w net.ipv4.ip_forward=1
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

echo "[3/3] Network summary"
virsh net-list --all
echo ""
echo "Default network DHCP range:"
virsh net-dumpxml default 2>/dev/null | grep -A2 "dhcp" || echo "  (check with: virsh net-dumpxml default)"

echo ""
echo "Networking configuration complete"

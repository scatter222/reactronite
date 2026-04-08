#!/bin/bash
# Install and configure KVM/libvirt for nested virtualisation
# Supports Oracle Linux 9 / RHEL-based and Debian-based systems
set -u

echo "[1/6] Verifying CPU virtualisation support..."
if ! grep -Ec '(vmx|svm)' /proc/cpuinfo > /dev/null 2>&1; then
  echo "WARNING: CPU does not report vmx/svm — nested virt may not work"
else
  echo "OK — CPU virtualisation extensions detected"
fi

echo "[2/6] Installing KVM and libvirt packages..."
if command -v dnf &>/dev/null; then
  dnf install -y \
    qemu-kvm \
    libvirt \
    libvirt-client \
    virt-install \
    virt-manager \
    genisoimage \
    sshpass \
    nmap-ncat \
    edk2-ovmf
elif command -v apt-get &>/dev/null; then
  apt-get update
  apt-get install -y \
    qemu-kvm \
    libvirt-daemon-system \
    libvirt-clients \
    bridge-utils \
    virtinst \
    virt-manager \
    cpu-checker \
    cloud-image-utils \
    genisoimage \
    sshpass \
    netcat-openbsd \
    ovmf
fi

echo "[3/6] Enabling and starting libvirtd..."
systemctl enable --now libvirtd
systemctl start libvirtd

echo "[4/6] Adding admin user to libvirt/kvm groups..."
usermod -aG libvirt azureuser
usermod -aG kvm azureuser

echo "[5/6] Verifying KVM..."
if command -v kvm-ok &>/dev/null; then
  kvm-ok || echo "WARNING: kvm-ok reports issues — check nested virt settings"
else
  lsmod | grep kvm && echo "OK — KVM modules loaded" || echo "WARNING: KVM modules not loaded"
fi

echo "[6/6] Setting up default storage pool..."
if ! virsh pool-info default 2>/dev/null; then
  virsh pool-define-as default dir --target /var/lib/libvirt/images
  virsh pool-autostart default
  virsh pool-start default
  echo "Default storage pool created"
else
  echo "Default storage pool already exists"
fi

echo ""
echo "KVM installation complete"
virsh version

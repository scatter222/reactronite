#!/bin/bash
# Install a lightweight desktop environment + xrdp for remote desktop access
# Supports Oracle Linux 9 / RHEL-based and Debian-based systems
set -u

APP_USER="azureuser"

if command -v dnf &>/dev/null; then
  echo "[1/5] Installing EPEL and XFCE desktop environment..."
  dnf install -y epel-release 2>&1 || true
  dnf groupinstall -y "Xfce" 2>&1
  dnf install -y xfce4-terminal dbus-x11 xorg-x11-server-Xorg xorg-x11-xinit xorg-x11-xauth 2>&1

  echo "[2/5] Installing xrdp..."
  dnf install -y xrdp

  echo "[3/5] Configuring xrdp to use XFCE..."
  echo "startxfce4" > /home/${APP_USER}/.xsession
  chown ${APP_USER}:${APP_USER} /home/${APP_USER}/.xsession

  # Ensure startwm.sh launches XFCE
  if grep -q 'exec /bin/sh' /etc/xrdp/startwm.sh; then
    sed -i '/^exec \/bin\/sh/d' /etc/xrdp/startwm.sh
    sed -i '/^test -x \/etc\/X11/d' /etc/xrdp/startwm.sh
    echo "startxfce4" >> /etc/xrdp/startwm.sh
  fi

  echo "[4/5] Setting password for ${APP_USER} (needed for RDP login)..."
  echo "${APP_USER}:test123" | chpasswd

  echo "[5/5] Enabling and starting xrdp..."
  systemctl enable xrdp
  systemctl restart xrdp

  # Open firewall port for RDP
  firewall-cmd --permanent --add-port=3389/tcp 2>/dev/null && firewall-cmd --reload 2>/dev/null || true

elif command -v apt-get &>/dev/null; then
  echo "[1/5] Installing XFCE desktop environment..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    xfce4 xfce4-goodies xfce4-terminal dbus-x11 x11-xserver-utils

  echo "[2/5] Installing xrdp..."
  apt-get install -y xrdp

  echo "[3/5] Configuring xrdp to use XFCE..."
  echo "startxfce4" > /home/${APP_USER}/.xsession
  chown ${APP_USER}:${APP_USER} /home/${APP_USER}/.xsession
  sed -i 's|^test -x /etc/X11/Xsession.*|startxfce4|' /etc/xrdp/startwm.sh
  sed -i 's|^exec /bin/sh.*|startxfce4|' /etc/xrdp/startwm.sh

  echo "[4/5] Setting password for ${APP_USER} (needed for RDP login)..."
  echo "${APP_USER}:test123" | chpasswd

  echo "[5/5] Enabling and starting xrdp..."
  systemctl enable xrdp
  systemctl restart xrdp
fi

echo ""
echo "Desktop installation complete"
echo "Connect via RDP to port 3389"
echo "  Username: ${APP_USER}"
echo "  Password: test123"

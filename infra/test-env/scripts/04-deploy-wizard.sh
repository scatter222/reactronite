#!/bin/bash
# Deploy the wizard Electron app and configure autostart
# Supports Oracle Linux 9 / RHEL-based systems
set -eu

INSTALL_DIR="/opt/wizard"
APP_USER="azureuser"
APP_OUT_DIR="${INSTALL_DIR}/out/Installation Wizard-linux-x64"

echo "[1/8] Installing Node.js 22 LTS from NodeSource..."
NODE_MAJOR=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  if command -v dnf &>/dev/null; then
    dnf remove -y nodejs npm nodejs-libs nodejs-full-i18n nodejs-docs 2>/dev/null || true
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    dnf install -y nodejs
  elif command -v apt-get &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi
fi
echo "Node: $(node --version)"

echo "[2/8] Installing pnpm..."
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm@latest
fi
echo "pnpm: $(pnpm --version)"

echo "[3/8] Copying wizard app to ${INSTALL_DIR}..."
mkdir -p ${INSTALL_DIR}
if [ -d /tmp/wizard-app ]; then
  cp -a /tmp/wizard-app/. ${INSTALL_DIR}/
  # Ensure dotfiles are copied (scp sometimes misses them)
  for f in /tmp/wizard-app/.*; do
    [ -f "$f" ] && cp "$f" ${INSTALL_DIR}/
  done
  chown -R ${APP_USER}:${APP_USER} ${INSTALL_DIR}
else
  echo "ERROR: /tmp/wizard-app not found — upload the app first"
  exit 1
fi

echo "[4/8] Installing dependencies..."
cd ${INSTALL_DIR}
# Verify .npmrc has node-linker=hoisted (required by electron-forge with pnpm)
if ! grep -q 'node-linker=hoisted' .npmrc 2>/dev/null; then
  echo "node-linker=hoisted" >> .npmrc
fi
sudo -u ${APP_USER} pnpm install --frozen-lockfile 2>&1 || sudo -u ${APP_USER} pnpm install 2>&1
# Approve native build scripts needed by the app
sudo -u ${APP_USER} pnpm approve-builds @tailwindcss/oxide esbuild unrs-resolver 2>&1 || true
sudo -u ${APP_USER} pnpm install 2>&1

echo "[5/8] Packaging Electron app..."
sudo -u ${APP_USER} pnpm run package 2>&1

echo "[6/8] Ensuring binary is executable..."
chmod +x "${APP_OUT_DIR}/Installation Wizard"

echo "[7/8] Configuring autostart on login..."
AUTOSTART_DIR="/home/${APP_USER}/.config/autostart"
mkdir -p ${AUTOSTART_DIR}

cat > ${AUTOSTART_DIR}/kvm-wizard.desktop << 'DESKTOP'
[Desktop Entry]
Type=Application
Name=KVM Environment Setup
Comment=Configure KVM virtualisation environment
Exec="/opt/wizard/out/Installation Wizard-linux-x64/Installation Wizard" --no-sandbox
Terminal=false
X-GNOME-Autostart-enabled=true
DESKTOP

chmod +x ${AUTOSTART_DIR}/kvm-wizard.desktop
chown -R ${APP_USER}:${APP_USER} /home/${APP_USER}/.config

# Symlink config files and VM XML definitions into the packaged app dir
ln -sf ${INSTALL_DIR}/installer-config.json "${APP_OUT_DIR}/installer-config.json"
ln -sf ${INSTALL_DIR}/vm-config.json "${APP_OUT_DIR}/vm-config.json" 2>/dev/null || true
ln -sf ${INSTALL_DIR}/splunk.xml "${APP_OUT_DIR}/splunk.xml" 2>/dev/null || true
ln -sf ${INSTALL_DIR}/freeipa.xml "${APP_OUT_DIR}/freeipa.xml" 2>/dev/null || true

echo "[8/8] Installing sudoers rules..."
cp ${INSTALL_DIR}/deploy/wizard-sudoers /etc/sudoers.d/wizard-nopasswd
chmod 440 /etc/sudoers.d/wizard-nopasswd

echo ""
echo "=========================================="
echo "Wizard deployment complete!"
echo "The wizard will auto-launch on RDP login."
echo "=========================================="

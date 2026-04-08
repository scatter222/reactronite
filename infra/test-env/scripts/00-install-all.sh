#!/bin/bash
# Master installation script — runs all setup steps in order
set -u

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

# Log everything
exec > >(tee -a /opt/install/installation.log)
exec 2>&1

echo "=========================================="
echo "Reactronite KVM Host — Full Setup"
echo "Started: $(date)"
echo "=========================================="

echo ""
echo "--- Step 1/4: Install KVM ---"
bash ${SCRIPTS_DIR}/01-install-kvm.sh

echo ""
echo "--- Step 2/4: Configure Networking ---"
bash ${SCRIPTS_DIR}/02-configure-networking.sh

echo ""
echo "--- Step 3/4: Install Desktop + xrdp ---"
bash ${SCRIPTS_DIR}/03-install-desktop.sh

echo ""
echo "--- Step 4/4: Deploy Wizard App ---"
bash ${SCRIPTS_DIR}/04-deploy-wizard.sh

echo ""
echo "=========================================="
echo "SETUP COMPLETE — $(date)"
echo "=========================================="
echo ""
echo "RDP to this machine and the wizard will auto-launch."
echo "  Username: azureuser"
echo "  Password: test123"
echo ""
echo "Full log: /opt/install/installation.log"

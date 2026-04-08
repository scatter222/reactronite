# Reactronite

Environment provisioning and configuration platform.

## Structure

```
apps/wizard/        # Electron + React desktop app — installation wizard & VM manager
infra/test-env/     # Terraform — Azure VM with nested KVM for dev/testing
```

## Apps

### Installation Wizard (`apps/wizard/`)

Electron desktop app for standing up, configuring, and managing KVM virtual machines via libvirt. Includes a guided installer wizard and a VM management dashboard.

```bash
cd apps/wizard
pnpm install
pnpm dev
```

See [apps/wizard/docs/](apps/wizard/docs/) for detailed documentation.

## Infrastructure

### Test Environment (`infra/test-env/`)

Terraform config that deploys an Azure VM (D4s_v5) with nested virtualisation enabled, running Ubuntu 24.04 with KVM/libvirt pre-installed via cloud-init. Use this as a dev/test target for the wizard app.

```bash
cd infra/test-env
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your Azure subscription ID and SSH key
terraform init
terraform plan
terraform apply
```

Once deployed, SSH in and use the wizard app to manage VMs on the host.

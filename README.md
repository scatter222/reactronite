# Reactronite

Environment provisioning and configuration platform.

## Structure

```
apps/wizard/        # Electron + React desktop app — installation wizard & VM manager
packages/ui/        # Shared React component library (buttons, inputs, design tokens)
infra/test-env/     # Terraform — Azure VM with nested KVM for dev/testing
```

This is an **npm workspace**. Run `npm install` from the repository root, not
from inside an app — installing from an app directory skips the workspace and
won't link shared packages.

```bash
npm install
npm run dev            # runs apps/wizard
```

## Apps

### Installation Wizard (`apps/wizard/`)

Electron desktop app for standing up, configuring, and managing KVM virtual machines via libvirt. Includes a guided installer wizard and a VM management dashboard.

```bash
npm install        # from the repository root
npm run dev
```

See [apps/wizard/docs/](apps/wizard/docs/) for detailed documentation.

### Shared UI (`packages/ui/`)

Components shared across Electron apps, imported as `#ui`:

```tsx
import { Button, Input } from '#ui';
```

See [packages/ui/README.md](packages/ui/README.md) — it covers how the alias is
wired, the Tailwind v4 and Electron packaging gotchas that come with shared
packages, and how to add a second app.

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

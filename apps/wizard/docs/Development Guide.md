# Development Guide

## Prerequisites

- **Node.js** (compatible with Electron 37)
- **pnpm** 10.11.0+
- For VM features: **libvirt**, **QEMU**, **virsh** installed on the host

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development mode (with HMR)
pnpm dev
```

This launches the Electron app with:
- Hot module replacement for the renderer (React)
- Hot restart for the main process
- React Developer Tools auto-installed
- TypeScript type checking via vite-plugin-checker

## Available Scripts

| Script | Purpose |
|--------|---------|
| `pnpm dev` | Development mode with HMR |
| `pnpm package` | Package the app (no distributable) |
| `pnpm make` | Create platform-specific distributables |
| `pnpm publish` | Publish to configured publishers |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm clean` | Remove node_modules, .vite, lockfile |

## Versioning

Uses `standard-version` for semantic versioning:

```bash
pnpm release           # Auto-detect version bump
pnpm major             # Major version bump (1.0.0 → 2.0.0)
pnpm minor             # Minor version bump (1.0.0 → 1.1.0)
pnpm patch             # Patch version bump (1.0.0 → 1.0.1)
pnpm push-release      # Push tags to origin
```

## Code Quality

### Linting

ESLint 9 with `neostandard` config. Enforced via:
- `pnpm lint` / `pnpm lint:fix`
- Pre-commit hook via `husky` + `lint-staged`

### Commits

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) format, enforced by `commitlint`:

```
feat: add VM snapshot support
fix: correct SSH timeout handling
chore: update dependencies
```

## Path Aliases

The `@/` alias maps to `./src/`:

```typescript
import { Button } from '@/app/components/ui/button';
import { registerMenuIpc } from '@/ipc/menuIPC';
```

This works in both main and renderer processes via `vite-tsconfig-paths`.

## Platform Defines

These compile-time constants are available in the renderer:

```typescript
__DARWIN__  // true on macOS
__WIN32__   // true on Windows
__LINUX__   // true on Linux
__DEV__     // true in development
```

Use them for platform-specific code:

```typescript
if (__WIN32__) {
  // Windows-only UI
}
```

## Configuration Files

For testing the installer and VM features:

- **`installer-config.json`** - Basic installer config
- **`installer-config-advanced.json`** - Advanced installer config (loaded first)
- **`vm-config.json`** - VM definitions
- **`vm-config.example.json`** - Example/reference VM config

## Building for Distribution

```bash
# Create distributables for current platform
pnpm make
```

Output formats:
- Windows: `.exe` (Squirrel installer)
- macOS: `.zip`
- Linux: `.deb` and `.rpm`

## Related Pages

- [[Build Configuration]] - Detailed build config
- [[Tech Stack]] - All dependencies
- [[Project Structure]] - File organization

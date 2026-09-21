# Development Guide

## Prerequisites

- **Node.js** (compatible with Electron 37)
- **npm** 10+ (workspaces)
- For VM features: **libvirt**, **QEMU**, **virsh** installed on the host

## Getting Started

```bash
# Install dependencies from the REPOSITORY ROOT — this is an npm workspace.
# Installing from apps/wizard skips the workspace and won't link packages/ui.
cd /path/to/reactronite
npm install

# Start development mode (with HMR)
npm run dev
```

This launches the Electron app with:
- Hot module replacement for the renderer (React)
- Hot restart for the main process
- React Developer Tools auto-installed
- TypeScript type checking via vite-plugin-checker

## Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Development mode with HMR |
| `npm run package` | Package the app (no distributable) |
| `npm run make` | Create platform-specific distributables |
| `npm run publish` | Publish to configured publishers |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run clean` | Remove node_modules and .vite |

## Versioning

Uses `standard-version` for semantic versioning:

```bash
npm run release           # Auto-detect version bump
npm run major             # Major version bump (1.0.0 → 2.0.0)
npm run minor             # Minor version bump (1.0.0 → 1.1.0)
npm run patch             # Patch version bump (1.0.0 → 1.0.1)
npm run push-release      # Push tags to origin
```

## Code Quality

### Linting

ESLint 9 with `neostandard` config. Enforced via:
- `npm run lint` / `npm run lint:fix`
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
npm run make
```

Output formats:
- Windows: `.exe` (Squirrel installer)
- macOS: `.zip`
- Linux: `.deb` and `.rpm`

## Related Pages

- [[Build Configuration]] - Detailed build config
- [[Tech Stack]] - All dependencies
- [[Project Structure]] - File organization

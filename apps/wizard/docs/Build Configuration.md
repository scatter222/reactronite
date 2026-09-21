# Build Configuration

The project uses **Vite** as the build tool with **Electron Forge** for packaging. There are four Vite configs, one for each build target.

## Vite Configs

All configs live in the `config/` directory.

### Base Config (`config/vite.base.config.ts`)

Shared settings inherited by all other configs:

- **Externals:** electron, all Node.js builtins, and npm dependencies are externalized (not bundled)
- **Output:** `.vite/build/`
- **Minification:** Enabled in production

### Main Process (`config/vite.main.config.ts`)

Builds `src/main.ts` as a library for the Electron main process.

- Library build mode
- Hot reload plugin for development
- Entry: `src/main.ts`

### Preload Script (`config/vite.preload.config.ts`)

Builds `src/preload.ts` separately (required by Electron's context isolation).

- Library build mode
- Entry: `src/preload.ts`

### Renderer Process (`config/vite.renderer.config.ts`)

Builds the React application for the Chromium renderer.

**Plugins:**
- `@vitejs/plugin-react` - JSX transform and fast refresh
- `@tailwindcss/vite` - TailwindCSS
- `vite-plugin-svgr` - SVG as React components
- `vite-plugin-checker` - TypeScript checking in dev
- `vite-tsconfig-paths` - Path alias resolution

**Path Aliases:**
```
@/* → ./src/*
```

**Platform Defines:**
```typescript
__DARWIN__  // process.platform === 'darwin'
__WIN32__   // process.platform === 'win32'
__LINUX__   // process.platform === 'linux'
__DEV__     // NODE_ENV !== 'production'
```

These are compile-time constants that enable dead-code elimination for platform-specific code.

## Electron Forge (`forge.config.ts`)

### Packager Config

```typescript
{
  asar: true,                    // Package into asar archive
  executableName: productName,   // "Installation Wizard"
  icon: 'assets/icons/icon'     // App icon (without extension)
}
```

### Build Entries

```typescript
build: [
  { entry: 'src/main.ts',    config: 'config/vite.main.config.ts' },
  { entry: 'src/preload.ts', config: 'config/vite.preload.config.ts' }
],
renderer: [
  { name: 'main_window', config: 'config/vite.renderer.config.ts' }
]
```

### Makers (Distributables)

| Maker | Output | Platform |
|-------|--------|----------|
| MakerSquirrel | `.exe` installer | Windows |
| MakerZIP | `.zip` archive | macOS |
| MakerRpm | `.rpm` package | Linux (RPM-based) |
| MakerDeb | `.deb` package | Linux (Debian-based) |

### Security Fuses

Electron fuses are flipped at package time for hardened security:

| Fuse | Value | Effect |
|------|-------|--------|
| RunAsNode | `false` | Prevents `ELECTRON_RUN_AS_NODE` abuse |
| EnableCookieEncryption | `true` | Encrypts cookies |
| EnableNodeOptionsEnvironmentVariable | `false` | Blocks `NODE_OPTIONS` |
| EnableNodeCliInspectArguments | `false` | Blocks `--inspect` |
| EnableEmbeddedAsarIntegrityValidation | `true` | Validates asar integrity |
| OnlyLoadAppFromAsar | `true` | Only loads from asar (not loose files) |

## TypeScript (`tsconfig.json`)

Key settings:
- Target: ES2022
- Module: ES2022 (ESM)
- Path aliases: `@/*` → `./src/*`
- Strict mode enabled

## NPM Scripts

```bash
npm run dev          # Start dev server with HMR
npm run package      # Package app (no distributable)
npm run make         # Create platform distributables
npm run publish      # Publish to configured publishers
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run clean        # Remove node_modules and .vite
npm run release      # Bump version with standard-version
npm run major/minor/patch  # Version bump shortcuts
```

## Related Pages

- [[Tech Stack]] - Full dependency list
- [[Development Guide]] - How to use these scripts
- [[Security Model]] - Fuse details

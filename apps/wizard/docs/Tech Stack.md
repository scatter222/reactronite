# Tech Stack

## Core Framework

| Technology | Version | Purpose |
|------------|---------|---------|
| Electron | 37.2.5 | Desktop application shell |
| React | 19.1.1 | UI framework |
| TypeScript | 5.8.3 | Type-safe JavaScript |
| Vite | 7.0.6 | Build tool and dev server |
| Electron Forge | 7.8.2 | Packaging, making, and publishing |

## UI & Styling

| Technology | Purpose |
|------------|---------|
| TailwindCSS 4.1.11 | Utility-first CSS |
| Radix UI | Accessible UI primitives (dropdown-menu, slot) |
| Lucide React | Icon library |
| class-variance-authority | Component variant system |
| clsx + tailwind-merge | Conditional class merging |
| tw-animate-css | Tailwind animation utilities |

## Build & Development

| Tool | Purpose |
|------|---------|
| pnpm 10.11.0 | Package manager |
| ESLint 9 + neostandard | Linting |
| Husky 9.1.7 | Git hooks |
| lint-staged | Pre-commit linting |
| commitlint | Conventional commit enforcement |
| standard-version | Automated versioning and changelogs |
| cross-env | Cross-platform env vars |

## Vite Plugins

| Plugin | Purpose |
|--------|---------|
| `@vitejs/plugin-react` | React JSX transform and fast refresh |
| `@tailwindcss/vite` | TailwindCSS integration |
| `vite-plugin-checker` | TypeScript type checking in dev |
| `vite-plugin-svgr` | Import SVGs as React components |
| `vite-tsconfig-paths` | Resolve `@/` path aliases |

## Electron Forge Plugins

| Plugin | Purpose |
|--------|---------|
| `plugin-vite` | Vite integration for build/dev |
| `plugin-fuses` | Security fuse configuration |
| `plugin-auto-unpack-natives` | Handle native modules |

## Packaging Makers

| Maker | Platform |
|-------|----------|
| MakerSquirrel | Windows (.exe installer) |
| MakerZIP | macOS (.zip) |
| MakerRpm | Linux (.rpm) |
| MakerDeb | Linux (.deb) |

## System Dependencies (Runtime)

The VM management features require these on the host system:

| Tool | Purpose |
|------|---------|
| libvirt / virsh | VM lifecycle management |
| QEMU Guest Agent | In-guest command execution |
| sshpass (optional) | SSH password authentication |
| nc (netcat) | Port connectivity checks |
| curl | HTTP/HTTPS health checks |

## Related Pages

- [[Build Configuration]] - How the build tooling is configured
- [[Development Guide]] - How to run and build the project

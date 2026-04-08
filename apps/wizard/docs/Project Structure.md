# Project Structure

```
reactronite/
├── src/
│   ├── main.ts                    # Electron main process entry point
│   ├── preload.ts                 # Preload script (secure IPC bridge)
│   ├── appWindow.ts               # BrowserWindow creation & config
│   ├── windowState.ts             # Window state tracking & events
│   ├── webContents.ts             # Utility for sending events to renderer
│   │
│   ├── ipc/                       # IPC handlers (main process side)
│   │   ├── menuIPC.ts             # Window controls, zoom, devtools
│   │   ├── dialogIPC.ts           # File/folder dialogs, terminal launch
│   │   ├── installerIPC.ts        # Installation workflow execution
│   │   └── vmIPC.ts               # VM lifecycle & command execution
│   │
│   ├── menu/                      # Application menus
│   │   ├── appMenu.ts             # Menu bar template
│   │   ├── accelerators.ts        # Keyboard shortcuts
│   │   └── contextMenu.ts         # Right-click context menu
│   │
│   ├── channels/                  # IPC channel name constants
│   │   └── menuChannels.ts        # Menu-related channel definitions
│   │
│   ├── @types/                    # Global TypeScript declarations
│   │   └── index.d.ts             # Declares electron global, platform defines
│   │
│   └── app/                       # React application (renderer)
│       ├── index.tsx              # React DOM mount point
│       ├── App.tsx                # Root component (router, theme, titlebar)
│       │
│       ├── screens/               # Full-page views
│       │   ├── vms.tsx            # VM management dashboard
│       │   ├── installer.tsx      # Installation wizard orchestrator
│       │   ├── landing.tsx        # Welcome/home page
│       │   └── splash.tsx         # Loading splash screen
│       │
│       ├── components/            # Reusable components
│       │   ├── titlebar.tsx       # Custom window titlebar
│       │   ├── window-controls.tsx# Min/max/close buttons
│       │   ├── theme-provider.tsx # Dark/light theme context
│       │   ├── menu.tsx           # App menu dropdown
│       │   ├── menu-item.tsx      # Individual menu entry
│       │   ├── control-button.tsx # Generic control button
│       │   ├── mode-toggle.tsx    # Theme toggle switch
│       │   ├── installer-display.tsx  # Installation output display
│       │   ├── installer-prompt.tsx   # Installation prompt component
│       │   │
│       │   ├── ui/               # Shadcn-style primitives
│       │   │   ├── button.tsx
│       │   │   ├── card.tsx
│       │   │   ├── input.tsx
│       │   │   ├── label.tsx
│       │   │   ├── switch.tsx
│       │   │   ├── badge.tsx
│       │   │   └── dropdown-menu.tsx
│       │   │
│       │   └── stages/           # Installer wizard stages
│       │       ├── dynamic-configuration.tsx  # Config form (from schema)
│       │       ├── pre-checks.tsx             # System verification
│       │       ├── advanced-installation.tsx   # Multi-step install
│       │       ├── real-installation.tsx       # Direct command execution
│       │       ├── installation.tsx            # Basic install stage
│       │       └── completion.tsx              # Success/finish page
│       │
│       ├── hooks/                # Custom React hooks
│       │   ├── useRendererListener.ts  # IPC event listener hook
│       │   ├── useEventListener.ts     # DOM event listener hook
│       │   └── index.ts               # Re-exports
│       │
│       ├── types/                # TypeScript type definitions
│       │   ├── installer-config.ts    # Installer config types
│       │   └── vm-config.ts           # VM config types
│       │
│       ├── styles/               # Global styles
│       │   └── global.css        # Tailwind imports, base styles
│       │
│       └── lib/                  # Utilities
│           └── utils.ts          # cn() helper (clsx + tailwind-merge)
│
├── config/                       # Build configuration
│   ├── vite.base.config.ts       # Shared Vite config
│   ├── vite.main.config.ts       # Main process Vite config
│   ├── vite.preload.config.ts    # Preload script Vite config
│   └── vite.renderer.config.ts   # Renderer process Vite config
│
├── assets/
│   └── icons/                    # App icons
│
├── forge.config.ts               # Electron Forge packaging config
├── tsconfig.json                 # TypeScript configuration
├── eslint.config.js              # ESLint config (neostandard)
├── tailwind.config.js            # Tailwind CSS configuration
├── package.json                  # Dependencies and scripts
│
├── installer-config.json         # Basic installer configuration
├── installer-config-advanced.json# Advanced installer configuration
├── vm-config.json                # VM definitions and profiles
└── vm-config.example.json        # Example VM configuration
```

## Key Boundaries

| Directory | Process | Purpose |
|-----------|---------|---------|
| `src/main.ts`, `src/ipc/`, `src/menu/` | Main | Node.js, system access, IPC handlers |
| `src/preload.ts` | Preload | Bridge between main and renderer |
| `src/app/` | Renderer | React UI, no Node.js access |
| `config/` | Build time | Vite bundling configuration |

## Related Pages

- [[Architecture Overview]] - How these pieces connect
- [[Build Configuration]] - How files are bundled

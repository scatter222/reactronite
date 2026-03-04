# Architecture Overview

Reactronite follows the standard **Electron multi-process architecture** with a clear separation between the main process (Node.js) and renderer process (Chromium/React).

## Process Model

```
┌─────────────────────────────────────────────────────┐
│                   Main Process                       │
│                   (src/main.ts)                      │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  vmIPC.ts    │  │installerIPC  │  │ dialogIPC  │ │
│  │              │  │              │  │            │ │
│  │  VM lifecycle│  │  Install     │  │  File      │ │
│  │  Guest agent │  │  workflow    │  │  dialogs   │ │
│  │  SSH fallback│  │  Streaming   │  │  Shell ops │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                │        │
│  ┌──────┴─────────────────┴────────────────┴──────┐ │
│  │              ipcMain handlers                   │ │
│  └──────────────────┬──────────────────────────────┘ │
│                     │                                │
│  ┌──────────────────┴──────────────────────────────┐ │
│  │              Preload Bridge                      │ │
│  │              (src/preload.ts)                    │ │
│  │  contextBridge.exposeInMainWorld('electron')     │ │
│  └──────────────────┬──────────────────────────────┘ │
└─────────────────────┼───────────────────────────────┘
                      │ IPC (validated channels)
┌─────────────────────┼───────────────────────────────┐
│                     │     Renderer Process           │
│                                                      │
│  ┌──────────────────────────────────────────────────┐│
│  │  React App (src/app/)                            ││
│  │                                                  ││
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐  ││
│  │  │ VMScreen │  │Installer │  │  Components   │  ││
│  │  │          │  │  Screen  │  │  (titlebar,   │  ││
│  │  │ Dashboard│  │  Wizard  │  │   controls,   │  ││
│  │  │ Controls │  │  Stages  │  │   theme)      │  ││
│  │  └──────────┘  └──────────┘  └───────────────┘  ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

## Data Flow

All communication between renderer and main process goes through the **preload bridge**:

```
User Action (React)
    │
    ▼
electron.ipcRenderer.invoke('channel', ...args)
    │
    ▼
Preload validates channel (non-empty string)
    │
    ▼
ipcMain.handle('channel', handler)
    │
    ▼
Handler executes (shell commands, file I/O, virsh, etc.)
    │
    ▼
Returns result to renderer  ─── OR ───  Streams events via
                                        webContents.send()
```

### Invoke vs Send

| Pattern | Usage | Example |
|---------|-------|---------|
| `invoke` / `handle` | Request-response (awaitable) | `vm:getStates`, `vm:create` |
| `send` / `on` | One-way events (fire-and-forget) | `vm:commandOutput`, `installer:commandOutput` |

The streaming pattern is used for real-time output from long-running operations (VM commands, installations). The main process sends incremental updates via `webContents.send()` while the renderer listens with `ipcRenderer.on()`.

## Startup Sequence

```
1. main.ts
   ├── Squirrel installer check (Windows)
   ├── app.whenReady() → Install React DevTools
   └── app.on('ready')
       ├── createAppWindow()          (appWindow.ts)
       │   ├── Create BrowserWindow (frameless, transparent)
       │   ├── Load dev server URL or built HTML
       │   ├── Build application menu
       │   ├── Register window state events
       │   └── Register menu IPC
       ├── registerDialogHandlers()   (ipc/dialogIPC.ts)
       ├── registerInstallerHandlers()(ipc/installerIPC.ts)
       └── registerVMHandlers()       (ipc/vmIPC.ts)

2. Renderer loads → index.tsx → App.tsx
   ├── ThemeProvider (dark/light)
   ├── HashRouter
   ├── Titlebar (custom window frame)
   └── Routes → VMScreen (default)
```

## Key Design Decisions

- **Context Isolation**: Enabled. Renderer has zero direct access to Node.js APIs. All access goes through the validated preload bridge.
- **Frameless Window**: Custom titlebar with platform-specific behavior (macOS hidden titlebar style, Windows custom controls).
- **HashRouter**: Used instead of BrowserRouter because Electron loads files from disk, not a web server.
- **Streaming Output**: Long-running commands stream output in real-time rather than waiting for completion, using `webContents.send()` for incremental updates.
- **Guest Agent with SSH Fallback**: VM command execution primarily uses QEMU Guest Agent, with automatic SSH-based repair when guest-exec is disabled.

## Related Pages

- [[IPC System]] - Deep dive into all IPC channels
- [[Window Management]] - Window creation, state, and titlebar
- [[Security Model]] - Context isolation and command safety

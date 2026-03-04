# Window Management

## Window Creation (`src/appWindow.ts`)

The main application window is created with these settings:

```typescript
{
  minWidth: 1200, minHeight: 800,
  defaultWidth: 1400, defaultHeight: 900,
  frame: false,          // Custom titlebar (no OS chrome)
  transparent: true,     // Transparent background
  backgroundColor: '#00000000',
  hasShadow: true,
  autoHideMenuBar: true,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    preload: 'preload.js'
  }
}
```

### Platform-Specific Behavior

- **macOS:** Uses `titleBarStyle: 'hidden'` with `vibrancy: 'dark'` for native-feeling translucency
- **Windows/Linux:** Fully frameless with custom titlebar component

### Window State Persistence

Uses `electron-window-state` to remember:
- Window position (x, y)
- Window size (width, height)
- Maximize state

Saved automatically on window changes, restored on next launch.

## Window State Tracking (`src/windowState.ts`)

Tracks and broadcasts window state transitions to the renderer:

```typescript
type WindowState = 'minimized' | 'normal' | 'maximized' | 'full-screen' | 'hidden';
```

Listens for Electron events:
- `enter-full-screen` → `'full-screen'`
- `leave-full-screen` → `'normal'` (then may get `maximize` event)
- `maximize` → `'maximized'`
- `minimize` → `'minimized'`
- `unmaximize` / `restore` → `'normal'`
- `hide` → `'hidden'`
- `show` → inspects actual state

Events are sent to renderer via `window-state-changed` channel.

## Custom Titlebar (`src/app/components/titlebar.tsx`)

The titlebar component:
- Listens for `window-state-changed` events
- Hides completely in fullscreen on macOS
- On Windows, renders:
  - **Menu** dropdown (app menu)
  - **WindowControls** (minimize, maximize/restore, close)
- Double-click toggles maximize

### Window Controls (`src/app/components/window-controls.tsx`)

Three buttons that invoke menu IPC channels:
- Minimize → `menu:window-minimize`
- Maximize/Restore → `menu:window-toggle-maximize`
- Close → `menu:window-close`

The maximize button icon changes based on current `windowState`.

## WebContents Utility (`src/webContents.ts`)

Helper functions for sending events to the renderer:

- `emitEvent()` - Creates click handlers that send IPC events
- `sendToRenderer()` - Safely sends IPC messages (checks if webContents exists and isn't destroyed)

## Related Pages

- [[Architecture Overview]] - Process model
- [[IPC System]] - Menu IPC channels
- [[UI Components]] - Titlebar and controls

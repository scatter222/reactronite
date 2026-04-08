# IPC System

The IPC (Inter-Process Communication) system is the backbone connecting the React UI to the Node.js backend. All communication passes through the **preload bridge** for security.

## Preload Bridge

**File:** `src/preload.ts`

The preload script runs in an isolated context and exposes a minimal `electron` global to the renderer:

```typescript
contextBridge.exposeInMainWorld('electron', {
  versions,           // chrome, node, electron versions
  ipcRenderer: {
    send(),           // Fire-and-forget to main
    invoke(),         // Request-response (returns Promise)
    on(),             // Listen for events from main
    once(),           // One-time listener
    removeListener()  // Cleanup listener
  }
});
```

Every call validates the channel name is non-empty before forwarding.

## IPC Modules

There are four IPC handler modules, each registered during app startup in `main.ts`:

### 1. Menu IPC (`src/ipc/menuIPC.ts`)

Window management and app controls.

| Channel | Type | Purpose |
|---------|------|---------|
| `menu:execute-menu-item-by-id` | send | Trigger menu item by ID |
| `menu:show-context-menu` | send | Show context menu |
| `menu:window-minimize` | invoke | Minimize window |
| `menu:window-maximize` | invoke | Maximize window |
| `menu:window-toggle-maximize` | invoke | Toggle maximize state |
| `menu:window-close` | invoke | Close window |
| `menu:web-toggle-devtools` | invoke | Toggle DevTools |
| `menu:web-actual-size` | invoke | Reset zoom to 100% |
| `menu:web-zoom-in` | invoke | Zoom in (+0.5 level) |
| `menu:web-zoom-out` | invoke | Zoom out (-0.5 level) |
| `menu:web-toggle-fullscreen` | invoke | Toggle fullscreen |
| `menu:open-github-profile` | invoke | Open GitHub profile in browser |

### 2. Dialog IPC (`src/ipc/dialogIPC.ts`)

File system dialogs and shell operations.

| Channel | Type | Purpose |
|---------|------|---------|
| `dialog:openDirectory` | invoke | Open directory picker dialog |
| `shell:openPath` | invoke | Open path in file explorer |
| `shell:openTerminal` | invoke | Launch terminal at path (cross-platform) |

The terminal launcher tries platform-specific emulators:
- **Windows:** `cmd.exe`
- **macOS:** `Terminal.app`
- **Linux:** gnome-terminal, konsole, xterm, xfce4-terminal (first found)

### 3. Installer IPC (`src/ipc/installerIPC.ts`)

Installation workflow execution. See [[Installer System]] for full details.

| Channel | Type | Purpose |
|---------|------|---------|
| `installer:getConfig` | invoke | Load installer config (advanced or basic) |
| `installer:getAdvancedConfig` | invoke | Load advanced config specifically |
| `installer:saveUserConfig` | invoke | Store user configuration choices |
| `installer:runPreCheck` | invoke | Execute single pre-check command |
| `installer:runCommand` | invoke | Execute single install command |
| `installer:streamCommand` | invoke | Execute command with streaming output |
| `installer:getInstallSteps` | invoke | Get filtered install steps |
| `installer:runInstallation` | invoke | Execute full installation workflow |

**Events sent to renderer:**

| Event | Data | Purpose |
|-------|------|---------|
| `installer:commandOutput` | `{type, data, command}` | Real-time stdout/stderr |
| `installer:stepStart` | `{name, description}` | Step began |
| `installer:stepComplete` | `{name}` | Step finished |
| `installer:stepError` | `{step, error}` | Step failed |

### 4. VM IPC (`src/ipc/vmIPC.ts`)

VM lifecycle management. See [[VM Management]] for full details.

| Channel | Type | Purpose |
|---------|------|---------|
| `vm:getConfig` | invoke | Load vm-config.json |
| `vm:saveConfig` | invoke | Save VM configuration |
| `vm:getStates` | invoke | Get all VM states (virsh list) |
| `vm:getState` | invoke | Get single VM state |
| `vm:create` | invoke | Define VM from XML |
| `vm:start` | invoke | Start VM (with dependency resolution) |
| `vm:stop` | invoke | Shutdown or force-stop VM |
| `vm:delete` | invoke | Undefine VM and remove storage |
| `vm:batchStart` | invoke | Start multiple VMs (sequential or parallel) |
| `vm:installProfile` | invoke | Deploy a named profile of VMs |
| `vm:executeCommand` | invoke | Run command in VM via guest agent |
| `vm:transferFile` | invoke | Transfer file to VM via guest agent |

**Events sent to renderer:**

| Event | Data | Purpose |
|-------|------|---------|
| `vm:commandOutput` | `{vmName, type, data}` | Streamed command output |
| `vm:postBootStart` | `{vmName}` | Post-boot config began |
| `vm:postBootComplete` | `{vmName}` | Post-boot config finished |
| `vm:waitCondition` | `{vmName, condition, status}` | Wait condition status |
| `vm:fileTransfer` | `{vmName, file, status, error?}` | File transfer progress |
| `vm:installProgress` | `{vmName, status, message}` | Profile install progress |
| `vm:commandStart` | `{vmName, command}` | Command execution began |
| `vm:commandComplete` | `{vmName, command, success, error?}` | Command finished |

## Window State Events

In addition to the IPC modules above, `windowState.ts` sends a special event:

| Event | Data | Purpose |
|-------|------|---------|
| `window-state-changed` | `WindowState` | Window min/max/fullscreen/normal/hidden changes |

The titlebar component listens for this to update its controls.

## Related Pages

- [[Architecture Overview]] - How IPC fits into the process model
- [[VM Management]] - VM IPC handler details
- [[Installer System]] - Installer IPC handler details
- [[Security Model]] - Channel validation and safety

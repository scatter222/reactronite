# Security Model

Reactronite implements multiple layers of security following Electron best practices.

## Context Isolation

The renderer process has **zero direct access** to Node.js APIs:

```typescript
// appWindow.ts
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  preload: 'preload.js'
}
```

All communication goes through the preload bridge, which exposes only:
- `electron.versions` - Read-only version info
- `electron.ipcRenderer.send()` - Fire-and-forget messaging
- `electron.ipcRenderer.invoke()` - Request-response messaging
- `electron.ipcRenderer.on()` / `once()` / `removeListener()` - Event listening

### Channel Validation

The preload script validates every IPC channel:

```typescript
function validateIPC(channel: string) {
  if (!channel) {
    throw new Error(`Unsupported event IPC channel '${channel}'`);
  }
  return true;
}
```

## Electron Fuses

Security fuses are set at package time in `forge.config.ts`:

| Fuse | Setting | Protection |
|------|---------|------------|
| RunAsNode | `false` | Prevents using the app binary as a Node.js runtime |
| EnableCookieEncryption | `true` | Encrypts on-disk cookies |
| EnableNodeOptionsEnvironmentVariable | `false` | Blocks `NODE_OPTIONS` injection |
| EnableNodeCliInspectArguments | `false` | Blocks remote debugging |
| EnableEmbeddedAsarIntegrityValidation | `true` | Validates asar archive hasn't been tampered with |
| OnlyLoadAppFromAsar | `true` | Only loads code from asar, not loose files |

## Command Safety (Installer)

The installer IPC has a two-tier safety system to prevent accidental execution of dangerous commands:

### Tier 1: Inherently Safe Whitelist

These commands always run directly:

```
uname, hostname, whoami, pwd, date, df, free,
ip route, ip addr, ls, echo, cat /etc/os-release,
systemctl list-units, which, test, head, tail, wc
```

### Tier 2: Config-Marked Safe

Commands with `safe: true` in the installer config run directly.

### Default: Dry Run

Commands matching neither tier are wrapped:
```bash
echo "Would run: <original command>"
```

This means unknown commands are **never executed** unless explicitly marked safe.

## VM Command Execution

VM commands have different security characteristics:

- Commands are executed **inside guest VMs** via QEMU Guest Agent, not on the host
- Base64 encoding prevents shell injection in the transport layer
- The `sensitive` flag suppresses output logging for commands involving secrets
- SSH credentials are used only for guest agent repair, not general access

### SSH Command Construction

SSH commands are built with safety options:
```
-o StrictHostKeyChecking=no
-o ConnectTimeout=10
-o UserKnownHostsFile=/dev/null
-o LogLevel=ERROR
```

Passwords are passed via `sshpass` when key-based auth isn't configured.

## ASAR Packaging

The app is packaged into an ASAR archive (`asar: true` in forge config), which:
- Prevents trivial modification of app source code
- Combined with `OnlyLoadAppFromAsar` fuse, ensures only verified code runs
- Integrity validation confirms the archive hasn't been tampered with

## Related Pages

- [[Architecture Overview]] - Process isolation model
- [[IPC System]] - Channel validation details
- [[Build Configuration]] - Fuse and packaging config
- [[Installer System]] - Command safety details

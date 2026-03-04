# VM Management

The VM management system (`src/ipc/vmIPC.ts`) is the most complex module in the application. It provides full lifecycle management for KVM/libvirt virtual machines with post-boot configuration via QEMU Guest Agent.

## Overview

```
┌──────────────────────────────────────────────────┐
│                  VM Management                    │
│                                                   │
│  ┌─────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │Lifecycle │  │ Guest    │  │  Post-Boot      │ │
│  │          │  │ Agent    │  │  Configuration   │ │
│  │ create   │  │          │  │                  │ │
│  │ start    │  │ guestExec│  │ File transfers  │ │
│  │ stop     │  │ Raw+File │  │ Commands        │ │
│  │ delete   │  │          │  │ Wait conditions │ │
│  └─────────┘  └──────────┘  └─────────────────┘ │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │ SSH      │  │ Profiles │  │  Dependencies   │ │
│  │ Fallback │  │          │  │                  │ │
│  │          │  │ Batch    │  │ depends_on      │ │
│  │ Fix agent│  │ deploy   │  │ priority sort   │ │
│  └──────────┘  └──────────┘  └─────────────────┘ │
└──────────────────────────────────────────────────┘
```

## VM Lifecycle

### Create (`vm:create`)

1. Read domain XML from `domainXmlPath`
2. Apply global and per-VM variable substitution (`{{varName}}`)
3. Run `beforeCreate` hooks
4. Write processed XML to `/tmp/<name>-domain.xml`
5. `virsh define /tmp/<name>-domain.xml`
6. Optionally `virsh autostart <name>`
7. Run `afterCreate` hooks
8. Clean up temp XML

### Start (`vm:start`)

1. Resolve dependencies: start any VMs in `depends_on` that aren't running
2. Run `beforeStart` hooks
3. `virsh start <name>`
4. Run `afterStart` hooks
5. If `postBoot` config exists, run [[#Post-Boot Configuration]]

### Stop (`vm:stop`)

- Graceful: `virsh shutdown <name>`
- Force: `virsh destroy <name>`
- Runs `beforeStop` / `afterStop` hooks

### Delete (`vm:delete`)

1. Force-stop if running (`virsh destroy`)
2. `virsh undefine <name> --remove-all-storage --snapshots-metadata`

### State Query (`vm:getState`)

Queries `virsh domstate`, `virsh domifaddr` (IP), and `virsh domiflist` (MAC) for running VMs.

## Command Execution

There are two levels of command execution inside VMs:

### `guestExecRaw` - Low-Level

Used for small helper commands (tail, cat, rm) where output fits in the guest agent buffer.

```
guest-exec → poll guest-exec-status → decode base64 output
```

- Sends `guest-exec` QGA command with `capture-output: true`
- Polls `guest-exec-status` until `exited: true`
- Decodes base64 stdout/stderr from the response
- Timeout-based polling loop

### `guestExec` - High-Level (Streaming)

Used for main commands (potentially large output like ansible runs). Avoids the guest agent's output buffer limit by redirecting to a temp file.

```
1. Base64-encode the command
2. Wrap in: (command) > /tmp/rn-exec-$$ 2>&1; echo $? > /tmp/rn-exec-$$.exit
3. Send via guest-exec with capture-output: false
4. Poll loop:
   a. Check if wrapper process exited (guest-exec-status)
   b. Tail the log file for new output (via guestExecRaw)
   c. Stream chunks to renderer via vm:commandOutput
5. Final read of remaining output
6. Read exit code from .exit file
7. Cleanup temp files
```

Key features:
- **User switching:** Commands can run as a specific user via `su - <user>`
- **Sensitive mode:** Suppresses output streaming when `command.sensitive` is set
- **Auto SSH fix:** If guest-exec is disabled, automatically attempts [[#SSH Fallback]]

### SSH Fallback

When the QEMU Guest Agent has `guest-exec` disabled (via RPC filtering), the system can fix it via SSH:

1. Detect "command is not allowed" or "has been disabled" error
2. SSH into the VM using configured credentials
3. Remove RPC filter: `sed -i 's/^FILTER_RPC_ARGS=.*/FILTER_RPC_ARGS=""/' /etc/sysconfig/qemu-ga`
4. Restart agent: `systemctl restart qemu-guest-agent`
5. Wait for agent to come back (up to 15s)
6. Retry the original command

Each VM is only attempted once (tracked in `agentFixedVMs` set).

## File Transfer (`guestFileWrite`)

Transfers files to VMs via the QEMU Guest Agent file API:

1. Read source file from host
2. If `template: true`, apply variable substitution
3. Base64-encode content
4. `guest-file-open` (write mode)
5. `guest-file-write` (base64 content)
6. `guest-file-close`
7. Optionally `chmod` permissions via `guestExec`

## Post-Boot Configuration

Runs after a VM is started, in order:

### 1. Wait for Conditions

Always waits for guest agent first (120s timeout), then user-defined conditions:

| Type | Check Method |
|------|-------------|
| `agent` | `guest-ping` QGA command |
| `port` | `nc -zv <ip> <port>` |
| `http` / `https` | `curl -sf` checking HTTP status (2xx, 301, 302) |
| `command` | Arbitrary shell command on host |
| `file` | `test -e <path>` inside guest |

### 2. Transfer Files

Iterates `postBoot.files[]` and calls `guestFileWrite` for each.

### 3. Run Commands

Iterates `postBoot.commands[]`:
- Evaluate `condition` (JavaScript expression) to skip if needed
- Execute via `guestExec` with streaming output
- Support retries with configurable delay
- Stop on failure unless `ignoreError` is set

## Batch Operations

### `vm:batchStart`

Start multiple VMs, either sequentially or in parallel (`Promise.all`).

### `vm:installProfile`

Deploy a named profile (group of VMs):

1. Look up profile in config
2. Sort VMs by `priority` (lower = first)
3. For each VM: create → start → post-boot
4. Stream progress events to renderer
5. Respect `autoStartDelay` between VMs

## Variable Substitution

Variables can be defined at two levels:
- **Global:** `vmConfig.variables` - applied to all domain XMLs
- **Per-VM:** `vm.variables` - applied after globals

Format: `{{variableName}}` in domain XML content

## Related Pages

- [[VM Config Schema]] - Configuration file format
- [[IPC System]] - All IPC channels
- [[Screens]] - VM dashboard UI

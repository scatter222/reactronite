# Installer System

The installer system (`src/ipc/installerIPC.ts`) provides a multi-stage installation wizard with dynamic configuration, pre-checks, and real-time command streaming.

## Overview

```
┌──────────────────────────────────────────────┐
│              Installer Workflow               │
│                                               │
│  ┌───────────┐   ┌───────────┐   ┌────────┐ │
│  │  Config   │──▶│ Pre-Checks│──▶│Install │ │
│  │  Stage    │   │  Stage    │   │ Stage  │ │
│  └───────────┘   └───────────┘   └────┬───┘ │
│                                       │      │
│                                  ┌────▼───┐  │
│                                  │Complete│  │
│                                  │ Stage  │  │
│                                  └────────┘  │
└──────────────────────────────────────────────┘
```

## Configuration Loading

The installer looks for configuration files in this order:
1. `installer-config-advanced.json` (preferred)
2. `installer-config.json` (fallback)

Both are loaded from `process.cwd()`.

## Stages

### 1. Dynamic Configuration

**Component:** `stages/dynamic-configuration.tsx`

Renders a form dynamically from the `configFields` array in the installer config. Supports field types:
- `text` - Free text input
- `password` - Masked password input
- `number` - Numeric input with min/max
- `boolean` - Toggle switch
- `select` - Dropdown selection

Fields support validation rules, placeholders, descriptions, and required flags. User choices are stored in `userConfig` and available as `{{variableName}}` in commands.

### 2. Pre-Checks

**Component:** `stages/pre-checks.tsx`

Runs system verification commands before installation:

```typescript
interface PreCheck {
  name: string;
  command: string;          // Shell command to run
  expectedPattern?: string; // Regex to match in output
  type?: 'diskSpace' | 'memory' | 'cpu';
  errorMessage: string;
  safe?: boolean;
  captureAs?: string;       // Store output as variable
}
```

Commands are filtered through a safety whitelist. Only inherently safe commands run directly; others are echoed.

**Safe commands:** `uname`, `hostname`, `whoami`, `pwd`, `date`, `df`, `free`, `ip route`, `ip addr`, `ls`, `cat /etc/os-release`, `echo`

### 3. Installation

**Component:** `stages/advanced-installation.tsx`

Executes installation steps sequentially. Each step contains one or more commands:

```typescript
interface InstallStep {
  name: string;
  description: string;
  condition?: string;       // Only run if userConfig[condition] === true
  commands: InstallCommand[];
}
```

Commands support:
- **Variable substitution:** `{{hostname}}` replaced with user config values
- **Streaming output:** Real-time stdout/stderr sent to renderer
- **Safety filtering:** Unsafe commands require `safe: true` flag
- **Sensitive mode:** Output redacted when `sensitive: true`
- **Timeout:** Configurable per-command (default 30s)
- **Interactive types:** Commands can be `command`, `prompt`, or `display` type

### 4. Completion

**Component:** `stages/completion.tsx`

Shows installation success with summary. Navigates back to the main screen.

## Command Execution

### Single Command (`installer:runCommand`)

1. Replace `{{variables}}` from user config
2. Check safety whitelist
3. Execute via `child_process.exec`
4. Return result with output

### Streaming Command (`installer:streamCommand`)

1. Replace variables
2. Check safety
3. Execute via `child_process.spawn` (for streaming)
4. Send `installer:commandOutput` events for each stdout/stderr chunk
5. Return final result on close

### Full Installation (`installer:runInstallation`)

1. Filter steps by conditions
2. For each step:
   a. Send `installer:stepStart` event
   b. Execute each command with streaming
   c. Check exit codes against expected values
   d. Send `installer:stepComplete` or `installer:stepError`

## Command Safety Model

Commands go through a two-tier safety check:

1. **Inherently safe:** Command starts with a whitelisted prefix → runs directly
2. **Marked safe:** Command has `safe: true` in config → runs directly
3. **Neither:** Command is wrapped in `echo "Would run: ..."` → dry run only

This prevents accidental execution of dangerous commands during development/testing while allowing real execution when explicitly configured.

## Related Pages

- [[Installer Config Schema]] - Configuration file format
- [[IPC System]] - IPC channels used
- [[Screens]] - Installer wizard UI
- [[Security Model]] - Command safety details

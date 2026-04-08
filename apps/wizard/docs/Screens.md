# Screens

The application has two primary screens, both accessible via the router.

## VM Screen (`src/app/screens/vms.tsx`)

The default landing page. A dashboard for managing KVM/libvirt virtual machines.

### Layout

```
┌──────────────────────────────────────────────┐
│  [Server Icon] Virtual Machines  [Deploy][Refresh] │
├────────────────┬─────────────────────────────┤
│   VM List      │   Detail Panel              │
│                │                              │
│  ● vm-name-1  │   vm-name-1                 │
│    running     │   [Run Command][Stop][Force] │
│    10.0.0.1    │                              │
│                │   State: running             │
│  ● vm-name-2  │   IP: 10.0.0.1              │
│    shut off    │   MAC: 52:54:00:xx:xx:xx    │
│                │                              │
│                │   ┌─── Output Log ──────┐   │
│                │   │ [timestamp] output.. │   │
│                │   │ [timestamp] output.. │   │
│                │   └─────────────────────┘   │
└────────────────┴─────────────────────────────┘
```

### Features

- **VM List** (left panel): Shows all VMs with state indicators (green=running, yellow=paused, grey=stopped, red=error)
- **Detail Panel** (right): Shows selected VM info with action buttons
- **Deploy**: Reads `vm-config.json`, creates any missing VMs, starts all of them with post-boot configuration
- **Actions**: Start, Stop, Force Stop, Delete, Run Command (via prompt)
- **Output Log**: Real-time scrolling log of all operations (capped at 100 lines)

### IPC Events Listened

- `vm:commandOutput` - Streamed command output
- `vm:postBootStart` / `vm:postBootComplete` - Post-boot lifecycle
- `vm:waitCondition` - Wait condition status changes
- `vm:fileTransfer` - File transfer progress

## Installer Screen (`src/app/screens/installer.tsx`)

A multi-stage installation wizard with sidebar navigation.

### Layout

```
┌─────────────────────────────────────────────┐
│  ┌─ Sidebar ──────┐  ┌─ Content ─────────┐ │
│  │                 │  │                    │ │
│  │ [Package Icon]  │  │  Stage-specific   │ │
│  │ Installation    │  │  content renders  │ │
│  │ Wizard          │  │  here             │ │
│  │                 │  │                    │ │
│  │ ● Configuration │  │  (forms, checks,  │ │
│  │ ○ Pre-Checks   │  │   terminal output, │ │
│  │ ○ Installation  │  │   completion)     │ │
│  │ ○ Completion    │  │                    │ │
│  │                 │  │                    │ │
│  └─────────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Stage Management

Stages are tracked with status: `pending` → `active` → `completed`

```typescript
stages = [
  { id: 'config',   label: 'Configuration', icon: Settings },
  { id: 'precheck', label: 'Pre-Checks',    icon: Shield },
  { id: 'install',  label: 'Installation',  icon: Terminal },
  { id: 'complete', label: 'Completion',     icon: FileCheck }
];
```

Navigation:
- `handleNext()`: Mark current as completed, activate next
- `handleBack()`: Mark current as pending, reactivate previous
- `handleComplete()`: Navigate to home (`/`)

User configuration (`userConfig`) flows from the Configuration stage through to Installation, where it's used for variable substitution in commands.

### Visual Design

- Sidebar uses glass-morphism effect (`bg-slate-900/60 backdrop-blur-md`)
- Active stage has blue indicator with pulse animation
- Completed stages show green checkmark
- Pending stages are dimmed

## Related Pages

- [[VM Management]] - Backend for VM screen
- [[Installer System]] - Backend for installer screen
- [[UI Components]] - Components used in screens

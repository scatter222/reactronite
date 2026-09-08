# Screens

The application has two primary screens, both accessible via the router.

## VM Screen (`src/app/screens/vms.tsx`)

The default landing page. A dashboard for managing KVM/libvirt virtual machines.

### Views

The main panel has two tabs, switched from the header:

- **Logs** — the streaming output panel (default). Filtered to the VM selected in the sidebar, or all VMs.
- **Graph** — the deployment dependency tree (`src/app/components/vm-dependency-graph.tsx`).

```
┌──────────────────────────────────────────────────────┐
│ [Server] VM Deployment      [Logs|Graph][Deploy][↻]  │
├───────────────┬──────────────────────────────────────┤
│  VM List      │ 2/5 complete [====----] 46%  [-][+][⤢]│
│               │  ┌──── TIER 1 ───────────────────┐   │
│  ● ipa        │  │        ( ✓ ) ipa              │   │
│    Complete   │  └──────────────┬────────────────┘   │
│               │  ┌──── TIER 2 ──┴────────────────┐   │
│  ● splunk     │  │  ( ◐ ) splunk   ( ◐ ) worker  │   │
│    Post-boot  │  └───────────────────────────────┘   │
└───────────────┴──────────────────────────────────────┘
```

### Graph View

- **Layout**: VMs are laid out top-down in tiers. Tier = dependency depth from `depends_on`, so VMs on the same row deploy in parallel. Edges are drawn between real dependencies; a dependency that closes a cycle is drawn dashed red instead of shifting the layout.
- **Progress**: each node has a ring showing phase progress, a spinner while the VM is being worked on, a tick when complete and a cross on error. Edges animate while work flows from a completed parent into an active child.
- **Interaction**: click (or focus + Enter) a node to jump back to the Logs tab filtered to that VM. Drag to pan, scroll to zoom, double-click or the fit button to re-fit.
- **Offline**: rendered as plain SVG with CSS animations — no charting or graph library, nothing fetched at runtime.

### Features

- **VM List** (left panel): Every configured VM plus anything libvirt already knows about, with phase indicators
- **Deploy**: Reads `vm-config.json`, creates any missing VMs, starts all of them with post-boot configuration
- **Tiers**: `vms` may be a flat list or a list of tiers (`[[...], [...]]`). A flat list is grouped by dependency depth, with `priority` ordering VMs inside a tier
- **Output Log**: Real-time scrolling log of all operations (capped at 500 lines)

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

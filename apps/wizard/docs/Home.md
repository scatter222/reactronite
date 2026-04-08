# Reactronite (Installation Wizard)

A modern Electron desktop application for **system installation wizards** and **KVM/libvirt VM orchestration**, built with React, TypeScript, and Vite.

## Quick Navigation

### Architecture
- [[Architecture Overview]] - High-level system design and process model
- [[Project Structure]] - Directory layout and file organization
- [[Tech Stack]] - Technologies, dependencies, and tooling

### Core Systems
- [[IPC System]] - Inter-process communication between main and renderer
- [[VM Management]] - KVM/libvirt VM orchestration engine
- [[Installer System]] - Multi-stage installation wizard
- [[Window Management]] - BrowserWindow, titlebar, and state tracking

### Frontend
- [[React App]] - React application structure and routing
- [[UI Components]] - Reusable component library (Shadcn/Radix-based)
- [[Screens]] - Application pages (VM dashboard, installer wizard)

### Configuration
- [[VM Config Schema]] - VM configuration file format and options
- [[Installer Config Schema]] - Installer configuration file format
- [[Build Configuration]] - Vite, Electron Forge, and TypeScript config

### Development
- [[Development Guide]] - Running, building, and packaging the app
- [[Security Model]] - Context isolation, fuses, and command safety

---

## What This Project Does

1. **Installation Wizard** - Multi-stage system setup with dynamic configuration, pre-checks, and real-time command streaming
2. **VM Management** - Full lifecycle management of KVM/libvirt VMs with dependency-aware startup, post-boot configuration via QEMU Guest Agent, and file transfers
3. **Desktop UI** - Custom frameless window with native titlebar, dark/light theming, and responsive layout

## Key Entry Points

| File | Purpose |
|------|---------|
| `src/main.ts` | Electron main process entry |
| `src/preload.ts` | Secure IPC bridge (context isolation) |
| `src/app/index.tsx` | React renderer entry |
| `src/app/App.tsx` | Root component with routing |
| `src/ipc/vmIPC.ts` | VM orchestration engine |
| `src/ipc/installerIPC.ts` | Installation workflow engine |

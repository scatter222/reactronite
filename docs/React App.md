# React App

## Entry Point

**File:** `src/app/index.tsx`

Mounts the React application to the DOM root element.

## Root Component (`src/app/App.tsx`)

```tsx
<ThemeProvider defaultTheme='dark' storageKey='vite-ui-theme'>
  <HashRouter>
    <div className='flex flex-col h-full'>
      <Titlebar />
      <main className='flex-1 overflow-auto'>
        <Routes>
          <Route path='/' Component={VMScreen} />
          <Route path='/installer' Component={InstallerScreen} />
          <Route path='/vms' Component={VMScreen} />
        </Routes>
      </main>
    </div>
  </HashRouter>
</ThemeProvider>
```

### Key Decisions

- **HashRouter** is used instead of BrowserRouter because Electron serves files from disk, not a web server. Hash-based routing (`/#/path`) works without a server to handle URL rewrites.
- **Default route** (`/`) maps to the VM management screen.
- **ThemeProvider** wraps everything for dark/light mode support (persisted to localStorage).
- **Titlebar** is always rendered above the main content.

## Routing

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | VMScreen | VM management dashboard (default) |
| `/installer` | InstallerScreen | Installation wizard |
| `/vms` | VMScreen | VM management (alias) |

## Theme System

**File:** `src/app/components/theme-provider.tsx`

Provides a React context for theme management:
- Themes: `'dark'`, `'light'`, `'system'`
- Persists choice to `localStorage` under `vite-ui-theme`
- Applies theme class to `document.documentElement`

**File:** `src/app/components/mode-toggle.tsx`

Dropdown toggle for switching between themes.

## Custom Hooks

### `useRendererListener` (`src/app/hooks/useRendererListener.ts`)

Subscribes to IPC events from the main process with automatic cleanup:

```typescript
useRendererListener('vm:commandOutput', (event, data) => {
  // Handle event
});
```

Registers `electron.ipcRenderer.on()` and returns cleanup via `removeListener` in the effect teardown.

### `useEventListener` (`src/app/hooks/useEventListener.ts`)

Standard DOM event listener hook with ref support and cleanup.

## Global Type Declarations (`src/@types/index.d.ts`)

Declares the `electron` global (exposed by preload) and platform compile-time constants:

```typescript
declare const electron: {
  versions: Record<string, unknown>;
  ipcRenderer: { send, invoke, on, once, removeListener };
};

declare const __DARWIN__: boolean;
declare const __WIN32__: boolean;
declare const __LINUX__: boolean;
declare const __DEV__: boolean;
```

These platform flags are set at build time by the Vite renderer config and used for platform-specific UI behavior (e.g., titlebar visibility).

## Related Pages

- [[Screens]] - VMScreen and InstallerScreen details
- [[UI Components]] - Component library
- [[Window Management]] - Titlebar behavior

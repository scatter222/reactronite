# UI Components

The project uses a **Shadcn/Radix-based** component library with TailwindCSS styling.

## Primitives (`src/app/components/ui/`)

These are base UI components following the Shadcn pattern - built on Radix UI primitives with class-variance-authority for variants.

| Component | File | Based On |
|-----------|------|----------|
| Button | `ui/button.tsx` | CVA variants (default, destructive, outline, secondary, ghost, link) + sizes (default, sm, lg, icon) |
| Card | `ui/card.tsx` | Div-based card with header, title, description, content, footer |
| Input | `ui/input.tsx` | Styled HTML input |
| Label | `ui/label.tsx` | Styled HTML label |
| Switch | `ui/switch.tsx` | Radix Switch primitive |
| Badge | `ui/badge.tsx` | CVA variants (default, secondary, destructive, outline) |
| DropdownMenu | `ui/dropdown-menu.tsx` | Radix DropdownMenu primitive |

## Application Components (`src/app/components/`)

| Component | File | Purpose |
|-----------|------|---------|
| Titlebar | `titlebar.tsx` | Custom window frame with menu and controls |
| WindowControls | `window-controls.tsx` | Min/max/close buttons |
| Menu | `menu.tsx` | Application menu dropdown |
| MenuItem | `menu-item.tsx` | Individual menu entry |
| ControlButton | `control-button.tsx` | Generic button for window controls |
| ThemeProvider | `theme-provider.tsx` | Dark/light theme context |
| ModeToggle | `mode-toggle.tsx` | Theme switcher dropdown |
| InstallerDisplay | `installer-display.tsx` | Shows installation output |
| InstallerPrompt | `installer-prompt.tsx` | Interactive installation prompts |

## Installer Stages (`src/app/components/stages/`)

These are step components used by the InstallerScreen:

| Stage | File | Purpose |
|-------|------|---------|
| DynamicConfiguration | `dynamic-configuration.tsx` | Auto-generated config form from schema |
| PreChecks | `pre-checks.tsx` | System verification checks |
| AdvancedInstallation | `advanced-installation.tsx` | Multi-step command execution |
| RealInstallation | `real-installation.tsx` | Direct command execution mode |
| Installation | `installation.tsx` | Basic installation execution |
| Completion | `completion.tsx` | Success/finish summary |

## Utility (`src/app/lib/utils.ts`)

The `cn()` helper merges Tailwind classes with conflict resolution:

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Styling

- **TailwindCSS 4.x** for utility classes
- **tw-animate-css** for animation utilities
- Dark theme by default (`defaultTheme='dark'`)
- Slate color palette for the dark UI

## Related Pages

- [[React App]] - How components are composed
- [[Screens]] - Pages that use these components

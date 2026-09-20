# @reactronite/ui

Shared React components for every Reactronite Electron app. Buttons, inputs,
design tokens — written once, imported as `#ui`.

```tsx
import { Button, Input, cn } from '#ui';
```

This README doubles as the explanation of *why* the setup looks the way it
does, because local/shared dependencies in an Electron + Vite + Forge app fail
in four different places for four unrelated reasons, and the error messages
never point at the real cause.

---

## 1. The mental model

A shared package has to satisfy **four independent layers**. Every confusing
error comes from exactly one of them, and fixing the wrong layer does nothing.

| Layer | Question it answers | Where it's configured |
| --- | --- | --- |
| **Package manager** | Does `node_modules/@reactronite/ui` exist? | `pnpm-workspace.yaml`, `dependencies` |
| **TypeScript** | Does `#ui` typecheck and go-to-definition? | `tsconfig.json` → `paths` |
| **Vite / Rollup** | Can the bundler read and transform the source? | `config/vite.*.config.ts` |
| **Electron Forge** | Does it survive `asar` packaging? | `forge.config.ts`, the `external` list |

The trap: **dev only exercises the first three.** A setup can be perfect in
`pnpm dev` and still produce a packaged app that dies on launch, because layer
four only runs during `pnpm make`. Always smoke-test with `pnpm make` before
believing a change works.

---

## 2. Why `"blah": "file:../blah"` fought you

Worth understanding, because the same traps reappear if you ever add another
local dependency.

### a. Local dependencies are symlinks

`file:` and `link:` both make `node_modules/blah` a **symlink** to a directory
somewhere else on disk. Everything downstream stems from that. (`file:` also
installs the target's own dependencies, which is where duplicate React usually
comes from; `link:` does not.)

### b. The `external` list was auto-derived from `dependencies`

`config/vite.base.config.ts` used to externalize every key of `dependencies`.
Adding `blah` there meant Rollup never bundled it, so `.vite/build/main.js`
shipped a bare `import ... from 'blah'` that Node had to resolve from
`node_modules` at runtime.

That's fine in dev. After `pnpm make` it's `Cannot find module 'blah'`, because
`asar: true` plus the `OnlyLoadAppFromAsar` and
`EnableEmbeddedAsarIntegrityValidation` fuses (`forge.config.ts`) mean nothing
outside the archive can load — and a symlink pointing out of the app directory
is exactly that.

**Fixed:** `vite.base.config.ts` now filters out `file:` / `link:` / `workspace:`
dependencies before building `external`, so local packages get *bundled into*
the output. Nothing needs to exist in `node_modules` at runtime.

### c. `preserveSymlinks: true` picked which error you got

The renderer config had this on, which decides which failure you hit:

- **On** — the id stays `node_modules/blah/...`, Vite treats the package as a
  prebuilt dependency, and HMR on its source stops working.
- **Off** — Vite resolves to the real path `/home/you/blah/src/index.ts`, which
  is outside the Vite root → `The request url ... is outside of Vite serving
  allow list`.

**Fixed:** `preserveSymlinks: false` (correct for a monorepo) plus an explicit
`server.fs.allow` covering the workspace root, so neither error can occur.

### d. Duplicate React

Two copies of React → `Invalid hook call` the moment a shared component uses a
hook. **Fixed** three ways at once: `react`/`react-dom` are `peerDependencies`
here (so this package never installs its own), `node-linker=hoisted` keeps one
flat copy, and `resolve.dedupe` in the renderer config is the backstop.

### e. Tailwind v4 silently purges shared classes

Tailwind v4 auto-detects content but **deliberately skips `node_modules`** — and
a workspace package is symlinked into `node_modules`. Every class used only
inside a shared component gets treated as unused and stripped. The components
render, completely unstyled, with no error anywhere.

**Fixed:** `src/styles/theme.css` carries `@source "../";`. `@source` resolves
relative to the file it's written in, so any app that imports the theme gets
the scanning rule for free.

### One correction worth making

Most of the packaging horror in (b) applies to **main-process** dependencies.
A UI library is renderer-only, and Vite compiles the entire renderer to static
JS/CSS under `.vite/renderer/`. Shared *components* never need to be in
`node_modules` at runtime at all — so the asar problem was never really going
to bite you here. It absolutely would for a shared package used from
`src/main.ts` or `src/ipc/*`, which is why the `external` fix is still worth
having.

---

## 3. How the `#ui` alias works

There are two halves, and you need both — they serve different consumers.

**TypeScript** reads `apps/wizard/tsconfig.json`:

```jsonc
"paths": {
  "@/*":    ["./src/*"],
  "#ui":    ["../../packages/ui/src/index.ts"],
  "#ui/*":  ["../../packages/ui/src/*"]
}
```

**Node and Vite** read the `imports` field in `apps/wizard/package.json`:

```jsonc
"imports": {
  "#ui":   "@reactronite/ui",
  "#ui/*": "@reactronite/ui/*"
}
```

`imports` is a real Node.js feature — the `#` prefix is *the* standard marker
for a private in-package alias, not a bundler convention. That's why it works
in Vite, Rollup, and plain `node` without a plugin. The tsconfig `paths` entry
just makes the editor agree.

Both point at the same files, which matters: if they ever disagree you get code
that typechecks and then fails at runtime.

```tsx
import { Button } from '#ui';                     // barrel — prefer this
import { Button } from '#ui/components/button';   // deep import — escape hatch
```

> **Do you actually need the alias?** With a workspace package, the package name
> already *is* a global alias — `import { Button } from '@reactronite/ui'` works
> with zero config. `#ui` is shorter and makes it obvious at a glance that an
> import is internal, so it's a style choice. Both are wired up; use whichever
> you prefer, just be consistent.

---

## 4. First run

```bash
cd /home/user/reactronite     # the workspace root, NOT apps/wizard
pnpm install                  # links @reactronite/ui into apps/wizard
pnpm dev
```

Two things that catch people out:

- **Install from the root from now on.** Running `pnpm install` inside
  `apps/wizard` ignores the workspace and won't create the link.
- **`apps/wizard/pnpm-lock.yaml` is now dead.** The workspace keeps a single
  lockfile at the root. Delete the app-level one once the root install works,
  along with the stale `package-lock.json` sitting next to it.

---

## 5. Adding a component

1. Create `src/components/my-thing.tsx`. Import the helper as
   `import { cn } from '../lib/utils'` — **relative paths inside this package**,
   never `@/` or `#ui`, so the package stays self-contained.
2. Re-export it from `src/index.ts`.
3. Use it: `import { MyThing } from '#ui'`.

There is no build step. The package's `exports` map points straight at `.ts`
and `.tsx` source, and the consuming app's Vite compiles it. This is the
"internal package" pattern, and it's the right call here: HMR works across the
package boundary, there's no `dist/` to rebuild or forget, and nothing is
published. If you ever publish this to a registry, *then* add a build step.

### Using the shadcn CLI against this package

Optional. To have `npx shadcn@latest add <component>` write into the shared
package instead of the app, point `apps/wizard/components.json` at it:

```jsonc
"aliases": {
  "ui":    "#ui/components",
  "utils": "#ui/lib/utils"
}
```

Be aware this is a one-way switch — app-local components would start landing
here too. Leaving `components.json` alone and moving components over by hand is
often less friction.

### Migrating the existing components

`packages/ui/src/components/` currently holds copies of `button.tsx` and
`input.tsx` as working examples, so the originals in
`apps/wizard/src/app/components/ui/` are **still there and still in use** —
nothing in the app changed. To finish the migration, per component:

1. Move the file here, rewrite its `@/app/lib/utils` import to `../lib/utils`.
2. Export it from `src/index.ts`.
3. In the app, swap `@/app/components/ui/x` for `#ui` and delete the old file.

Do it one component at a time and keep `pnpm dev` running; a missed import
surfaces immediately.

---

## 6. Theming

`src/styles/theme.css` owns the design tokens — the `:root` / `.dark` custom
properties and the `@theme inline` block Tailwind v4 reads. These were lifted
out of `apps/wizard/src/app/styles/globals.css`, which now imports them:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "@reactronite/ui/styles.css";
```

Order matters — the theme import must come *after* `tailwindcss`.

Change a token here and every app picks it up. App-specific styling
(`.window-titlebar`, the `#root` gradient, and the rest of the `@layer
components` block) stays in the app's `globals.css`, which is correct: window
chrome is not a shared concern.

---

## 7. Adding a second app

```bash
mkdir -p apps/other-app      # scaffold it however you like
```

Then in its `package.json`:

```jsonc
"dependencies": { "@reactronite/ui": "workspace:*" },
"imports": { "#ui": "@reactronite/ui", "#ui/*": "@reactronite/ui/*" }
```

...the same two `paths` entries in its `tsconfig.json`, the
`@import "@reactronite/ui/styles.css"` line in its entry CSS, and the same
`resolve` / `server.fs.allow` block in its renderer Vite config. Then
`pnpm install` from the root. That's the whole checklist.

---

## 8. Is a shared UI package the right pattern?

**Yes** — for buttons, inputs, and design tokens across several Electron apps,
this is the standard answer and it scales fine. A few things to hold to, though,
because this is also the pattern people most often get subtly wrong:

**Keep it in the monorepo.** The single biggest improvement over `file:../blah`
isn't any config flag — it's that the library now lives *inside* the repo. One
`pnpm install`, one lockfile, one React, atomic commits across app and library,
and CI that can actually build the thing. An out-of-tree `file:` dependency
means the app is unbuildable on any machine that doesn't happen to have the
sibling directory checked out at the right commit.

**Keep it presentational.** Components here should take props and emit events.
The moment a shared component reaches for `window.electron` or an IPC channel,
it's coupled to one app's preload surface and stops being shareable. Pass a
callback down instead. This is the rule that decides whether the package is
still useful in a year.

**`react` stays a peer dependency.** Already set up. Same for any future Radix
primitive — the app owns the copy, the library declares the requirement.

**One package until it hurts.** Resist splitting into `@reactronite/button`,
`@reactronite/input`, etc. A single `ui` package with a barrel export is less
machinery and tree-shakes fine. Split when you have a genuinely different
concern — a `@reactronite/ipc` for shared main↔renderer channel types is the
likely second package, and note that one *is* main-process code, so the
`external` fix in section 2b starts mattering.

**Where it stops being right:** if the apps diverge enough that every component
needs a `variant="wizard" | "dashboard"` prop, the shared layer is fighting you.
Shared *tokens* with per-app components is a perfectly good end state.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot find module '@reactronite/ui'` | Installed from `apps/wizard` instead of the root | `pnpm install` from the workspace root |
| Works in `pnpm dev`, packaged app won't launch | Local dep externalized, symlink can't live in the asar | The `isLocalDependency` filter in `vite.base.config.ts` |
| `is outside of Vite serving allow list` | Real path outside the Vite root | `server.fs.allow` in the renderer config |
| `Invalid hook call` | Two copies of React | `resolve.dedupe`; check `pnpm why react` |
| Shared components render **unstyled** | Tailwind v4 skips `node_modules` | `@source "../";` in `theme.css` |
| `Failed to parse source for import analysis ... invalid JS syntax` | Bundler got raw TS it wasn't set up to transform | Check the `exports` map points at real paths |
| Editor red squiggles on `#ui`, build fine | `tsconfig.json` `paths` out of sync with `imports` | Make both point at the same files; restart the TS server |
| Changes to a component don't hot-reload | `preserveSymlinks` turned back on | Keep it `false` |

### Things not to do

- **Don't** `npm link` / `pnpm link --global`. It creates a symlink the
  lockfile knows nothing about — it breaks on every other machine, and on
  yours after the next install.
- **Don't** add a `build` step to this package "to be safe." Source exports are
  simpler and HMR works.
- **Don't** commit `apps/wizard/pnpm-lock.yaml` once the root lockfile exists.
  Two lockfiles resolve to two dependency trees.
- **Don't** import app code from this package. Dependencies point one way:
  app → ui, never back.

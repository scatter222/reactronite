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
| **Package manager** | Does `node_modules/@reactronite/ui` exist? | root `package.json` → `workspaces` |
| **TypeScript** | Does `#ui` typecheck and go-to-definition? | `tsconfig.json` → `paths` |
| **Vite / Rollup** | Can the bundler read and transform the source? | `config/vite.*.config.ts` |
| **Electron Forge** | Does it survive `asar` packaging? | `forge.config.ts`, the `external` list |

The trap: **dev only exercises the first three.** A setup can be perfect in
`npm run dev` and still produce a packaged app that dies on launch, because layer
four only runs during `npm run make`. Always smoke-test with `npm run make` before
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

That's fine in dev. After `npm run make` it's `Cannot find module 'blah'`, because
`asar: true` plus the `OnlyLoadAppFromAsar` and
`EnableEmbeddedAsarIntegrityValidation` fuses (`forge.config.ts`) mean nothing
outside the archive can load — and a symlink pointing out of the app directory
is exactly that.

**Fixed:** `vite.base.config.ts` now drops local packages before building
`external`, so they get *bundled into* the output. Nothing needs to exist in
`node_modules` at runtime.

⚠️ **This list is hand-maintained.** npm doesn't support pnpm's `workspace:`
protocol, so a workspace dependency is written `"@reactronite/ui": "*"` — which
is indistinguishable from a registry version range. `vite.base.config.ts`
therefore keeps an explicit `LOCAL_PACKAGES` array. **Add every new workspace
package to it**, or a packaged build will fail with `Cannot find module`. The
`file:` / `link:` check still catches dependencies pointed at a directory
outside the repo.

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
here (so this package never installs its own), npm hoists a single flat copy to
the workspace root, and `resolve.dedupe` in the renderer config is the backstop.

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
npm install                  # links @reactronite/ui into apps/wizard
npm run dev
```

Two things that catch people out:

- **Install from the root from now on.** Running `npm install` inside
  `apps/wizard` ignores the workspace and won't create the link.
- **One lockfile, at the root.** The app-level lockfiles are gone. npm
  workspaces keep a single `package-lock.json` beside the root
  `package.json`; two lockfiles resolve to two dependency trees.

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

Do it one component at a time and keep `npm run dev` running; a missed import
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
"dependencies": { "@reactronite/ui": "*" },
"imports": { "#ui": "@reactronite/ui", "#ui/*": "@reactronite/ui/*" }
```

`"*"` is how npm writes a workspace dependency — it resolves to the local
package because `apps/*` is in the root `workspaces` array, not to whatever is
on the registry. (npm has no `workspace:` protocol; writing `"workspace:*"`
fails outright with `EUNSUPPORTEDPROTOCOL`.)

Then: the same two `paths` entries in its `tsconfig.json`, the
`@import "@reactronite/ui/styles.css"` line in its entry CSS, the same
`resolve` / `server.fs.allow` block in its renderer Vite config, and
`LOCAL_PACKAGES` in its `vite.base.config.ts`. Then `npm install` from the
root. That's the whole checklist.

If you're moving an **existing** app in rather than scaffolding a fresh one,
also delete its `package-lock.json` and its `.npmrc`. Both are inert at best
inside a workspace, and the stale lockfile actively breaks Electron Forge —
§11.

---

## 8. Is a shared UI package the right pattern?

**Yes** — for buttons, inputs, and design tokens across several Electron apps,
this is the standard answer and it scales fine. A few things to hold to, though,
because this is also the pattern people most often get subtly wrong:

**Keep it in the monorepo.** The single biggest improvement over `file:../blah`
isn't any config flag — it's that the library now lives *inside* the repo. One
`npm install`, one lockfile, one React, atomic commits across app and library,
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
| `Cannot find module '@reactronite/ui'` | Installed from `apps/wizard` instead of the root | `npm install` from the workspace root |
| Works in `npm run dev`, packaged app won't launch | Local dep externalized, symlink can't live in the asar | Add it to `LOCAL_PACKAGES` in `vite.base.config.ts` |
| `EUNSUPPORTEDPROTOCOL "workspace:"` | npm has no `workspace:` protocol | Write the dependency as `"*"` |
| `Cannot find the package "electron"` | Forge finds hoisted Electron via a lockfile; a stale per-app lockfile misdirects it | See §11 — usually a leftover `apps/<app>/package-lock.json` |
| `ERESOLVE unable to resolve dependency tree` | npm enforces peer ranges that pnpm only warned about | Fix the version, don't reach for `--legacy-peer-deps` |
| `is outside of Vite serving allow list` | Real path outside the Vite root | `server.fs.allow` in the renderer config |
| `Invalid hook call` | Two copies of React | `resolve.dedupe`; check `npm ls react` |
| Shared components render **unstyled** | Tailwind v4 skips `node_modules` | `@source "../";` in `theme.css` |
| `Failed to parse source for import analysis ... invalid JS syntax` | Bundler got raw TS it wasn't set up to transform | Check the `exports` map points at real paths |
| Editor red squiggles on `#ui`, build fine | `tsconfig.json` `paths` out of sync with `imports` | Make both point at the same files; restart the TS server |
| Changes to a component don't hot-reload | `preserveSymlinks` turned back on | Keep it `false` |

### Things not to do

- **Don't** `npm link`. Workspaces already do this, correctly. `npm link`
  creates a symlink the lockfile knows nothing about — it breaks on every
  other machine, and on yours after the next install.
- **Don't** add a `build` step to this package "to be safe." Source exports are
  simpler and HMR works.
- **Don't** reintroduce a per-app lockfile. One `package-lock.json`, at the
  root. Two lockfiles resolve to two dependency trees, *and* a per-app one
  breaks Electron Forge's hoisted-module lookup outright — see §11.
- **Don't** keep a per-app `.npmrc`. npm ignores it inside a workspace
  (`npm warn config ignoring workspace config at ...`); root `.npmrc` only.
- **Don't** default to `--legacy-peer-deps` when npm reports `ERESOLVE`. It
  hides real conflicts. Resolve the version instead — see
  `@electron/fuses` below.
- **Don't** import app code from this package. Dependencies point one way:
  app → ui, never back.

---

## 10. Note on `@electron/fuses`

`apps/wizard` pins `@electron/fuses` to `^1.8.0`, not `^2.x`, because
`@electron-forge/plugin-fuses` — including the latest 7.11.2 — still declares
`peerDependencies: { "@electron/fuses": "^1.0.0" }`.

This conflict predates the workspace; pnpm merely printed a warning and carried
on with v2 installed. npm treats an unmet peer range as a hard error, so
`npm install` fails with `ERESOLVE` until the versions line up. The fuse
options used in `forge.config.ts` (`FuseV1Options`, `FuseVersion.V1`) are the
v1 API and are unchanged, so the pin costs nothing.

Revisit when a forge release widens that peer range.

---

## 11. `Cannot find the package "electron"` in a workspace

The single most likely thing to break when moving an Electron Forge app into a
workspace. The message looks like:

```
Cannot find the package "electron". Perhaps you need to run install it in "<repo>/apps/wizard"?
```

### Why it happens

npm hoists `electron` to the **workspace root** `node_modules`, not into
`apps/wizard/node_modules`. Forge handles that, but by a mechanism worth
knowing (`@electron-forge/core-utils/dist/electron-version.js`):

1. Look for `<app>/node_modules/electron`. Under workspaces this does **not**
   exist.
2. Fall back: walk up from the app directory with `find-up` until a
   **lockfile** (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) is found,
   then look in `<that directory>/node_modules/electron`.

So Forge locates hoisted Electron **purely by finding a lockfile**. Anything
that makes step 2 land on the wrong directory — or find nothing — produces the
error, even though `node_modules/electron` is sitting right there at the root.

### The three causes, in likelihood order

**1. A stale `apps/<app>/package-lock.json` left behind.** ← most likely when
copying this setup into an existing repo. `find-up` stops at the *nearest*
lockfile, so it resolves to `apps/<app>/node_modules/electron`, which the
workspace never created. Delete every per-app lockfile; one at the root only.

**2. No lockfile at the workspace root.** Either `npm install` was never run
from the root, or `package-lock.json` is in `.gitignore` and the checkout is
fresh. Check `.gitignore` — a repo that ignores lockfiles will break Forge in a
workspace, with nothing else obviously wrong.

**3. Running Forge from the wrong directory.** `electron-forge start` must run
with its cwd in the app. Use `npm run dev -w <app-name>` from the root, or
`cd apps/<app> && npm run dev` — never `npx electron-forge start` at the root.

### 30-second diagnostic

From inside the app directory:

```bash
ls package-lock.json           # must NOT exist
ls ../../package-lock.json     # MUST exist
ls ../../node_modules/electron # MUST exist
```

Or ask Forge directly:

```bash
cd apps/<your-app>
node -e "require('@electron-forge/core-utils/dist/electron-version.js').getElectronModulePath(process.cwd(),require('./package.json')).then(p=>console.log('resolved:',p)).catch(e=>console.log('FAILED:',e.message))"
```

### A related trap

If `electron` is declared as a **range** (`"electron": "^37.2.5"`) rather than
pinned (`"electron": "37.2.5"`), Forge must hit the filesystem to learn the
installed version, so the same misconfiguration fails *earlier* and in more
commands. This repo pins it exactly, which masks cause 2 for some operations —
don't read a working `start` as proof the lockfile situation is sound.

### Not the same error

```
Electron failed to install correctly, please delete node_modules/electron and try installing again
```

That one means Forge *found* the package but the binary was never downloaded —
usually an install run with `--ignore-scripts`, or a blocked download. Fix with
`npm rebuild electron` or reinstall without `--ignore-scripts`. Nothing to do
with workspaces.

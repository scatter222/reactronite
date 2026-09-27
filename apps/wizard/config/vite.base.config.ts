import { builtinModules } from 'node:module';
import type { AddressInfo } from 'node:net';

import type { ConfigEnv, Plugin, UserConfig } from 'vite';

export const builtins = ['electron', ...builtinModules.flatMap((m) => [m, `node:${m}`])];

/**
 * Modules that cannot be bundled and must be resolved from `node_modules` at
 * runtime — i.e. anything shipping a native `.node` binary.
 *
 * ⚠️ Adding to this list is not enough on its own. In an npm workspace,
 * dependencies are hoisted to the repo root, so `apps/wizard/node_modules`
 * does not exist — and `@electron/packager` only copies the app directory.
 * Anything left external therefore ends up missing from the asar, `package`
 * still reports success, and the app dies on launch with
 * `ERR_MODULE_NOT_FOUND: Cannot find package '...'`. A native module needs
 * `@electron-forge/plugin-auto-unpack-natives` plus a deliberate way of
 * getting it into the package; see §12 of packages/ui/README.md.
 */
const NATIVE_DEPENDENCIES: string[] = [];

/**
 * Everything except Electron, Node builtins and native modules is bundled into
 * `.vite/build/main.js` and `preload.js`.
 *
 * This used to externalize every key of `dependencies`, which relied on those
 * packages being present in the packaged app's `node_modules`. That assumption
 * held only while the app had its own `node_modules`; under workspace hoisting
 * it silently stopped being true. Bundling removes the runtime dependency on
 * `node_modules` existing at all, which is also what makes workspace packages
 * such as `@reactronite/ui` work when imported from the main process.
 */
export const external = [...builtins, ...NATIVE_DEPENDENCIES];

export function getBuildConfig (env: ConfigEnv<'build'>): UserConfig {
  const { root, mode, command } = env;

  return {
    root,
    mode,
    build: {
      // Prevent multiple builds from interfering with each other.
      emptyOutDir: false,
      // 🚧 Multiple builds may conflict.
      outDir: '.vite/build',
      watch: command === 'serve' ? {} : null,
      minify: command === 'build'
    },
    clearScreen: false
  };
}

export function getDefineKeys (names: string[]) {
  const define: { [name: string]: VitePluginRuntimeKeys } = {};

  return names.reduce((acc, name) => {
    const NAME = name.toUpperCase();
    const keys: VitePluginRuntimeKeys = {
      VITE_DEV_SERVER_URL: `${NAME}_VITE_DEV_SERVER_URL`,
      VITE_NAME: `${NAME}_VITE_NAME`
    };

    acc[name] = keys;
    return acc;
  }, define);
}

export function getBuildDefine (env: ConfigEnv<'build'>) {
  const { command, forgeConfig } = env;
  const names = forgeConfig.renderer
    .filter(({ name }) => name != null)
    .map(({ name }) => name as string);
  const defineKeys = getDefineKeys(names);
  const define = Object.entries(defineKeys).reduce(
    (acc, [name, keys]) => {
      const { VITE_DEV_SERVER_URL, VITE_NAME } = keys;
      const def = {
        [VITE_DEV_SERVER_URL]:
          command === 'serve' ? JSON.stringify(process.env[VITE_DEV_SERVER_URL]) : undefined,
        [VITE_NAME]: JSON.stringify(name)
      };
      return Object.assign(acc, def);
    },
    {} as Record<string, unknown>
  );

  return define;
}

export function pluginExposeRenderer (name: string): Plugin {
  const { VITE_DEV_SERVER_URL } = getDefineKeys([name])[name];

  return {
    name: '@electron-forge/plugin-vite:expose-renderer',
    configureServer (server) {
      process.viteDevServers ??= {};
      // Expose server for preload scripts hot reload.
      process.viteDevServers[name] = server;

      server.httpServer?.once('listening', () => {
        const addressInfo = server.httpServer?.address() as AddressInfo;
        // Expose env constant for main process use.
        process.env[VITE_DEV_SERVER_URL] = `http://localhost:${addressInfo?.port}`;
      });
    }
  };
}

export function pluginHotRestart (command: 'reload' | 'restart'): Plugin {
  return {
    name: '@electron-forge/plugin-vite:hot-restart',
    closeBundle () {
      if (command === 'reload') {
        for (const server of Object.values(process.viteDevServers)) {
          // Preload scripts hot reload.
          server.ws.send({ type: 'full-reload' });
        }
      } else {
        // Main process hot restart.
        // https://github.com/electron/forge/blob/v7.2.0/packages/api/core/src/api/start.ts#L216-L223
        process.stdin.emit('data', 'rs');
      }
    }
  };
}

import { builtinModules } from 'node:module';
import type { AddressInfo } from 'node:net';

import type { ConfigEnv, Plugin, UserConfig } from 'vite';

import pkg from '../package.json';

export const builtins = ['electron', ...builtinModules.flatMap((m) => [m, `node:${m}`])];

const dependencies = ('dependencies' in pkg ? pkg.dependencies : {}) as Record<string, string>;

/**
 * Dependencies that live on disk in this repo rather than in the registry.
 *
 * ⚠️ Add every new workspace package here.
 *
 * These must NOT be externalized. An external import survives into
 * `.vite/build/*.js` as a bare specifier that Node resolves from
 * `node_modules` at runtime — but a workspace dependency is only a symlink
 * pointing outside the app directory, and `asar: true` plus the
 * `OnlyLoadAppFromAsar` fuse (see forge.config.ts) means nothing outside the
 * archive can be loaded. The packaged app then dies with "Cannot find module"
 * even though `npm run dev` worked fine. Bundling them sidesteps it entirely.
 *
 * This is a hand-maintained list because npm does not support pnpm's
 * `workspace:` protocol — a workspace dependency is written as `"*"`, which is
 * indistinguishable from a registry version range. The `file:`/`link:` check
 * still catches a dependency pointed at a directory outside the repo.
 */
const LOCAL_PACKAGES = ['@reactronite/ui'];

const isLocalDependency = (name: string, spec: string) =>
  LOCAL_PACKAGES.includes(name) || /^(?:file|link|workspace):/.test(spec);

export const external = [
  ...builtins,
  ...Object.keys(dependencies).filter((name) => !isLocalDependency(name, dependencies[name]))
];

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

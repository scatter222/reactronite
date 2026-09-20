import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { type ConfigEnv, defineConfig } from 'vite';
import { checker } from 'vite-plugin-checker';
import svgrPlugin from 'vite-plugin-svgr';
import viteTsconfigPaths from 'vite-tsconfig-paths';

import { pluginExposeRenderer } from './vite.base.config';

import { productName, version } from '../package.json';

// https://vitejs.dev/config
export default defineConfig((env) => {
  const forgeEnv = env as ConfigEnv<'renderer'>;
  const { root, mode, forgeConfigSelf } = forgeEnv;
  const name = forgeConfigSelf.name ?? '';

  return {
    root,
    mode,
    base: './',
    build: {
      outDir: `.vite/renderer/${name}`
    },
    resolve: {
      // Must stay false for workspace packages. A workspace dependency is a
      // symlink; with preserveSymlinks the resolved id keeps the
      // `node_modules/@reactronite/ui/...` shape, which makes Vite treat the
      // package as a prebuilt dep and breaks HMR on its source files.
      // Resolving through the symlink to `packages/ui/src/...` gives normal
      // dev-server behaviour — see `server.fs.allow` below.
      preserveSymlinks: false,
      // A shared component package that ends up next to a second copy of React
      // throws "Invalid hook call" on the first useState. Force one copy.
      dedupe: ['react', 'react-dom']
    },
    server: {
      fs: {
        // Vite infers this from pnpm-workspace.yaml, but being explicit means
        // an out-of-tree `file:../some-lib` dependency also works instead of
        // failing with "is outside of Vite serving allow list".
        allow: [path.resolve(root, '..', '..')]
      }
    },
    clearScreen: false,
    plugins: [
      pluginExposeRenderer(name),
      svgrPlugin(),
      viteTsconfigPaths(),
      checker({
        typescript: true,
        eslint: false,
        overlay: false,
        enableBuild: false
      }),
      tailwindcss()
    ],
    define: {
      __DARWIN__: process.platform === 'darwin',
      __WIN32__: process.platform === 'win32',
      __LINUX__: process.platform === 'linux',
      __APP_NAME__: JSON.stringify(productName),
      __APP_VERSION__: JSON.stringify(version),
      __DEV__: process.env.NODE_ENV === 'development',
      __BUILD_MODE__: JSON.stringify(process.env.BUILD_MODE || 'workstation')
    }
  };
});

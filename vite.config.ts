import { reactRouter } from '@react-router/dev/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  environments: { prerender: { build: { outDir: 'build/prerender' } } },
  plugins: [
    {
      name: 'compiled-prerender-runtime',
      resolveId(id) {
        if (id === 'virtual:prerender-runtime')
          return fileURLToPath(new URL('./build/server/index.js', import.meta.url));
      },
    },
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      experimental: {
        prerenderWorker: {
          viteEnvironment: { name: 'prerender' },
          config: (_, { entryWorkerConfig }) => ({
            ...entryWorkerConfig,
            name: 'chess-arena-prerender',
            // Reuse the completed runtime bundle, avoiding a second Router build.
            main: './workers/prerender.ts',
            compatibility_flags: ['nodejs_compat'],
            vars: { IS_RR_BUILD_REQUEST: 'yes' },
            assets: { binding: 'ASSETS', run_worker_first: true },
          }),
        },
      },
    }),
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});

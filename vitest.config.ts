import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: { 'cloudflare:workers': fileURLToPath(new URL('./tests/env.ts', import.meta.url)) },
  },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 20000, hookTimeout: 30000 },
});

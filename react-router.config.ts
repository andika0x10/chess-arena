import type { Config } from '@react-router/dev/config';

export default {
  // Build a static shell; keep loaders/actions on the Worker.
  ssr: 'unstable_api-only',
} satisfies Config;

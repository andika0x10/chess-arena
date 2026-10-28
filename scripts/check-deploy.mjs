import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
if (
  config.d1_databases[0].database_id === '00000000-0000-0000-0000-000000000000' ||
  !config.vars.APP_ORIGIN.startsWith('https://') ||
  !config.vars.GOOGLE_CLIENT_ID
) {
  throw new Error(
    'Production is not configured. Set your real D1 database_id, HTTPS APP_ORIGIN and GOOGLE_CLIENT_ID in wrangler.jsonc. See README.md.',
  );
}

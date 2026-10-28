import { readFile } from 'node:fs/promises';
import { parse, printParseErrorCode } from 'jsonc-parser';

const source = await readFile('wrangler.jsonc', 'utf8');
const errors = [];
const config = parse(source, errors, { allowTrailingComma: true, disallowComments: false });
if (errors.length) {
  const first = errors[0];
  const line = source.slice(0, first.offset).split('\n').length;
  throw new Error(`Invalid wrangler.jsonc: ${printParseErrorCode(first.error)} at line ${line}.`);
}

const database = Array.isArray(config?.d1_databases)
  ? config.d1_databases.find((database) => database?.binding === 'DB')
  : undefined;
if (
  !database?.database_id ||
  database.database_id === '00000000-0000-0000-0000-000000000000' ||
  typeof config?.vars?.APP_ORIGIN !== 'string' ||
  !config.vars.APP_ORIGIN.startsWith('https://') ||
  !config.vars.GOOGLE_CLIENT_ID
) {
  throw new Error(
    'Production is not configured. Set your real D1 database_id, HTTPS APP_ORIGIN and GOOGLE_CLIENT_ID in wrangler.jsonc. See README.md.',
  );
}

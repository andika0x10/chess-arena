import { afterAll, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'chess-arena-deploy-'));
const configPath = join(directory, 'wrangler.jsonc');
const script = fileURLToPath(new URL('../scripts/check-deploy.mjs', import.meta.url));
const production = {
  d1_databases: [{ binding: 'DB', database_id: '11111111-1111-4111-8111-111111111111' }],
  vars: { APP_ORIGIN: 'https://arena.example.com', GOOGLE_CLIENT_ID: 'test-client' },
};

afterAll(() => {
  unlinkSync(configPath);
  rmdirSync(directory);
});

function check(source: string) {
  writeFileSync(configPath, source);
  return spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
}

it('accepts regular JSON production configuration', () => {
  expect(check(JSON.stringify(production)).status).toBe(0);
});

it('accepts JSONC comments and trailing commas without damaging HTTPS URLs', () => {
  const result = check(`{
    // Wrangler supports comments.
    "d1_databases": [{ "binding": "DB", "database_id": "11111111-1111-4111-8111-111111111111", }, ],
    "vars": {
      "APP_ORIGIN": "https://arena.example.com", /* keep the URL intact */
      "GOOGLE_CLIENT_ID": "test-client",
    },
  }`);
  expect(result.status, result.stderr).toBe(0);
});

it('rejects malformed JSONC instead of accepting a partial parse', () => {
  const result = check(JSON.stringify(production).slice(0, -1));
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Invalid wrangler.jsonc:');
  expect(result.stderr).toContain('at line');
});

it('reports missing production bindings without a TypeError', () => {
  const result = check('{ "vars": {}, }');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Production is not configured.');
  expect(result.stderr).not.toContain('TypeError');
});

it('still rejects placeholder database IDs, localhost origins and empty client IDs', () => {
  for (const config of [
    {
      ...production,
      d1_databases: [{ binding: 'DB', database_id: '00000000-0000-0000-0000-000000000000' }],
    },
    { ...production, vars: { ...production.vars, APP_ORIGIN: 'http://localhost:5173' } },
    { ...production, vars: { ...production.vars, GOOGLE_CLIENT_ID: '' } },
  ]) {
    const result = check(JSON.stringify(config));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Production is not configured.');
  }
});

it('parses the repository JSONC configuration before checking production settings', () => {
  const template = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const result = check(template);
  expect(result.stderr).not.toContain('SyntaxError');
  expect(result.stderr).not.toContain('Invalid wrangler.jsonc');
  expect(result.status === 0 || result.stderr.includes('Production is not configured.')).toBe(true);
});

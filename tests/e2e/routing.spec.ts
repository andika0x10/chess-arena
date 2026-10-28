import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('deployment uses the runtime Worker without prerender privileges', async () => {
  test.skip(!process.env.E2E_PREVIEW, 'Requires the production build.');
  const runtime = JSON.parse(await readFile('build/server/wrangler.json', 'utf8'));
  const deploy = JSON.parse(await readFile('.wrangler/deploy/config.json', 'utf8'));
  expect(resolve('.wrangler/deploy', deploy.configPath)).toBe(
    resolve('build/server/wrangler.json'),
  );
  expect(deploy.auxiliaryWorkers).toEqual([]);
  expect(runtime.vars).not.toHaveProperty('IS_RR_BUILD_REQUEST');
  expect(runtime.compatibility_flags).not.toContain('nodejs_compat');
  expect(runtime.assets.not_found_handling).toBe('single-page-application');
});

test('direct page loads and refreshes initialize from the static shell', async ({
  page,
  request,
}) => {
  test.skip(!process.env.E2E_PREVIEW, 'Static asset routing requires the production preview.');
  for (const [path, heading] of [
    ['/', 'Your next good move.'],
    ['/account', 'A place for your progress.'],
    ['/games', 'Your first move starts here.'],
    ['/leaderboard', 'Steady progress.'],
    ['/play/local_missing', 'Game unavailable.'],
    ['/games/local_missing/review', 'Looking back.'],
  ]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    expect(html).toContain('Loading your game space');
    expect(html).not.toContain('arena_session');
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});

test('server data and native endpoints stay separate from the static fallback', async ({
  request,
}) => {
  test.skip(!process.env.E2E_PREVIEW, 'Static asset routing requires the production preview.');
  const data = await request.get('/_.data');
  expect(data.status()).toBe(200);
  expect(data.headers()['cache-control']).toBe('private, no-store');
  expect(data.headers()['content-type']).not.toContain('text/html');
  const manifest = await request.get('/__manifest?version=missing&paths=/games');
  expect(manifest.status()).toBe(204);
  expect(manifest.headers()['cache-control']).toBe('private, no-store');
  const api = await request.post('/api/games', {
    headers: { Origin: 'http://127.0.0.1:5180' },
    data: { intent: 'create', level: 1, color: 'w' },
  });
  expect(api.status()).toBe(401);
  expect(api.headers()['cache-control']).toBe('private, no-store');
  expect((await request.get('/api/unknown')).status()).toBe(404);
  expect((await request.get('/auth/unknown')).status()).toBe(404);
  expect((await request.get('/logout')).status()).toBe(405);
  const signIn = await request.get('/auth/google', { maxRedirects: 0 });
  expect([302, 503]).toContain(signIn.status());
  expect(signIn.headers()['cache-control']).toBe('private, no-store');
  if (signIn.status() === 302) {
    expect(new URL(signIn.headers()['location']).hostname).toBe('accounts.google.com');
    expect(signIn.headers()['set-cookie']).toContain('arena_oauth=');
  }
  const callback = await request.get('/auth/google/callback', { maxRedirects: 0 });
  expect(callback.status()).toBe(signIn.status() === 503 ? 503 : 302);
  if (callback.status() === 302)
    expect(callback.headers()['location']).toBe('/account?error=signin');
  const forbidden = await request.post('/logout', {
    headers: { Origin: 'https://other.example' },
    maxRedirects: 0,
  });
  expect(forbidden.status()).toBe(403);
  const logout = await request.post('/logout', {
    headers: { Origin: 'http://127.0.0.1:5180' },
    maxRedirects: 0,
  });
  expect(logout.status()).toBe(303);
  expect(logout.headers()['set-cookie']).toContain('Max-Age=0');
  expect(logout.headers()['cache-control']).toBe('private, no-store');
  const engine = await request.get('/engine/19.0.1/stockfish-19-lite-single.js');
  expect(engine.status()).toBe(200);
  expect(engine.headers()['cache-control']).toContain('immutable');
});

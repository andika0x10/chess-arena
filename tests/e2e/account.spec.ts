import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
const user = randomUUID(),
  token = randomUUID() + randomUUID();
function sql(command: string) {
  execFileSync(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'd1',
      'execute',
      'chess-arena',
      '--local',
      '--command',
      command,
    ],
    { stdio: 'pipe' },
  );
}
test.beforeAll(() => {
  sql(
    `INSERT INTO users(id,google_sub,name,created_at) VALUES('${user}','e2e-${user}','Test player',${Date.now()}); INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('${createHash('sha256').update(token).digest('hex')}','${user}',${Date.now() + 3600000});`,
  );
});
test.afterAll(() => {
  sql(
    `DELETE FROM reviews WHERE user_id='${user}'; DELETE FROM achievements WHERE user_id='${user}'; DELETE FROM games WHERE user_id='${user}'; DELETE FROM sessions WHERE user_id='${user}'; DELETE FROM users WHERE id='${user}';`,
  );
});
test('account autosave recovers offline moves and stores a private review', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'arena_session',
      value: token,
      url: 'http://127.0.0.1:5180',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Test player' })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page).toHaveURL(/\/play\/(?!local_)/);
  const gameUrl = page.url();
  let offline = true;
  await page.route('**/api/games/**', (route) => (offline ? route.abort() : route.continue()));
  await page.getByLabel('Move by keyboard').fill('e4');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Not synced', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.move-row').first()).toContainText('e4');
  offline = false;
  await page.getByRole('button', { name: 'Retry sync' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Resign game', exact: true }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Review game' }).click();
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByText('Analysis complete. Explore the moves that mattered.')).toBeVisible({
    timeout: 45000,
  });
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByRole('button', { name: 'Save review' })).toBeVisible();
  await other.close();
  const stranger = await context.browser()!.newContext();
  const outsider = await stranger.newPage();
  await outsider.goto(gameUrl);
  await expect(outsider.getByText('Sign in to open your saved game.')).toBeVisible();
  await stranger.close();
  await page.goto('/account');
  await page.getByLabel('Public name').fill('Updated player');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Public name saved.')).toBeVisible();
  const nativeContext = await context.browser()!.newContext({ javaScriptEnabled: false });
  await nativeContext.addCookies([
    {
      name: 'arena_session',
      value: token,
      url: 'http://127.0.0.1:5180',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const nativePage = await nativeContext.newPage();
  await nativePage.goto('http://127.0.0.1:5180/account');
  await expect(nativePage.getByRole('heading', { name: 'Setting the board.' })).toBeVisible();
  expect(await nativePage.content()).toContain(
    'Enable JavaScript to play and open your saved games.',
  );
  const invalidName = await nativeContext.request.post('/account', {
    headers: { Origin: 'http://127.0.0.1:5180' },
    form: { name: '' },
  });
  expect(invalidName.status()).toBe(400);
  expect((await invalidName.json()).error).toContain('public name');
  expect(invalidName.headers()['cache-control']).toBe('private, no-store');
  const nativeSave = await nativeContext.request.post('/account', {
    headers: { Origin: 'http://127.0.0.1:5180' },
    form: { name: 'Native form player' },
    maxRedirects: 0,
  });
  expect(nativeSave.status()).toBe(303);
  expect(nativeSave.headers()['location']).toBe('/account');
  await nativeContext.close();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Native form player' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
});

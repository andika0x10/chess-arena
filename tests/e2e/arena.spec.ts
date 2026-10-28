import { test, expect } from '@playwright/test';
import { append, newGame } from '../../app/lib/game';
test('board promotion offers all pieces and supports underpromotion', async ({ page }) => {
  let game = newGame(1, 'w');
  for (const move of ['h2h4', 'a7a5', 'h4h5', 'a5a4', 'h5h6', 'a4a3', 'h6g7', 'a3b2'])
    game = append(game, move);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await page.evaluate(async (game) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('chess-arena', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('games', { keyPath: 'game.id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put({ game, owner: null, syncedRevision: 0 });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, game);
  await page.goto('/play/' + game.id);
  await expect(page.getByLabel('Move by keyboard')).toBeEnabled();
  const board = page.locator('cg-board');
  await expect(board).toBeVisible();
  const size = (await page.locator('.cg-wrap.board').boundingBox())!;
  await board.click({ position: { x: (size.width * 6.5) / 8, y: (size.height * 1.5) / 8 } });
  await board.click({ position: { x: (size.width * 7.5) / 8, y: (size.height * 0.5) / 8 } });
  const dialog = page.getByRole('dialog', { name: 'Choose promotion piece' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Queen', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Knight', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.move-history')).toContainText('gxh8=N');
});
test('guest game, real WASM response, refresh, resign and full review', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your next good move.' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page).toHaveURL(/\/play\/local_/);
  await page.getByLabel('Move by keyboard').fill('e4');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.move-row').first()).toContainText('e4');
  await expect(page.locator('.move-row').first().locator('span').nth(2)).not.toBeEmpty();
  await page.reload();
  await expect(page.locator('.move-row').first()).toContainText('e4');
  await page.screenshot({ path: 'artifacts/play-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Resign game', exact: true }).click();
  await page.getByRole('link', { name: 'Review game', exact: true }).click();
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await expect(page.getByText('Analysis complete. Explore the moves that mattered.')).toBeVisible({
    timeout: 45000,
  });
  await page.getByRole('button', { name: 'Next position', exact: true }).click();
  await expect
    .poll(() =>
      page.locator('cg-board').evaluate((board) => {
        const pieces = [...board.querySelectorAll('piece')] as (HTMLElement & { cgKey?: string })[];
        const square = board.getBoundingClientRect().width / 8;
        return (
          pieces.some((piece) => piece.cgKey === 'e4' && piece.classList.contains('white')) &&
          pieces.every((piece) => {
            const file = piece.cgKey!.charCodeAt(0) - 97;
            const x = new DOMMatrixReadOnly(getComputedStyle(piece).transform).m41;
            return Math.abs(x - file * square) < 1;
          })
        );
      }),
    )
    .toBe(true);
  await page.screenshot({ path: 'artifacts/review-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Save review' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('Black starts after the bot, mobile fits and guest history resumes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/home-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Black', exact: true }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.move-row')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/play-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'My games', exact: true }).click();
  await page.getByRole('link', { name: 'Continue game' }).click();
  await expect(page.getByLabel('Move by keyboard')).toBeEnabled();
});
test('engine failure offers a working retry', async ({ page }) => {
  await page.route('**/engine/**/*.js', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page).toHaveURL(/\/play\/local_/);
  await expect(page.getByRole('button', { name: 'Retry engine' })).toBeVisible({ timeout: 35000 });
  await page.unroute('**/engine/**/*.js');
  await page.getByRole('button', { name: 'Retry engine' }).click();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 30000 });
});
test('two tabs cannot overwrite the same guest game', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByLabel('Move by keyboard')).toBeEnabled();
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByLabel('Move by keyboard')).toBeEnabled();
  await page.getByLabel('Move by keyboard').fill('e4');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(
    other.getByText('This game changed in another tab. Reload the latest version.'),
  ).toBeVisible();
  await expect(other.getByLabel('Move by keyboard')).toBeDisabled();
  await other.close();
});
test('analysis can pause, resume, and explore without changing the game', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByLabel('Move by keyboard').fill('e4');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Resign game', exact: true }).click();
  await page.getByRole('link', { name: 'Review game' }).click();
  await page.getByRole('button', { name: 'Analyse game' }).click();
  await page.getByRole('button', { name: 'Pause analysis' }).click();
  await expect(page.getByRole('button', { name: /Analyse game|Resume analysis/ })).toBeVisible();
  await page.getByRole('button', { name: /Analyse game|Resume analysis/ }).click();
  await expect(page.getByText('Analysis complete. Explore the moves that mattered.')).toBeVisible({
    timeout: 45000,
  });
  await page.getByLabel('Move by keyboard').fill('d4');
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText('Exploring: d4')).toBeVisible();
  await page.getByRole('button', { name: 'Return to game' }).click();
  await expect(page.getByText('Exploring: d4')).not.toBeVisible();
  await expect(page.locator('.review-moves')).toContainText('e4');
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { env } from './env';
import {
  createSession,
  importGame,
  insertGame,
  loadGame,
  moveGame,
  resignGame,
  saveReview,
  loadReview,
  sessionCookie,
  userFor,
  deleteSession,
  sameOrigin,
  listGames,
} from '../app/lib/db.server';
import { ANALYSIS_VERSION, newGame } from '../app/lib/game';
let mf: Miniflare;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      compatibilityDate: '2026-10-23',
      d1Databases: ['DB'],
    }),
  );
  env.DB = await mf.getD1Database('DB');
  const migration = await readFile('migrations/0001_initial.sql', 'utf8');
  await env.DB.batch(
    migration
      .split(';')
      .filter((s) => s.trim())
      .map((s) => env.DB.prepare(s)),
  );
});
afterAll(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await env.DB.batch(
    [
      'DELETE FROM reviews',
      'DELETE FROM achievements',
      'DELETE FROM games',
      'DELETE FROM sessions',
      'DELETE FROM users',
    ].map((s) => env.DB.prepare(s)),
  );
  for (const id of ['alice', 'bob'])
    await env.DB.prepare('INSERT INTO users VALUES(?,?,?,?)').bind(id, id, id, Date.now()).run();
});
describe('D1 persistence and access control', () => {
  it('saves moves once, rejects conflicts and enforces ownership', async () => {
    const game = newGame(2, 'w', true);
    await insertGame('alice', game);
    expect((await moveGame('alice', game.id, 0, 'e2e4')).revision).toBe(1);
    expect((await moveGame('alice', game.id, 0, 'e2e4')).revision).toBe(1);
    await expect(moveGame('alice', game.id, 0, 'd2d4')).rejects.toMatchObject({ status: 409 });
    await expect(loadGame(game.id, 'bob')).rejects.toMatchObject({ status: 404 });
    expect((await listGames('alice')).length).toBe(1);
    expect(await listGames('bob')).toEqual([]);
  });
  it('allows only one competing move at the same revision', async () => {
    const game = newGame(1, 'w', true);
    await insertGame('alice', game);
    const results = await Promise.allSettled([
      moveGame('alice', game.id, 0, 'e2e4'),
      moveGame('alice', game.id, 0, 'd2d4'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await loadGame(game.id, 'alice')).moves).toHaveLength(1);
  });
  it('records one achievement per level and handles repeated completion', async () => {
    for (let i = 0; i < 2; i++) {
      const game = newGame(3, 'b', true);
      await insertGame('alice', game);
      const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
      for (let j = 0; j < moves.length; j++) await moveGame('alice', game.id, j, moves[j]);
      await moveGame('alice', game.id, 3, 'd8h4');
    }
    expect((await env.DB.prepare('SELECT * FROM achievements').all()).results).toHaveLength(1);
  });
  it('imports guest games once without achievements, ignores forged eligibility', async () => {
    const guest = { ...newGame(6, 'b'), moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], eligible: true };
    const imported = await importGame('alice', guest);
    expect(imported.eligible).toBe(false);
    expect(imported.result).toBe('win');
    expect((await importGame('alice', guest)).id).toBe(imported.id);
    expect((await env.DB.prepare('SELECT * FROM achievements').all()).results).toHaveLength(0);
    await expect(importGame('bob', guest)).rejects.toMatchObject({ status: 404 });
  });
  it('resigns idempotently and prevents moves after resignation', async () => {
    const game = newGame(1, 'w', true);
    await insertGame('alice', game);
    expect((await resignGame('alice', game.id, 0)).result).toBe('loss');
    expect((await resignGame('alice', game.id, 0)).revision).toBe(1);
    await expect(moveGame('alice', game.id, 1, 'e2e4')).rejects.toThrow();
  });
  it('validates reviews, isolates owners, and retains longer analysis', async () => {
    const game = newGame(1, 'w', true);
    await insertGame('alice', game);
    await moveGame('alice', game.id, 0, 'e2e4');
    await resignGame('alice', game.id, 1);
    const evaluation = { cp: 10, pv: ['e2e4'], depth: 14 };
    const review = {
      version: ANALYSIS_VERSION,
      positions: [evaluation, { ...evaluation, pv: ['e7e5'] }],
    };
    await saveReview('alice', game.id, review);
    await saveReview('alice', game.id, { ...review, positions: [evaluation] });
    expect((await loadReview(game.id, 'alice'))?.positions).toHaveLength(2);
    expect(await loadReview(game.id, 'bob')).toBeNull();
    await expect(saveReview('bob', game.id, review)).rejects.toMatchObject({ status: 404 });
    await expect(saveReview('alice', game.id, { ...review, version: 'other' })).rejects.toThrow();
  });
  it('hashes session tokens, expires and revokes sessions', async () => {
    const token = await createSession('alice');
    const request = new Request('https://arena.test/account', {
      headers: { Cookie: `arena_session=${token}` },
    });
    expect(await userFor(request)).toMatchObject({ id: 'alice' });
    expect((await env.DB.prepare('SELECT token_hash FROM sessions').first()).token_hash).not.toBe(
      token,
    );
    expect(sessionCookie(request, token)).toContain('Secure');
    expect(sessionCookie(request, token)).toContain('HttpOnly');
    await env.DB.prepare('UPDATE sessions SET expires_at=0').run();
    expect(await userFor(request)).toBeNull();
    await deleteSession(request);
    expect((await env.DB.prepare('SELECT * FROM sessions').all()).results).toHaveLength(0);
  });
  it('rejects cross-site writes', () => {
    expect(() =>
      sameOrigin(
        new Request('https://arena.test/api/games', { headers: { Origin: 'https://evil.test' } }),
      ),
    ).toThrow();
    expect(() =>
      sameOrigin(
        new Request('https://arena.test/api/games', { headers: { Origin: 'https://arena.test' } }),
      ),
    ).not.toThrow();
  });
});

import { env } from 'cloudflare:workers';
import {
  append,
  newGame,
  replay,
  ANALYSIS_VERSION,
  BOT_VERSION,
  type Game,
  type Review,
} from './game';
export type User = { id: string; name: string };
export async function updatePublicName(userId: string, input: unknown) {
  const name = typeof input === 'string' ? input.trim() : '';
  if (name.length < 2 || name.length > 32 || /[\p{Cc}\p{Cf}]/u.test(name))
    throw new Error('Use a public name between 2 and 32 characters');
  await db().prepare('UPDATE users SET name=? WHERE id=?').bind(name, userId).run();
}
export function db() {
  if (!env.DB) throw new Response('Database is not configured', { status: 503 });
  return env.DB;
}
const digest = async (token: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
export function cookie(request: Request, name: string) {
  return request.headers
    .get('Cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='))
    ?.slice(name.length + 1);
}
export function sessionCookie(request: Request, token: string, age = 60 * 60 * 24 * 30) {
  return `arena_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function userFor(request: Request): Promise<User | null> {
  const token = cookie(request, 'arena_session');
  if (!token || !env.DB) return null;
  return db()
    .prepare(
      'SELECT u.id, u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',
    )
    .bind(await digest(token), Date.now())
    .first<User>();
}
export async function requireUser(request: Request) {
  const user = await userFor(request);
  if (!user) throw new Response('Sign in to continue', { status: 401 });
  return user;
}
export function sameOrigin(request: Request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin)
    throw new Response('Invalid request origin', { status: 403 });
}
export async function createSession(userId: string) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  await db()
    .prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(await digest(token), userId, Date.now() + 30 * 86400000)
    .run();
  return token;
}
export async function deleteSession(request: Request) {
  const token = cookie(request, 'arena_session');
  if (token)
    await db()
      .prepare('DELETE FROM sessions WHERE token_hash=?')
      .bind(await digest(token))
      .run();
}
export async function loadGame(id: string, userId: string): Promise<Game> {
  const row = await db()
    .prepare('SELECT data FROM games WHERE id=? AND user_id=?')
    .bind(id, userId)
    .first<{ data: string }>();
  if (!row) throw new Response('Game not found', { status: 404 });
  return JSON.parse(row.data);
}
export async function insertGame(userId: string, game: Game) {
  await db()
    .prepare(
      'INSERT INTO games(id,user_id,data,revision,result,level,eligible,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      game.id,
      userId,
      JSON.stringify(game),
      game.revision,
      game.result,
      game.level,
      Number(game.eligible),
      game.createdAt,
      game.updatedAt,
    )
    .run();
}
export async function listGames(userId: string) {
  const result = await db()
    .prepare('SELECT data FROM games WHERE user_id=? ORDER BY updated_at DESC LIMIT 100')
    .bind(userId)
    .all<{ data: string }>();
  return result.results.map((row) => JSON.parse(row.data) as Game);
}
export async function updateGame(userId: string, current: Game, next: Game) {
  const results = await db().batch([
    db()
      .prepare(
        'UPDATE games SET data=?,revision=?,result=?,updated_at=? WHERE id=? AND user_id=? AND revision=?',
      )
      .bind(
        JSON.stringify(next),
        next.revision,
        next.result,
        next.updatedAt,
        current.id,
        userId,
        current.revision,
      ),
    db()
      .prepare(
        "INSERT OR IGNORE INTO achievements(user_id,level,game_id) SELECT user_id,level,id FROM games WHERE id=? AND user_id=? AND result='win' AND eligible=1",
      )
      .bind(current.id, userId),
  ]);
  if (!results[0].meta.changes)
    throw new Response('Game changed in another tab. Reload the latest version.', { status: 409 });
  return next;
}
export async function moveGame(userId: string, id: string, revision: number, move: string) {
  const current = await loadGame(id, userId);
  if (current.revision > revision && current.moves[revision] === move) return current;
  if (current.revision !== revision)
    throw new Response('Game changed in another tab. Reload the latest version.', { status: 409 });
  return updateGame(userId, current, append(current, move));
}
export async function resignGame(userId: string, id: string, revision: number) {
  const current = await loadGame(id, userId);
  if (current.result !== 'active') return current;
  if (current.revision !== revision)
    throw new Response('Game changed in another tab. Reload the latest version.', { status: 409 });
  return updateGame(userId, current, {
    ...current,
    revision: current.revision + 1,
    result: 'loss',
    resigned: true,
    updatedAt: Date.now(),
  });
}
export async function importGame(userId: string, input: Game) {
  if (
    !input.id?.startsWith('local_') ||
    input.botVersion !== BOT_VERSION ||
    !Array.isArray(input.moves) ||
    input.moves.length > 2000
  )
    throw new Error('Invalid guest game');
  const base = newGame(input.level, input.color);
  const verified = replay({ ...base, moves: input.moves, resigned: !!input.resigned });
  const game = { ...verified, id: `import_${input.id}`, eligible: false };
  const old = await db()
    .prepare('SELECT user_id FROM games WHERE id=?')
    .bind(game.id)
    .first<{ user_id: string }>();
  if (old) {
    if (old.user_id !== userId) throw new Response('Game not found', { status: 404 });
    return loadGame(game.id, userId);
  }
  await insertGame(userId, game);
  return game;
}
export async function loadReview(id: string, userId: string): Promise<Review | null> {
  const row = await db()
    .prepare('SELECT data FROM reviews WHERE game_id=? AND user_id=? AND version=?')
    .bind(id, userId, ANALYSIS_VERSION)
    .first<{ data: string }>();
  return row ? JSON.parse(row.data) : null;
}
export async function saveReview(userId: string, id: string, review: Review) {
  const game = await loadGame(id, userId);
  if (
    game.result === 'active' ||
    review.version !== ANALYSIS_VERSION ||
    !Array.isArray(review.positions) ||
    review.positions.length > game.moves.length + 1
  )
    throw new Error('Invalid review');
  for (const p of review.positions)
    if (
      !Number.isFinite(p.cp) ||
      !Number.isInteger(p.depth) ||
      p.depth < 0 ||
      p.depth > 128 ||
      (p.mate !== undefined && !Number.isFinite(p.mate)) ||
      !Array.isArray(p.pv) ||
      p.pv.length > 128 ||
      p.pv.some((m) => typeof m !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))
    )
      throw new Error('Invalid evaluation');
  await db()
    .prepare(
      "INSERT INTO reviews(game_id,user_id,version,data) VALUES(?,?,?,?) ON CONFLICT(game_id,version) DO UPDATE SET data=excluded.data WHERE json_array_length(excluded.data,'$.positions') >= json_array_length(reviews.data,'$.positions')",
    )
    .bind(id, userId, review.version, JSON.stringify(review))
    .run();
}

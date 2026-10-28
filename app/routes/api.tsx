import type { Route } from './+types/api';
import {
  updatePublicName,
  importGame,
  insertGame,
  moveGame,
  requireUser,
  resignGame,
  sameOrigin,
  saveReview,
} from '../lib/db.server';
import { newGame } from '../lib/game';
export async function action({ request, params }: Route.ActionArgs) {
  sameOrigin(request);
  const user = await requireUser(request);
  if (Number(request.headers.get('Content-Length') ?? 0) > 500000)
    return Response.json({ error: 'Request too large' }, { status: 413 });
  try {
    const text = await request.text();
    if (text.length > 500000) return Response.json({ error: 'Request too large' }, { status: 413 });
    const body = JSON.parse(text);
    if (body.intent === 'create') {
      const game = newGame(body.level, body.color, true);
      await insertGame(user.id, game);
      return Response.json({ game });
    }
    if (body.intent === 'import')
      return Response.json({ game: await importGame(user.id, body.game) });
    if (body.intent === 'name') {
      await updatePublicName(user.id, body.name);
      return Response.json({ ok: true });
    }
    if (!params.gameId) throw new Error('Game ID is required');
    if (body.intent === 'review') {
      await saveReview(user.id, params.gameId, body.review);
      return Response.json({ ok: true });
    }
    if (!Number.isInteger(body.revision) || body.revision < 0) throw new Error('Invalid revision');
    if (body.intent === 'move')
      return Response.json({
        game: await moveGame(user.id, params.gameId, body.revision, body.move),
      });
    if (body.intent === 'resign')
      return Response.json({ game: await resignGame(user.id, params.gameId, body.revision) });
    throw new Error('Unknown operation');
  } catch (error) {
    if (error instanceof Response)
      return Response.json({ error: await error.text() }, { status: error.status });
    return Response.json(
      {
        error:
          error instanceof Error &&
          /Invalid|finished|public name|Unknown|Game ID/.test(error.message)
            ? error.message
            : 'Could not save this change. Retry to continue.',
      },
      { status: 400 },
    );
  }
}

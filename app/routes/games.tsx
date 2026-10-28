import { useEffect, useState } from 'react';
import { Link, useRevalidator } from 'react-router';
import type { Route } from './+types/games';
import { listGames, userFor } from '../lib/db.server';
import { localDelete, localGames, localPut, type LocalRecord } from '../lib/local';
import { api } from '../lib/api';
export async function loader({ request }: Route.LoaderArgs) {
  const user = await userFor(request);
  return { user, games: user ? await listGames(user.id) : [] };
}
export default function Games({ loaderData }: Route.ComponentProps) {
  const [local, setLocal] = useState<LocalRecord[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<string | null>(null);
  const revalidator = useRevalidator();
  useEffect(() => {
    localGames()
      .then(setLocal)
      .catch(() => setError('Could not open browser storage.'));
  }, []);
  const merged = new Map(loaderData.games.map((g) => [g.id, g]));
  for (const record of local)
    if (
      (record.owner === null || record.owner === loaderData.user?.id) &&
      (!merged.has(record.game.id) || record.game.revision > merged.get(record.game.id)!.revision)
    )
      merged.set(record.game.id, record.game);
  const games = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <section className="page list-page">
      <div className="page-heading">
        <div>
          <p className="small-note">Every game leaves an idea.</p>
          <h1>Your games.</h1>
        </div>
        <Link className="button secondary" to="/">
          New game
        </Link>
      </div>
      {!loaderData.user && (
        <p className="notice">
          Guest games are saved in this browser. <Link to="/account">Sign in</Link> to keep your
          next games across devices.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {!games.length ? (
        <div className="empty">
          <span aria-hidden="true">♙</span>
          <h2>Your first move starts here.</h2>
          <p>Play a game. Come back to the ideas worth keeping.</p>
          <Link className="button" to="/">
            Play a game
          </Link>
        </div>
      ) : (
        <div className="history-list">
          {games.map((game) => (
            <article key={game.id} className="history-item">
              <div className="history-symbol" aria-hidden="true">
                {game.color === 'w' ? '♙' : '♟'}
              </div>
              <div>
                <h2>Computer · Level {game.level}</h2>
                <p>
                  {game.moves.length} moves played ·{' '}
                  {game.result === 'active'
                    ? 'In progress'
                    : game.result === 'win'
                      ? 'Won'
                      : game.result === 'loss'
                        ? 'Lost'
                        : 'Draw'}
                  {game.id.startsWith('local_') ? ' · This device' : ''}
                </p>
                <time dateTime={new Date(game.updatedAt).toISOString()}>
                  {new Date(game.updatedAt).toISOString().slice(0, 10)}
                </time>
              </div>
              <div className="history-actions">
                <Link
                  className="button secondary"
                  to={game.result === 'active' ? `/play/${game.id}` : `/games/${game.id}/review`}
                >
                  {game.result === 'active' ? 'Continue game' : 'Review game'}
                </Link>
                {loaderData.user && game.id.startsWith('local_') && (
                  <button
                    disabled={busy !== null}
                    className="text-link"
                    onClick={async () => {
                      setBusy(game.id);
                      try {
                        const imported = (await api({ intent: 'import', game })).game!;
                        await localPut({
                          game: imported,
                          owner: loaderData.user!.id,
                          syncedRevision: imported.revision,
                        });
                        await localDelete(game.id);
                        setLocal(await localGames());
                        revalidator.revalidate();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    {busy === game.id ? 'Importing…' : 'Import to account'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/play';
import { loadGame, userFor } from '../lib/db.server';
import { append, notation, position } from '../lib/game';
import { Engine } from '../lib/engine';
import { useGame } from '../lib/use-game';
import { Board } from '../components/Board';
export async function loader({ params, request }: Route.LoaderArgs) {
  const user = await userFor(request);
  const game = params.gameId.startsWith('local_')
    ? null
    : user
      ? await loadGame(params.gameId, user.id)
      : null;
  if (!params.gameId.startsWith('local_') && !user)
    throw new Response('Sign in to open your saved game.', { status: 401 });
  return { game, user };
}
export default function Play({ loaderData, params }: Route.ComponentProps) {
  const { game, ready, status, error, conflict, commit, sync, reload } = useGame(
    params.gameId,
    loaderData.game,
    loaderData.user?.id ?? null,
  );
  const [engineState, setEngineState] = useState('Loading engine'),
    [engineLoaded, setEngineLoaded] = useState(false),
    [engineError, setEngineError] = useState(''),
    [retry, setRetry] = useState(0),
    [confirmResign, setConfirmResign] = useState(false);
  const engine = useRef<Engine | null>(null),
    currentRevision = useRef(game?.revision);
  currentRevision.current = game?.revision;
  useEffect(() => {
    const instance = new Engine();
    engine.current = instance;
    let live = true;
    setEngineState('Loading engine');
    setEngineLoaded(false);
    setEngineError('');
    instance
      .start()
      .then(() => {
        if (live) {
          setEngineState('Ready');
          setEngineLoaded(true);
        }
      })
      .catch((e) => {
        if (live) {
          setEngineState('Unavailable');
          setEngineError((e as Error).message);
        }
      });
    return () => {
      live = false;
      instance.dispose();
    };
  }, [retry]);
  const turn = game ? position(game.moves).turn() : null;
  useEffect(() => {
    if (
      !game ||
      !ready ||
      conflict ||
      game.result !== 'active' ||
      turn === game.color ||
      !engineLoaded ||
      !engine.current
    )
      return;
    let live = true;
    const revision = game.revision;
    setEngineState('Thinking');
    engine.current
      .search(game.moves, game.level)
      .then(async ({ move }) => {
        if (!live || currentRevision.current !== revision) return;
        await commit(append(game, move));
        if (live) setEngineState('Ready');
      })
      .catch((e) => {
        if (live) {
          setEngineError((e as Error).message);
          setEngineState('Unavailable');
        }
      });
    return () => {
      live = false;
    };
  }, [game?.revision, ready, conflict, engineLoaded, commit]);
  if (!game)
    return (
      <section className="page narrow">
        <h1>{error ? 'Game unavailable.' : 'Setting the board.'}</h1>
        <p role="status">{error || 'Finding your saved position…'}</p>
        <Link className="button" to="/">
          New game
        </Link>
      </section>
    );
  const chess = position(game.moves),
    moves = notation(game.moves);
  const finished = game.result !== 'active';
  const result =
    game.result === 'win'
      ? 'Well played. You won.'
      : game.result === 'loss'
        ? 'A game to learn from.'
        : 'An even finish.';
  const humanMove = ready && !conflict && !finished && turn === game.color;
  return (
    <section className="page game-page">
      <div className="game-heading">
        <Link to="/" className="text-link">
          New game
        </Link>
        <span>No clock. Room to think.</span>
        <span className="save-status" role="status">
          {status}
        </span>
      </div>
      <div className="arena-layout">
        <div className="arena-board">
          <div className="player-line">
            <span className="player-avatar">♟</span>
            <div>
              <strong>Computer</strong>
              <span>Level {game.level}</span>
            </div>
            <span className="player-detail" role="status">
              {finished ? 'Game complete' : engineState}
            </span>
          </div>
          <Board
            fen={chess.fen()}
            color={game.color}
            lastMove={game.moves.at(-1)}
            movable={humanMove}
            onMove={(move) => {
              try {
                void commit(append(game, move));
              } catch (e) {
                setEngineError((e as Error).message);
              }
            }}
          />
          <div className="player-line">
            <span className="player-avatar light">♙</span>
            <div>
              <strong>{loaderData.user?.name || 'You'}</strong>
              <span>{game.color === 'w' ? 'White pieces' : 'Black pieces'}</span>
            </div>
            <span className="player-detail">
              {finished
                ? game.result === 'win'
                  ? 'Winner'
                  : 'Game complete'
                : humanMove
                  ? chess.isCheck()
                    ? 'You are in check'
                    : 'Your move'
                  : 'Waiting'}
            </span>
          </div>
        </div>
        <aside className="game-panel">
          <div className="panel-heading">
            <h1>{finished ? result : 'Find your next idea.'}</h1>
            <p>
              {finished
                ? game.resigned
                  ? 'You resigned. Every game has something to teach.'
                  : 'Take a look back at the moves that mattered.'
                : 'No hints. No hurry. See where the position takes you.'}
            </p>
          </div>
          <div className="move-history" aria-label="Move history">
            {!moves.length && (
              <p className="moves-empty">
                A fresh board.
                <br />A new possibility.
              </p>
            )}
            {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
              <div className="move-row" key={i}>
                <span>{i + 1}.</span>
                <span>{moves[i * 2]}</span>
                <span>{moves[i * 2 + 1] || ''}</span>
              </div>
            ))}
          </div>
          <div className="game-actions">
            {finished ? (
              <>
                <Link className="button" to={`/games/${game.id}/review`}>
                  Review game
                </Link>
                <Link className="button secondary" to="/">
                  Play again
                </Link>
              </>
            ) : confirmResign ? (
              <div className="resign-confirm">
                <p>Resign this game?</p>
                <button className="button secondary" onClick={() => setConfirmResign(false)}>
                  Keep playing
                </button>
                <button
                  className="button"
                  onClick={() => {
                    void commit({
                      ...game,
                      result: 'loss',
                      resigned: true,
                      revision: game.revision + 1,
                      updatedAt: Date.now(),
                    });
                    setConfirmResign(false);
                  }}
                >
                  Resign game
                </button>
              </div>
            ) : (
              <button
                className="text-link"
                disabled={conflict || !ready}
                onClick={() => setConfirmResign(true)}
              >
                Resign
              </button>
            )}
          </div>
          <p className="small-note">
            {game.eligible
              ? 'A win counts toward your level progress.'
              : game.id.startsWith('local_')
                ? 'Guest game. Saved on this device.'
                : 'Imported game. Not counted on the leaderboard.'}
          </p>
        </aside>
      </div>
      {engineError && (
        <div className="notice" role="alert">
          <p>{engineError}</p>
          <button
            onClick={() => {
              setEngineError('');
              setRetry((n) => n + 1);
            }}
          >
            Retry engine
          </button>
        </div>
      )}
      {error && (
        <div className="notice" role="alert">
          <p>{error}</p>
          {conflict ? (
            <button onClick={reload}>Reload latest version</button>
          ) : (
            <button onClick={sync}>Retry sync</button>
          )}
        </div>
      )}
    </section>
  );
}

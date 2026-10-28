import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { Route } from './+types/review';
import { loadGame, loadReview, userFor } from '../lib/db.server';
import {
  ANALYSIS_VERSION,
  classify,
  notation,
  position,
  type Evaluation,
  type Review,
} from '../lib/game';
import { Engine } from '../lib/engine';
import { localGet, localReview } from '../lib/local';
import { useGame } from '../lib/use-game';
import { Board } from '../components/Board';
import { api } from '../lib/api';
export async function loader({ params, request }: Route.LoaderArgs) {
  const user = await userFor(request),
    guest = params.gameId.startsWith('local_');
  if (!guest && !user) throw new Response('Sign in to review your saved game.', { status: 401 });
  return {
    user,
    game: guest ? null : await loadGame(params.gameId, user!.id),
    review: guest ? null : await loadReview(params.gameId, user!.id),
  };
}
function evalText(value?: Evaluation) {
  return !value
    ? 'Not analysed'
    : value.mate !== undefined
      ? `Mate ${value.mate > 0 ? '+' : '−'}${Math.abs(value.mate)}`
      : `${value.cp >= 0 ? '+' : ''}${(value.cp / 100).toFixed(2)}`;
}
function variationText(moves: string[], pv: string[]) {
  const chess = position(moves),
    san: string[] = [];
  for (const move of pv.slice(0, 8)) {
    try {
      san.push(chess.move(move).san);
    } catch {
      break;
    }
  }
  return san.join(' ');
}
export default function ReviewPage({ loaderData, params }: Route.ComponentProps) {
  const { game, ready, error, status, sync } = useGame(
    params.gameId,
    loaderData.game,
    loaderData.user?.id ?? null,
  );
  const [review, setReview] = useState<Review>({ version: ANALYSIS_VERSION, positions: [] }),
    [cached, setCached] = useState(false);
  const [index, setIndex] = useState(0),
    [branch, setBranch] = useState<string[]>([]),
    [running, setRunning] = useState(false),
    [message, setMessage] = useState('');
  const instance = useRef<Engine | null>(null),
    generation = useRef(0),
    reviewRef = useRef(review);
  reviewRef.current = review;
  useEffect(() => {
    let live = true;
    localGet(params.gameId)
      .then((record) => {
        if (!live) return;
        const local = record?.review?.version === ANALYSIS_VERSION ? record.review : null;
        const cloud = loaderData.review;
        const selected =
          local && (!cloud || local.positions.length > cloud.positions.length) ? local : cloud;
        if (selected) {
          setReview(selected);
          reviewRef.current = selected;
        }
        setCached(true);
      })
      .catch(() => setMessage('Could not read cached analysis. Check browser storage.'));
    return () => {
      live = false;
      generation.current++;
      instance.current?.dispose();
    };
  }, [params.gameId, loaderData.review]);
  async function persist(value: Review, cloud = false) {
    await localReview(params.gameId, value);
    if (cloud && loaderData.user && !params.gameId.startsWith('local_')) {
      await sync();
      await api({ intent: 'review', review: value }, params.gameId);
    }
  }
  async function analyse() {
    if (!game || running || !cached) return;
    const token = ++generation.current;
    const engine = new Engine();
    instance.current = engine;
    setRunning(true);
    setMessage('Loading engine…');
    let latest = reviewRef.current;
    try {
      await engine.start();
      for (let n = latest.positions.length; n <= game.moves.length; n++) {
        if (token !== generation.current) return;
        setMessage(`Analysing position ${n + 1} of ${game.moves.length + 1}…`);
        const result = await engine.search(game.moves.slice(0, n));
        if (token !== generation.current) return;
        latest = { version: ANALYSIS_VERSION, positions: [...latest.positions, result.evaluation] };
        setReview(latest);
        reviewRef.current = latest;
        await persist(latest);
        // Cloud connectivity must not interrupt analysis already saved on this device.
        if (n % 8 === 0) await persist(latest, true).catch(() => undefined);
      }
      try {
        await persist(latest, true);
        setMessage('Analysis complete. Explore the moves that mattered.');
      } catch {
        setMessage('Analysis complete. Saved on this device. Use Save review to retry cloud sync.');
      }
    } catch (e) {
      if (token === generation.current) setMessage((e as Error).message);
    } finally {
      engine.dispose();
      if (token === generation.current) {
        setRunning(false);
        instance.current = null;
      }
    }
  }
  if (!game || !ready)
    return (
      <section className="page narrow">
        <h1>Looking back.</h1>
        <p>{error || 'Opening your game…'}</p>
        <Link to="/games">My games</Link>
      </section>
    );
  if (game.result === 'active')
    return (
      <section className="page narrow">
        <h1>One move at a time.</h1>
        <p>Finish this game before opening its review.</p>
        <Link className="button" to={`/play/${game.id}`}>
          Continue game
        </Link>
      </section>
    );
  const moves = notation(game.moves),
    shown = [...game.moves.slice(0, index), ...branch],
    chess = position(shown),
    evaluation = review.positions[index];
  const select = (n: number) => {
    setIndex(n);
    setBranch([]);
  };
  const points = review.positions
    .map(
      (p, i) =>
        `${review.positions.length === 1 ? 0 : (i / (game.moves.length || 1)) * 600},${60 - (Math.max(-1000, Math.min(1000, p.cp)) / 1000) * 52}`,
    )
    .join(' ');
  const mistakes = game.moves.map((_, i) =>
    review.positions[i] && review.positions[i + 1]
      ? classify(review.positions[i], review.positions[i + 1], i % 2 ? 'b' : 'w')
      : '',
  );
  return (
    <section className="page review-page">
      <div className="page-heading">
        <div>
          <p className="small-note">Computer · Level {game.level}</p>
          <h1>A second look.</h1>
        </div>
        <Link className="text-link" to="/games">
          My games
        </Link>
      </div>
      <div className="arena-layout">
        <div className="arena-board">
          <Board
            fen={chess.fen()}
            color={game.color}
            lastMove={shown.at(-1)}
            movable={!chess.isGameOver()}
            onMove={(move) => setBranch((old) => [...old, move])}
            label="Analysis board"
          />
          <div className="review-navigation">
            <button aria-label="First position" onClick={() => select(0)}>
              ⇤
            </button>
            <button
              aria-label="Previous position"
              disabled={index === 0 && !branch.length}
              onClick={() =>
                branch.length
                  ? setBranch((old) => old.slice(0, -1))
                  : select(Math.max(0, index - 1))
              }
            >
              ←
            </button>
            <span>
              {index} / {game.moves.length}
            </span>
            <button
              aria-label="Next position"
              disabled={index === game.moves.length}
              onClick={() => select(Math.min(game.moves.length, index + 1))}
            >
              →
            </button>
            <button aria-label="Last position" onClick={() => select(game.moves.length)}>
              ⇥
            </button>
          </div>
          {branch.length > 0 && (
            <div className="branch-note">
              <p>Exploring: {variationText(game.moves.slice(0, index), branch)}</p>
              <button className="text-link" onClick={() => setBranch([])}>
                Return to game
              </button>
            </div>
          )}
          <div className="evaluation-chart">
            <div className="chart-heading">
              <strong>Evaluation</strong>
              <span>White’s perspective</span>
            </div>
            <svg
              viewBox="0 0 600 120"
              role="img"
              aria-label="Evaluation graph. Above the centre favours White; below favours Black."
            >
              <line x1="0" x2="600" y1="60" y2="60" stroke="#bbb" strokeDasharray="3 5" />
              <polyline points={points} fill="none" stroke="black" strokeWidth="2" />
              <line
                x1={(index / (game.moves.length || 1)) * 600}
                x2={(index / (game.moves.length || 1)) * 600}
                y1="0"
                y2="120"
                stroke="#888"
              />
            </svg>
            <input
              aria-label="Select position"
              type="range"
              min="0"
              max={game.moves.length}
              value={index}
              onChange={(e) => select(Number(e.target.value))}
            />
          </div>
        </div>
        <aside className="game-panel">
          <div className="panel-heading">
            <h2>Find the turning points.</h2>
            <p>Review each move, then try a different idea on the board.</p>
          </div>
          <div className="analysis-control">
            <p role="status">
              {message ||
                (review.positions.length
                  ? `${review.positions.length} of ${game.moves.length + 1} positions analysed.`
                  : 'Ready for a closer look?')}
            </p>
            <progress
              aria-label="Analysis progress"
              max={game.moves.length + 1}
              value={review.positions.length}
            />
            {running ? (
              <button
                className="button secondary"
                onClick={() => {
                  generation.current++;
                  instance.current?.dispose();
                  setRunning(false);
                  setMessage('Analysis paused. Your progress is saved on this device.');
                  void persist(reviewRef.current, true).catch((e) =>
                    setMessage((e as Error).message),
                  );
                }}
              >
                Pause analysis
              </button>
            ) : review.positions.length < game.moves.length + 1 ? (
              <button className="button" disabled={!cached} onClick={analyse}>
                {review.positions.length ? 'Resume analysis' : 'Analyse game'}
              </button>
            ) : (
              <button
                className="text-link"
                onClick={() =>
                  void persist(reviewRef.current, true)
                    .then(() => setMessage('Review saved.'))
                    .catch((e) => setMessage((e as Error).message))
                }
              >
                Save review
              </button>
            )}
          </div>
          <div className="position-evaluation">
            <strong>{branch.length ? 'Exploring a variation' : evalText(evaluation)}</strong>
            <p>
              {branch.length
                ? 'Return to the game to see the recorded position evaluation.'
                : evaluation?.pv.length
                  ? `Best line: ${variationText(game.moves.slice(0, index), evaluation.pv)}`
                  : evaluation
                    ? 'End of game.'
                    : 'Analyse this game to see the best line.'}
            </p>
          </div>
          <div className="move-history review-moves" aria-label="Review move history">
            {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
              <div className="move-row" key={i}>
                <span>{i + 1}.</span>
                {[i * 2, i * 2 + 1].map((n) =>
                  moves[n] ? (
                    <button
                      key={n}
                      className={index === n + 1 ? 'selected-move' : ''}
                      onClick={() => select(n + 1)}
                      aria-label={`${moves[n]}${mistakes[n] ? ', ' + mistakes[n] : ''}`}
                    >
                      <span>{moves[n]}</span>
                      {mistakes[n] && (
                        <small title={mistakes[n]}>
                          {mistakes[n] === 'Blunder'
                            ? '??'
                            : mistakes[n] === 'Mistake'
                              ? '?'
                              : '?!'}
                        </small>
                      )}
                    </button>
                  ) : (
                    <span key={n} />
                  ),
                )}
              </div>
            ))}
          </div>
          <p className="small-note">
            Engine estimates, not a verdict. Inaccuracies, mistakes, and blunders are approximate.
            Forced mate is assessed separately.
          </p>
        </aside>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error} <button onClick={sync}>Retry sync</button>
        </p>
      )}
      <p className="small-note">Game: {status}. Analysis is saved independently.</p>
    </section>
  );
}

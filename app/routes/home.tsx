import { useEffect, useState } from 'react';
import { useNavigate, useRouteLoaderData } from 'react-router';
import { Chess } from 'chess.js';
import type { loader as rootLoader } from '../root';
import { Board } from '../components/Board';
import { newGame, type Color } from '../lib/game';
import { localPut } from '../lib/local';
import { api } from '../lib/api';
const descriptions = [
  'Find your footing.',
  'Build your rhythm.',
  'Look a move ahead.',
  'Make every move count.',
  'Put your ideas to the test.',
  'Meet the full challenge.',
];
export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const { user } = useRouteLoaderData<typeof rootLoader>('root')!;
  const [level, setLevel] = useState(1),
    [color, setColor] = useState('w'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const navigate = useNavigate();
  async function play() {
    setBusy(true);
    setError('');
    try {
      const selected: Color =
        color === 'random'
          ? crypto.getRandomValues(new Uint8Array(1))[0] % 2
            ? 'w'
            : 'b'
          : (color as Color);
      const game = user
        ? (await api({ intent: 'create', level, color: selected })).game!
        : newGame(level, selected);
      await localPut({ game, owner: user?.id ?? null, syncedRevision: game.revision });
      navigate('/play/' + game.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start a game. Try again.');
      setBusy(false);
    }
  }
  return (
    <div className="home page">
      <section className="home-intro">
        <p className="small-note">
          <span className="status-dot" />A quiet place to get better.
        </p>
        <h1>
          Your next
          <br />
          good move.
        </h1>
        <p className="intro-copy">
          Just you, the board, and a little room to think.
          <br className="desktop-break" /> Play the computer. Learn something new.
        </p>
        <fieldset className="level-select">
          <legend>Choose your challenge</legend>
          <div className="level-options">
            {descriptions.map((description, i) => (
              <button
                key={i}
                type="button"
                disabled={!hydrated}
                aria-pressed={level === i + 1}
                aria-label={`Level ${i + 1}: ${description}`}
                onClick={() => setLevel(i + 1)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p className="level-description">
            <strong>Level {level}</strong>
            <span>{descriptions[level - 1]}</span>
          </p>
        </fieldset>
        <fieldset className="color-select">
          <legend>Your pieces</legend>
          <div className="segmented">
            {[
              ['w', 'White', '○'],
              ['b', 'Black', '●'],
              ['random', 'Random', '◐'],
            ].map(([value, text, symbol]) => (
              <button
                disabled={!hydrated}
                type="button"
                key={value}
                aria-pressed={color === value}
                onClick={() => setColor(value)}
              >
                <span aria-hidden="true">{symbol}</span>
                {text}
              </button>
            ))}
          </div>
        </fieldset>
        <button className="button play-button" disabled={busy || !hydrated} onClick={play}>
          {busy ? 'Setting up…' : 'Play'}
          <span aria-hidden="true">↗</span>
        </button>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <p className="setup-note">
          No clock. All levels open. {user ? 'Your progress is saved.' : 'No account needed.'}
        </p>
      </section>
      <section className="home-board" aria-label="Board preview">
        <div className="player-line">
          <span className="player-avatar">♟</span>
          <div>
            <strong>Computer</strong>
            <span>Level {level}</span>
          </div>
          <span className="player-detail">Ready when you are</span>
        </div>
        <Board fen={new Chess().fen()} color={color === 'b' ? 'b' : 'w'} />
        <div className="player-line">
          <span className="player-avatar light">♙</span>
          <div>
            <strong>{user?.name || 'You'}</strong>
            <span>A fresh perspective</span>
          </div>
          <span className="player-detail">Your move</span>
        </div>
        <div className="board-caption">
          <span>64 squares. Endless possibilities.</span>
          <span aria-hidden="true">✳</span>
        </div>
      </section>
    </div>
  );
}

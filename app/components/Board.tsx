import { useEffect, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import type { Api } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import type { Color } from '../lib/game';
type Props = {
  fen: string;
  color?: Color;
  lastMove?: string;
  movable?: boolean;
  onMove?: (move: string) => void;
  label?: string;
};
export function Board({
  fen,
  color = 'w',
  lastMove,
  movable = false,
  onMove,
  label = 'Chess board',
}: Props) {
  const container = useRef<HTMLDivElement>(null),
    board = useRef<Api | null>(null);
  const props = useRef({ fen, color, lastMove, movable, onMove });
  props.current = { fen, color, lastMove, movable, onMove };
  const [ready, setReady] = useState(false);
  const [promotion, setPromotion] = useState<string | null>(null);
  const promotionDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (promotion && !promotionDialog.current?.open) promotionDialog.current?.showModal();
  }, [promotion]);
  const [input, setInput] = useState(''),
    [error, setError] = useState('');
  function commit(move: string) {
    const p = props.current;
    if (!p.movable) return;
    const chess = new Chess(p.fen);
    const piece = chess.get(move.slice(0, 2) as Square);
    if (piece?.type === 'p' && ['1', '8'].includes(move[3]) && move.length === 4) {
      setPromotion(move);
      board.current?.set({ fen: p.fen, movable: { color: undefined, dests: new Map() } });
      return;
    }
    try {
      chess.move(move);
      p.onMove?.(move);
      setError('');
    } catch {
      setError('That move is not legal. Try again.');
      board.current?.set({ fen: p.fen });
    }
  }
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    let redrawFrame = 0;
    import('@lichess-org/chessground').then(({ Chessground }) => {
      if (cancelled || !container.current) return;
      board.current = Chessground(container.current, {
        fen: props.current.fen,
        orientation: color === 'w' ? 'white' : 'black',
        animation: {
          enabled: !matchMedia('(prefers-reduced-motion: reduce)').matches,
          duration: 140,
        },
        coordinates: true,
        premovable: { enabled: false },
        drawable: { enabled: false, visible: false },
        movable: { free: false, events: { after: (from, to) => commitRef.current(from + to) } },
      });
      // Route layout and font changes can settle after Chessground caches its first bounds.
      // Rebuild all piece transforms when the wrapper changes, including unmoved pieces.
      resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(redrawFrame);
        redrawFrame = requestAnimationFrame(() => board.current?.redrawAll());
      });
      resizeObserver.observe(container.current);
      setReady(true);
    });
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      cancelAnimationFrame(redrawFrame);
      board.current?.destroy();
      board.current = null;
    };
  }, []);
  useEffect(() => {
    if (!board.current) return;
    const chess = new Chess(fen),
      dests = new Map<Key, Key[]>();
    if (movable && !promotion)
      for (const move of chess.moves({ verbose: true })) {
        const entries = dests.get(move.from) || [];
        if (!entries.includes(move.to)) entries.push(move.to);
        dests.set(move.from, entries);
      }
    board.current.set({
      fen,
      orientation: color === 'w' ? 'white' : 'black',
      turnColor: chess.turn() === 'w' ? 'white' : 'black',
      check: chess.isCheck(),
      lastMove: lastMove ? [lastMove.slice(0, 2) as Key, lastMove.slice(2, 4) as Key] : [],
      movable: {
        color: movable && !promotion ? (chess.turn() === 'w' ? 'white' : 'black') : undefined,
        dests,
      },
      draggable: { enabled: movable && !promotion },
      selectable: { enabled: movable && !promotion },
    });
    board.current.redrawAll();
  }, [fen, color, lastMove, movable, ready, promotion]);
  return (
    <div className="board-shell">
      <div className="board-coordinate-frame">
        <div
          ref={container}
          className="cg-wrap board"
          role="img"
          aria-label={`${label}. ${new Chess(fen).turn() === 'w' ? 'White' : 'Black'} to move.`}
        />
      </div>
      {promotion && (
        <dialog
          ref={promotionDialog}
          className="promotion"
          aria-label="Choose promotion piece"
          onCancel={() => setPromotion(null)}
        >
          <p>Promote your pawn</p>
          {(['q', 'r', 'b', 'n'] as const).map((piece, index) => (
            <button
              autoFocus={index === 0}
              key={piece}
              onClick={() => {
                const move = promotion + piece;
                setPromotion(null);
                commitRef.current(move);
              }}
            >
              {{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[piece]}
            </button>
          ))}
          <button onClick={() => setPromotion(null)}>Cancel</button>
        </dialog>
      )}
      {onMove && (
        <form
          className="move-input"
          onSubmit={(e) => {
            e.preventDefault();
            const chess = new Chess(fen);
            try {
              const move = chess.move(input.trim());
              commitRef.current(move.from + move.to + (move.promotion || ''));
              setInput('');
              setError('');
            } catch {
              setError('Enter a legal move, such as Nf3 or e2e4.');
            }
          }}
        >
          <label htmlFor="keyboard-move">Move by keyboard</label>
          <input
            id="keyboard-move"
            placeholder="e.g. Nf3"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!movable || !!promotion}
            autoComplete="off"
          />
          <button disabled={!movable || !!promotion} type="submit">
            Move
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </div>
  );
}

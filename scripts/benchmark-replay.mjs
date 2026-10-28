import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { append, newGame, replay } from '../app/lib/game.ts';

// Generate a legal long game, avoiding repetition and resetting the fifty-move
// counter with pawn moves/captures. Fixture generation is outside the timings.
function history(length) {
  const chess = new Chess();
  const seen = new Set();
  const moves = [];
  let seed = 42;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  while (moves.length < length) {
    const urgent = Number(chess.fen().split(' ')[4]) >= 80;
    const candidates = chess
      .moves({ verbose: true })
      .map((move) => ({
        move,
        priority: Number((move.piece === 'p' || !!move.captured) !== urgent) + random(),
      }))
      .sort((a, b) => a.priority - b.priority);
    let accepted = false;
    for (const { move } of candidates) {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      const key = chess.fen().split(' ').slice(0, 4).join(' ');
      if (!seen.has(key) && !chess.isGameOver()) {
        seen.add(key);
        moves.push(move.from + move.to + (move.promotion ?? ''));
        accepted = true;
        break;
      }
      chess.undo();
    }
    assert(accepted, `Could not generate fixture after ${moves.length} plies`);
  }
  return moves;
}

function legacy(game) {
  let verified = { ...game, moves: [], result: 'active', revision: 0, resigned: false };
  for (const move of game.moves) verified = append(verified, move);
  return verified;
}

function measure(fn, game) {
  const times = [];
  for (let n = 0; n < 3; n++) {
    const start = performance.now();
    const result = fn(game);
    times.push(performance.now() - start);
    assert.equal(result.revision, game.moves.length);
    assert.deepEqual(result.moves, game.moves);
    assert.equal(result.result, 'active');
  }
  return times.sort((a, b) => a - b)[1];
}

console.log('Generating a legal 2,000-ply fixture (excluded from timings)…');
const moves = history(2000);
console.log('Local median elapsed milliseconds; these are not Cloudflare CPU measurements.');
for (const length of [12, 80, 200, 2000]) {
  const game = { ...newGame(1, 'w'), moves: moves.slice(0, length) };
  const optimized = measure(replay, game);
  // Avoid spending minutes running the quadratic baseline at the import limit.
  const baseline = length <= 200 ? measure(legacy, game) : null;
  console.log(
    JSON.stringify({
      plies: length,
      optimizedMs: +optimized.toFixed(2),
      baselineMs: baseline === null ? null : +baseline.toFixed(2),
      speedup: baseline === null ? null : +(baseline / optimized).toFixed(1),
    }),
  );
}

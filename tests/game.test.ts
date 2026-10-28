import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { append, classify, newGame, position, replay, resultFor } from '../app/lib/game';
describe('game rules and review', () => {
  it('plays and identifies a win from the human perspective', () => {
    let game = newGame(1, 'b');
    for (const move of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) game = append(game, move);
    expect(game.result).toBe('win');
    expect(game.revision).toBe(4);
    expect(() => append(game, 'a2a3')).toThrow();
    expect(replay(game).result).toBe('win');
  });
  it('rejects illegal moves and invalid settings', () => {
    expect(() => append(newGame(1, 'w'), 'e2e5')).toThrow();
    expect(() => position(['g1g3'])).toThrow();
    expect(() => position(['e2e4q'])).toThrow('Invalid move');
    expect(() => append(newGame(1, 'w'), 'e2e4n')).toThrow('Invalid move');
    expect(() => newGame(7, 'w')).toThrow();
  });
  it('supports castling and en passant', () => {
    expect(position(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1e2', 'g8f6', 'e1g1']).get('f1')?.type).toBe(
      'r',
    );
    const chess = position(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6']);
    expect(chess.get('d5')).toBeUndefined();
    expect(chess.get('d6')?.type).toBe('p');
  });
  it('supports underpromotion and draw detection', () => {
    const chess = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
    chess.move('a7a8n');
    expect(chess.get('a8')?.type).toBe('n');
    expect(resultFor(chess, 'w')).toBe('draw');
    expect(resultFor(new Chess('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1'), 'w')).toBe('draw');
  });
  it('detects repetition', () => {
    const chess = position(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
    expect(chess.isThreefoldRepetition()).toBe(true);
    expect(resultFor(chess, 'w')).toBe('draw');
  });
  it('replays a history once while preserving its result and revision', () => {
    const moves = [
      'e2e4',
      'a7a6',
      'e4e5',
      'd7d5',
      'e5d6',
      'e7d6',
      'g1f3',
      'b8c6',
      'f1e2',
      'g8f6',
      'e1g1',
    ];
    let expected = newGame(2, 'w');
    for (const move of moves) expected = append(expected, move);
    const actual = replay({ ...expected, result: 'win', revision: 999, eligible: false });
    expect(actual).toMatchObject({
      moves,
      revision: moves.length,
      result: 'active',
      resigned: false,
    });
    expect(position(actual.moves).fen()).toBe(position(expected.moves).fen());
    expect(actual.moves).not.toBe(expected.moves);
  });
  it('preserves repetition and resignation semantics during replay', () => {
    const base = newGame(1, 'w');
    expect(replay({ ...base, resigned: true })).toMatchObject({
      revision: 1,
      result: 'loss',
      resigned: true,
    });
    const moves = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
    expect(replay({ ...base, moves, resigned: true })).toMatchObject({
      revision: 8,
      result: 'draw',
      resigned: false,
    });
    expect(() => replay({ ...base, moves: [...moves, 'e2e4'] })).toThrow('Moves after game over');
  });
  it('rejects malformed and illegal histories and moves after checkmate', () => {
    const base = newGame(1, 'w');
    for (const moves of [['invalid'], ['e2e5'], ['f2f3', 'e7e5', 'g2g4', 'd8h4', 'a2a3']])
      expect(() => replay({ ...base, moves })).toThrow();
  });
  it('replays promotion from the initial position', () => {
    const moves = ['h2h4', 'a7a5', 'h4h5', 'a5a4', 'h5h6', 'a4a3', 'h6g7', 'a3b2', 'g7h8n'];
    const game = replay({ ...newGame(1, 'w'), moves });
    expect(position(game.moves).get('h8')?.type).toBe('n');
    expect(game.revision).toBe(moves.length);
  });
  it('classifies both colours and mate transitions', () => {
    const evaluation = (cp: number, mate?: number) => ({ cp, mate, pv: [], depth: 14 });
    expect(classify(evaluation(100), evaluation(-100), 'w')).toBe('Blunder');
    expect(classify(evaluation(0), evaluation(100), 'b')).toBe('Mistake');
    expect(classify(evaluation(100), evaluation(50), 'w')).toBe('Inaccuracy');
    expect(classify(evaluation(100000, 3), evaluation(500), 'w')).toBe('Blunder');
    expect(classify(evaluation(0), evaluation(-100000, -2), 'w')).toBe('Blunder');
  });
});

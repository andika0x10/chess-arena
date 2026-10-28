import { Chess } from 'chess.js';
export const BOT_VERSION = 'sf19-lite-v1';
export const ANALYSIS_VERSION = 'sf19-lite-d14-n100k-v1';
export const SKILLS = [0, 4, 8, 12, 16, 20] as const;
export type Color = 'w' | 'b';
export type Game = {
  id: string;
  level: number;
  color: Color;
  moves: string[];
  revision: number;
  result: 'active' | 'win' | 'loss' | 'draw';
  resigned: boolean;
  eligible: boolean;
  botVersion: string;
  createdAt: number;
  updatedAt: number;
};
export type Evaluation = { cp: number; mate?: number; pv: string[]; depth: number };
export type Review = { version: string; positions: Evaluation[] };
function applyMove(chess: Chess, move: string) {
  if (typeof move !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
    throw new Error('Invalid move');
  // UCI moves already identify the squares. Avoid chess.js's permissive SAN
  // parser and its candidate-notation generation for every historical move.
  const played = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
  // chess.js ignores an extraneous promotion field on ordinary object moves.
  if (played.lan !== move) throw new Error('Invalid move');
}
export function position(moves: string[]) {
  const chess = new Chess();
  for (const move of moves) {
    if (chess.isGameOver()) throw new Error('Moves after game over');
    applyMove(chess, move);
  }
  return chess;
}
export function resultFor(chess: Chess, color: Color): Game['result'] {
  if (chess.isCheckmate()) return chess.turn() === color ? 'loss' : 'win';
  return chess.isGameOver() ? 'draw' : 'active';
}
export function newGame(level: number, color: Color, eligible = false): Game {
  if (!Number.isInteger(level) || level < 1 || level > 6 || !['w', 'b'].includes(color))
    throw new Error('Invalid game settings');
  return {
    id: (eligible ? '' : 'local_') + crypto.randomUUID(),
    level,
    color,
    moves: [],
    revision: 0,
    result: 'active',
    resigned: false,
    eligible,
    botVersion: BOT_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
export function append(game: Game, move: string): Game {
  if (game.result !== 'active') throw new Error('This game has finished');
  const chess = position(game.moves);
  if (chess.isGameOver()) throw new Error('This game has finished');
  applyMove(chess, move);
  return {
    ...game,
    moves: [...game.moves, move],
    revision: game.revision + 1,
    result: resultFor(chess, game.color),
    updatedAt: Date.now(),
  };
}
export function replay(game: Game) {
  const chess = position(game.moves);
  const now = Date.now();
  let verified: Game = {
    ...game,
    moves: [...game.moves],
    result: resultFor(chess, game.color),
    revision: game.moves.length,
    resigned: false,
    updatedAt: game.moves.length ? now : game.updatedAt,
  };
  if (game.resigned && verified.result === 'active')
    verified = { ...verified, result: 'loss', resigned: true, revision: verified.revision + 1 };
  return verified;
}
export function classify(before: Evaluation, after: Evaluation, color: Color) {
  const sign = color === 'w' ? 1 : -1;
  if (before.mate !== undefined || after.mate !== undefined) {
    if ((before.mate ?? 0) * sign > 0 && !((after.mate ?? 0) * sign > 0)) return 'Blunder';
    if ((after.mate ?? 0) * sign < 0 && !((before.mate ?? 0) * sign < 0)) return 'Blunder';
    return '';
  }
  const loss = (before.cp - after.cp) * sign;
  return loss >= 200 ? 'Blunder' : loss >= 100 ? 'Mistake' : loss >= 50 ? 'Inaccuracy' : '';
}
export function notation(moves: string[]) {
  return position(moves).history();
}

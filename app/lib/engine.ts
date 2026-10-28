import { position, SKILLS, type Evaluation } from './game';

export class Engine {
  private worker?: Worker;
  private receive?: (line: string) => void;
  private fail?: (error: Error) => void;
  private ready?: Promise<void>;
  private busy = false;
  private disposed = false;
  start() {
    if (this.disposed) return Promise.reject(new Error('Engine stopped'));
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.worker?.terminate();
        reject(new Error('Engine download timed out. Retry to load it again.'));
      }, 30000);
      this.fail = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      this.worker = new Worker('/engine/19.0.1/stockfish-19-lite-single.js');
      this.worker.onerror = () =>
        this.fail?.(new Error('Engine could not load. Check your connection and retry.'));
      this.worker.onmessage = (event) => {
        for (const line of String(event.data).split('\n')) this.receive?.(line);
      };
      this.receive = (line) => {
        if (line === 'uciok') this.worker?.postMessage('isready');
        if (line === 'readyok') {
          clearTimeout(timer);
          this.receive = undefined;
          this.fail = undefined;
          resolve();
        }
      };
      this.worker.postMessage('uci');
    });
    return this.ready;
  }
  async search(moves: string[], level?: number): Promise<{ move: string; evaluation: Evaluation }> {
    await this.start();
    if (this.disposed) throw new Error('Engine stopped');
    if (this.busy) throw new Error('Engine is already thinking');
    const chess = position(moves);
    const sign = chess.turn() === 'w' ? 1 : -1;
    if (chess.isGameOver())
      return {
        move: '',
        evaluation: {
          cp: chess.isCheckmate() ? -sign * 100000 : 0,
          ...(chess.isCheckmate() ? { mate: -sign } : {}),
          pv: [],
          depth: 0,
        },
      };
    this.busy = true;
    const run = () =>
      new Promise<{ move: string; evaluation: Evaluation }>((resolve, reject) => {
        let evaluation: Evaluation = { cp: 0, pv: [], depth: 0 };
        const timer = setTimeout(() => {
          this.worker?.terminate();
          this.disposed = true;
          finish(new Error('Engine took too long. Retry to continue.'));
        }, 60000);
        const finish = (error?: Error, move?: string) => {
          clearTimeout(timer);
          this.receive = undefined;
          this.fail = undefined;
          if (error) reject(error);
          else resolve({ move: move!, evaluation });
        };
        this.fail = (error) => finish(error);
        this.receive = (line) => {
          if (line.startsWith('info ') && line.includes(' score ')) {
            const score = line.match(/\bscore (cp|mate) (-?\d+)/);
            const pv = line.match(/\bpv (.+)/);
            if (score && pv && !/\b(upperbound|lowerbound)\b/.test(line)) {
              const value = Number(score[2]) * sign;
              evaluation = {
                cp: score[1] === 'cp' ? value : value > 0 ? 100000 : -100000,
                ...(score[1] === 'mate' ? { mate: value } : {}),
                pv: pv[1].trim().split(/\s+/),
                depth: Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0),
              };
            }
          }
          if (line.startsWith('bestmove ')) finish(undefined, line.split(' ')[1]);
        };
        this.worker!.postMessage(
          `setoption name Skill Level value ${level ? SKILLS[level - 1] : 20}`,
        );
        this.worker!.postMessage('setoption name Hash value 16');
        this.worker!.postMessage(
          'position startpos' + (moves.length ? ' moves ' + moves.join(' ') : ''),
        );
        this.worker!.postMessage(level ? 'go nodes 50000' : 'go depth 14 nodes 100000');
      });
    try {
      if (navigator.locks)
        return await navigator.locks.request(
          'chess-arena-engine',
          { ifAvailable: true },
          (lock) => {
            if (!lock) throw new Error('Another tab is using the engine. Pause it and retry here.');
            return run();
          },
        );
      return await run();
    } finally {
      this.busy = false;
    }
  }
  dispose() {
    this.disposed = true;
    this.fail?.(new Error('Engine stopped'));
    this.worker?.terminate();
    this.receive = undefined;
  }
}

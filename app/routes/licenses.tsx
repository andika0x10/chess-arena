export default function Licenses() {
  return (
    <section className="page narrow">
      <h1>Built in the open.</h1>
      <p>
        Chess Arena is free software under the GNU General Public License, version 3 or later. You
        may study, share, and modify it under those terms.
      </p>
      <p>
        <a className="text-link" href="/source/chess-arena-source.tar.gz">
          Download application source and dependency notices
        </a>
      </p>
      <h2>Board and pieces</h2>
      <p>
        <a className="text-link" href="https://github.com/lichess-org/chessground/tree/v10.5.0">
          Chessground 10.5.0
        </a>{' '}
        by the Lichess team, GPL-3.0-or-later. The included Cburnett pieces are distributed with
        Chessground; original artwork by Colin M. L. Burnett.
      </p>
      <h2>Chess engine</h2>
      <p>
        <a className="text-link" href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">
          Stockfish.js 19.0.1
        </a>
        , based on Stockfish by the Stockfish developers, distributed under GPL v3. The engine runs
        unmodified in your browser using the lite single-threaded build.
      </p>
      <p>
        <a className="text-link" href="/engine/19.0.1/COPYING.txt">
          Engine license
        </a>{' '}
        ·{' '}
        <a className="text-link" href="/engine/19.0.1/source.tar.gz">
          Matching engine source and build scripts
        </a>
      </p>
      <h2>Other software</h2>
      <p>
        chess.js (BSD-2-Clause), React and React Router (MIT), idb (ISC), openid-client (MIT), and
        Public Sans (SIL Open Font License 1.1).
      </p>
    </section>
  );
}

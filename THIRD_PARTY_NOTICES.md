# Third-party software

Chess Arena is distributed under GPL-3.0-or-later. See LICENSE.

| Component | License | Source |
| --- | --- | --- |
| Chessground 10.5.0 and bundled Cburnett piece CSS | GPL-3.0-or-later | https://github.com/lichess-org/chessground/tree/v10.5.0 |
| Stockfish.js 19.0.1 / Stockfish 19 | GPL-3.0 | https://github.com/nmrugg/stockfish.js/tree/v19.0.1 |
| chess.js 1.4.0 | BSD-2-Clause | https://github.com/jhlywa/chess.js |
| Public Sans | SIL OFL-1.1 | https://github.com/uswds/public-sans |
| React | MIT | https://github.com/facebook/react |
| React Router | MIT | https://github.com/remix-run/react-router |
| idb | ISC | https://github.com/jakearchibald/idb |
| openid-client | MIT | https://github.com/panva/openid-client |

The original Cburnett artwork is by Colin M. L. Burnett. The board CSS is distributed as part of Chessground. Dependency license texts are collected in the source distribution's vendor/licenses directory by `npm run prepare:assets`.

## Engine distribution

The browser receives the unmodified `stockfish-19-lite-single.js` and matching `.wasm` files from the pinned npm package `stockfish@19.0.1`. Its GPL license and the matching upstream v19.0.1 source archive (including build scripts) are served alongside the engine under `/engine/19.0.1/`. The source archive is committed in `vendor/` so source distribution does not depend on an upstream URL remaining available.

Upstream source archive URL: https://codeload.github.com/nmrugg/stockfish.js/tar.gz/refs/tags/v19.0.1

Rebuild instructions are in that archive's README and build.js. Use Emscripten 6.0.9 and `npm run build-single-lite`. The build script downloads the required neural-network files as described by upstream. No modifications to the engine were made for Chess Arena.

Every build also produces `/source/chess-arena-source.tar.gz`, containing the application, tests, dependency lockfile, migrations, configuration templates, notices, and engine source archive. Secrets and local databases are excluded. Hosting credentials and local development state are not part of the corresponding source.

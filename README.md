# Chess Arena

A quiet, monochrome chess app for learning through human-vs-computer games. React Router v8 Framework Mode + React 19, SSR on Cloudflare Workers, D1 persistence, chess.js, Chessground, and Stockfish WASM.

## Run locally

Use Node 24 or later.

```sh
npm ci
npm run db:migrate
npm run dev
```

Open http://localhost:5173. Guest play, six bot levels, local history and post-game analysis work without Google credentials. Guest data stays in IndexedDB on that browser; clearing browser storage removes it.

`predev` and `prebuild` copy the pinned lite single-threaded engine and license/source assets. The engine loads only on playing or analysing, not on the home page. No COOP/COEP headers or external engine service are required.

## Google sign-in

1. Create a Google Cloud OAuth client with application type **Web application** and configure the consent screen. Add test users while the consent screen is in testing mode.
2. Register the exact redirect URI `http://localhost:5173/auth/google/callback` and the production equivalent `https://YOUR-DOMAIN/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID` in `wrangler.jsonc`. Keep `APP_ORIGIN` equal to the actual origin, without a trailing slash. A different local port also requires a matching origin and redirect registration.
4. Copy `.dev.vars.example` to `.dev.vars`. Set `GOOGLE_CLIENT_SECRET` and a cryptographically random `SESSION_SECRET` of at least 32 characters. Never commit this file.
5. Restart the dev server.

Google login uses OIDC authorization code flow with PKCE, state and nonce. `openid-client` verifies ID tokens. Only the `openid` scope is requested. Users are keyed by Google `sub`, not email. The initial public name is a random Player alias, editable on Account. Google names/emails are not published.

Sessions last 30 days and store only SHA-256 hashes of random bearer tokens in D1. Logout revokes the current session. Cookies are HttpOnly, SameSite=Lax and Secure over HTTPS. Mutation requests require the app's origin.

## Deploy to Cloudflare Workers

The all-zero D1 ID is a local-development placeholder. Deployment preflight rejects that ID and a non-HTTPS production origin.

```sh
npx wrangler login
npx wrangler d1 create chess-arena
```

Update `wrangler.jsonc` with the returned D1 `database_id`, your final HTTPS `APP_ORIGIN`, and production Google client ID. Configure Google redirect URIs before enabling login. Then:

```sh
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler d1 migrations apply chess-arena --remote
npm run deploy
```

For a first deployment before a custom domain is attached, set `APP_ORIGIN` to your expected `https://chess-arena.YOUR-SUBDOMAIN.workers.dev` address and register its callback URI. Never deploy with the localhost origin.

Workers Static Assets serves fonts, pieces and engine files on the same origin. D1 holds users, sessions, private games, versioned reviews and level achievements. KV, R2 and Durable Objects are not required. Cloudflare usage limits and billing still apply.

Use a separate D1 database and separate OAuth client/redirect URI for staging. Do not point development at production. Apply additive migrations before deploying code that needs them. For rollback, deploy the preceding Worker version and leave additive schema changes in place.

## Data and game contracts

- `POST /api/games`: `{ intent: "create", level: 1..6, color: "w" | "b" }`; `{ intent: "import", game }`; or `{ intent: "name", name }`.
- `POST /api/games/:gameId`: `{ intent: "move", revision, move }` using UCI notation; `{ intent: "resign", revision }`; or `{ intent: "review", review }`.
- Moves and resignation return `{ game }`; other operations return `{ ok: true }`. Invalid input returns 400, unauthenticated requests 401, ownership failures 404, and revision conflicts 409. All writes require same-origin requests.
- Server-side chess.js replays moves; the client cannot supply authoritative FEN, results or leaderboard achievements. Game updates use compare-and-swap revisions and atomic D1 batches. Retrying an accepted move or resignation does not duplicate it.
- Logged-in moves are first written to IndexedDB, then uploaded sequentially. Unsynced moves survive refresh. Reconnection retries automatically; Retry sync is also available. A conflicting tab is stopped and must reload the latest version.
- Guest games can be imported from My games after login. Imports never count toward achievements, even if the guest payload claims eligibility. Importing the same game again is idempotent.
- My games shows the 100 most recently updated account games plus locally stored guest games. Game URLs and reviews enforce ownership; they are not public sharing links.
- The leaderboard shows the top 100 players, ordered by highest level beaten and then number of distinct levels beaten. Identical achievements share a dense rank. It is explicitly casual: browser engine difficulty and outside assistance cannot be independently verified.

The bot configuration is `sf19-lite-v1`: skill levels 0/4/8/12/16/20 and 50,000 nodes per move. Review configuration is `sf19-lite-d14-n100k-v1`: maximum strength, stopping at depth 14 or 100,000 nodes. Strength names are levels, not Elo ratings. Version changes require updating cache keys and the configuration version.

Analysis is sequential, cancellable and saved after each position. Resuming reuses cached evaluations; account review checkpoints also save to D1 every eight positions and on pause/completion. The graph uses White's perspective. Mistake labels are approximate centipawn-loss thresholds of 50/100/200; forced mate is handled separately. Analysis variations never mutate recorded games. Web Locks prevent simultaneous engine searches across tabs on supported browsers.

## Verify

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npx wrangler deploy --dry-run
```

Unit/integration tests run against a real local D1 implementation in Miniflare. Auth tests stub the external OIDC exchange to verify application flow and account/session handling; a real Google login needs configured credentials and must also be smoke-tested on the deployed origin.

Browser tests use the real WASM engine and a separate dev port (5180). They cover guest play, Black, refresh, resignation, full review, cached analysis, engine retry, cross-tab conflicts and mobile layout. Screenshots are saved under ignored `artifacts/`, and failure traces under ignored `test-results/`.

## Operations and recovery

Workers observability is enabled. Inspect request errors in the Cloudflare dashboard or `npx wrangler tail`; check D1 storage/query usage there as traffic grows. Never log cookies, tokens, authorization codes or secrets. Expired sessions can be removed with `DELETE FROM sessions WHERE expires_at < <current Unix time in milliseconds>`.

Before remote schema changes, export D1 with `npx wrangler d1 export chess-arena --remote --output=backup.sql` to a secure location outside the public source distribution. Use D1 Time Travel for production recovery according to your account's retention window. Guest browser data has no server backup.

## License and corresponding source

GPL-3.0-or-later. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.

Every production build creates `/source/chess-arena-source.tar.gz` containing the application, tests, lockfile, configuration templates, migrations, notices and engine source. It explicitly excludes credentials, local databases and build output. `/licenses` links to this source and the pinned Stockfish source/engine license.

The verified upstream engine archive and lite NNUE network are committed in `vendor/`. Upstream Emscripten/build instructions are in the source archive. To reproduce this deployment, install the locked dependencies and run the build commands above. The generated `vendor/chessground/` directory includes the exact Chessground TypeScript source and board/piece assets used by the build.

The `undici` override updates a vulnerable development-tool transitive dependency without downgrading the Cloudflare toolchain. Revisit the override when upstream resolves its dependency pin.

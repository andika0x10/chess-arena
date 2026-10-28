# Chess Arena

A monochrome chess app for playing the computer and reviewing your games. Six bot levels, guest play, Google sign-in, private history, and a casual progress leaderboard.

Built with React Router v8, React 19, Cloudflare Workers + D1, chess.js, Chessground, and Stockfish WASM.

Production serves a public static shell and fetches session/route data from the Worker.
JavaScript is required for the interface. Personalized data and mutation responses are
`private, no-store`; hashed assets and the versioned engine are cached independently.
React Router is pinned because its API-only rendering mode is experimental.

The build uses a separate, local prerender Worker to generate the shell. Its Node
compatibility and build-request flag are limited to `build/prerender`; deploy the
runtime at `build/server` using the normal deploy command. The prerender Worker is
excluded from deployment.

## Development

Requires Node.js 24+.

```sh
npm ci
npm run db:migrate
npm run dev
```

Open [localhost:5173](http://localhost:5173). Guest games and reviews work without Google credentials and are saved in this browser.

## Google sign-in

- Create a Google OAuth web client with callback `http://localhost:5173/auth/google/callback` (and your production equivalent).
- Set `GOOGLE_CLIENT_ID` and `APP_ORIGIN` in `wrangler.jsonc`.
- Copy `.dev.vars.example` to `.dev.vars`, fill in `GOOGLE_CLIENT_SECRET` and a random `SESSION_SECRET` of at least 32 characters, then restart the server.

## Deployment

```sh
npx wrangler login
npx wrangler d1 create chess-arena
```

Set the returned D1 `database_id`, production HTTPS `APP_ORIGIN`, and Google client ID in `wrangler.jsonc`. Register the production OAuth callback, then:

```sh
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler d1 migrations apply chess-arena --remote
npm run deploy
```

## Checks

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Test production asset/API routing after building (PowerShell):

```powershell
$env:E2E_PREVIEW = '1'
npm run test:e2e
Remove-Item Env:E2E_PREVIEW
npm run benchmark:replay
```

The replay benchmark generates legal histories through the 2,000-ply import limit
and compares single-pass replay with repeated-prefix replay for shorter games.
Its local elapsed timings do not establish compliance with hosted Worker CPU limits.
Long histories can still exceed a small CPU budget.

After a production rollout, use Worker observability to compare CPU percentiles
and `exceededCpu`/memory outcomes for data loads, moves, imports, and reviews.
Correlate recurring 1102 reports with their request path and timestamp; do not log
session cookies, OAuth tokens, or private game payloads. Local success alone does
not prove a production resource-limit error is resolved.

## License

[GPL-3.0-or-later](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md). Production builds include downloadable application and engine source, linked from `/licenses`.

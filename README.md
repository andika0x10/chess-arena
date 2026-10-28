# Chess Arena

A monochrome chess app for playing the computer and reviewing your games. Six bot levels, guest play, Google sign-in, private history, and a casual progress leaderboard.

Built with React Router v8, React 19, Cloudflare Workers + D1, chess.js, Chessground, and Stockfish WASM.

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

## License

[GPL-3.0-or-later](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md). Production builds include downloadable application and engine source, linked from `/licenses`.

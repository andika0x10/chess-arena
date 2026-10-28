import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('play/:gameId', 'routes/play.tsx'),
  route('games', 'routes/games.tsx'),
  route('games/:gameId/review', 'routes/review.tsx'),
  route('leaderboard', 'routes/leaderboard.tsx'),
  route('account', 'routes/account.tsx'),
  route('licenses', 'routes/licenses.tsx'),
  route('auth/google/:callback?', 'routes/auth.tsx'),
  route('logout', 'routes/logout.tsx'),
  route('api/games/:gameId?', 'routes/api.tsx'),
] satisfies RouteConfig;

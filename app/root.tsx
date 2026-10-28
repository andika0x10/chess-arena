import {
  Form,
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
} from 'react-router';
import type { Route } from './+types/root';
import { userFor } from './lib/db.server';
import { authEnabled } from './lib/auth.server';
import '@fontsource-variable/public-sans';
import '@lichess-org/chessground/assets/chessground.base.css';
import '@lichess-org/chessground/assets/chessground.cburnett.css';
import './app.css';
export async function loader({ request }: Route.LoaderArgs) {
  return { user: await userFor(request), authEnabled: authEnabled() };
}
export const meta: Route.MetaFunction = () => [
  { title: 'Chess Arena — A little better, every game.' },
  {
    name: 'description',
    content: 'Play the computer at your own pace. Revisit every move. Find your next good idea.',
  },
];
export const links: Route.LinksFunction = () => [
  { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
];
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
export default function App() {
  const { user } = useLoaderData<typeof loader>();
  const location = useLocation();
  return (
    <>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="Chess Arena home">
          <span className="brand-mark" aria-hidden="true">
            ♜
          </span>
          Chess Arena<span className="brand-period">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <NavLink end to="/">
            Play
          </NavLink>
          <NavLink to="/leaderboard">Leaderboard</NavLink>
          <NavLink to="/games">My games</NavLink>
        </nav>
        <Link className="account-link" to="/account">
          {user ? user.name : 'Sign in'}
          <span aria-hidden="true" className="account-dot" />
        </Link>
      </header>
      <main id="main">
        <Outlet key={location.pathname} />
      </main>
      <footer className="site-footer">
        <span>Take your time. Make your move.</span>
        <span>
          Human vs computer <span aria-hidden="true"> / </span> <a href="/licenses">Open source</a>
        </span>
      </footer>
    </>
  );
}
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error)
    ? error.status === 404
      ? 'This game could not be found.'
      : String(error.data || error.statusText)
    : 'Something interrupted this page. Reload to try again.';
  return (
    <main id="main" className="page narrow">
      <Link className="brand" to="/">
        Chess Arena.
      </Link>
      <h1>Let’s try that again.</h1>
      <p>{message}</p>
      <Link className="button" to="/">
        Back to play
      </Link>
    </main>
  );
}

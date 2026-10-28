import type { Route } from './+types/auth';
export async function loader({ request }: Route.LoaderArgs) {
  const { beginAuth, finishAuth } = await import('../lib/auth.server');
  return new URL(request.url).pathname.endsWith('/callback') ? finishAuth(request) : beginAuth();
}

import type { Route } from './+types/auth';
import { beginAuth, finishAuth } from '../lib/auth.server';
export async function loader({ request }: Route.LoaderArgs) {
  return new URL(request.url).pathname.endsWith('/callback') ? finishAuth(request) : beginAuth();
}

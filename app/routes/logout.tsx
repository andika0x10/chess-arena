import { redirect } from 'react-router';
import type { Route } from './+types/logout';
import { deleteSession, sameOrigin, sessionCookie } from '../lib/db.server';
export async function action({ request }: Route.ActionArgs) {
  sameOrigin(request);
  await deleteSession(request);
  return redirect('/', { headers: { 'Set-Cookie': sessionCookie(request, '', 0) } });
}

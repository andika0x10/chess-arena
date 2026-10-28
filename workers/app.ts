import { createRequestHandler, redirect } from 'react-router';

const developmentHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

// Passing a build callback makes React Router derive the route graph every time.
// Production builds are immutable; derive the handler only once per isolate.
let productionHandler: Promise<ReturnType<typeof createRequestHandler>> | undefined;
function handler() {
  if (import.meta.env.DEV) return Promise.resolve(developmentHandler);
  return (productionHandler ??= import('virtual:react-router/server-build').then((build) =>
    createRequestHandler(build, import.meta.env.MODE),
  ));
}

async function respond(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  // React Router authenticates this build-only header using its build context.
  // Let the framework render the shell while generating index.html.
  if (request.headers.get('X-React-Router-SPA-Mode') === 'yes') return (await handler())(request);
  if (path === '/auth/google' || path === '/auth/google/callback') {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    const { beginAuth, finishAuth } = await import('../app/lib/auth.server');
    return path.endsWith('/callback') ? finishAuth(request) : beginAuth();
  }
  const gameApi = path.match(/^\/api\/games(?:\/([^/]+))?\/?$/);
  if (gameApi) {
    if (request.method !== 'POST')
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    const { gameAction } = await import('../app/lib/game-action.server');
    let gameId: string | undefined;
    try {
      gameId = gameApi[1] ? decodeURIComponent(gameApi[1]) : undefined;
    } catch {
      return new Response('Invalid game ID', { status: 400 });
    }
    return gameAction(request, gameId);
  }
  if (path === '/logout' && request.method === 'POST') {
    const { deleteSession, sameOrigin, sessionCookie } = await import('../app/lib/db.server');
    sameOrigin(request);
    await deleteSession(request);
    return redirect('/', { status: 303, headers: { 'Set-Cookie': sessionCookie(request, '', 0) } });
  }
  if (path === '/account' && request.method === 'POST') {
    const { accountAction } = await import('../app/lib/account-action.server');
    const result = await accountAction(request);
    if ('init' in result) return Response.json(result.data, result.init ?? undefined);
    return redirect('/account', 303);
  }
  if (path.endsWith('.data') || path === '/__manifest') return (await handler())(request);
  if (path.startsWith('/api/') || path.startsWith('/auth/'))
    return new Response('Not found', { status: 404 });
  if (path === '/logout')
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (import.meta.env.DEV) return (await handler())(request);
  if (request.method === 'GET' || request.method === 'HEAD') return env.ASSETS.fetch(request);
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
}

export default {
  async fetch(request, env) {
    let response: Response;
    try {
      response = await respond(request, env);
    } catch (error) {
      if (!(error instanceof Response)) throw error;
      response = error;
    }
    const path = new URL(request.url).pathname;
    // Assets, including the public shell, keep their independent cache policy.
    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      !path.endsWith('.data') &&
      path !== '/__manifest' &&
      !path.startsWith('/auth/') &&
      !path.startsWith('/api/')
    )
      return response;
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;

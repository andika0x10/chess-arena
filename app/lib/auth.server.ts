import { env } from 'cloudflare:workers';
import { createCookie, redirect } from 'react-router';
import * as oidc from 'openid-client';
import { createSession, db, sessionCookie } from './db.server';
export function authEnabled() {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);
}
function transactionCookie() {
  if (!authEnabled())
    throw new Response('Google sign-in has not been configured. You can still play as a guest.', {
      status: 503,
    });
  return createCookie('arena_oauth', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_ORIGIN.startsWith('https:'),
    path: '/auth/google',
    maxAge: 600,
    secrets: [env.SESSION_SECRET],
  });
}
async function configuration() {
  return oidc.discovery(
    new URL('https://accounts.google.com'),
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
  );
}
export async function beginAuth() {
  const c = transactionCookie();
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState(),
    nonce = oidc.randomNonce();
  const url = oidc.buildAuthorizationUrl(await configuration(), {
    scope: 'openid',
    redirect_uri: new URL('/auth/google/callback', env.APP_ORIGIN).href,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });
  return redirect(url.href, {
    headers: { 'Set-Cookie': await c.serialize({ verifier, state, nonce, createdAt: Date.now() }) },
  });
}
export async function finishAuth(request: Request) {
  const c = transactionCookie();
  const headers = new Headers({ 'Set-Cookie': await c.serialize('', { maxAge: 0 }) });
  try {
    const flow = await c.parse(request.headers.get('Cookie'));
    if (
      !flow ||
      Date.now() - flow.createdAt > 600000 ||
      typeof flow.verifier !== 'string' ||
      typeof flow.state !== 'string' ||
      typeof flow.nonce !== 'string'
    )
      throw new Error('Expired sign-in');
    const callback = new URL('/auth/google/callback', env.APP_ORIGIN);
    callback.search = new URL(request.url).search;
    const tokens = await oidc.authorizationCodeGrant(await configuration(), callback, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
    const sub = tokens.claims()?.sub;
    if (!sub) throw new Error('Missing identity');
    const id = crypto.randomUUID();
    await db()
      .prepare(
        'INSERT INTO users(id,google_sub,name,created_at) VALUES(?,?,?,?) ON CONFLICT(google_sub) DO NOTHING',
      )
      .bind(id, sub, `Player ${id.slice(0, 6)}`, Date.now())
      .run();
    const user = await db()
      .prepare('SELECT id FROM users WHERE google_sub=?')
      .bind(sub)
      .first<{ id: string }>();
    headers.append('Set-Cookie', sessionCookie(request, await createSession(user!.id)));
    return redirect('/account', { headers });
  } catch {
    return redirect('/account?error=signin', { headers });
  }
}

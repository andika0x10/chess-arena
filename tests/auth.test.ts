import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createCookie } from 'react-router';
import { readFile } from 'node:fs/promises';
import { env } from './env';
const { grant } = vi.hoisted(() => ({ grant: vi.fn() }));
vi.mock('openid-client', () => ({
  discovery: vi.fn(async () => ({})),
  randomPKCECodeVerifier: () => 'test-verifier',
  randomState: () => 'test-state',
  randomNonce: () => 'test-nonce',
  calculatePKCECodeChallenge: async () => 'test-challenge',
  buildAuthorizationUrl: (_: unknown, parameters: Record<string, string>) =>
    new URL('https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams(parameters)),
  authorizationCodeGrant: grant,
}));
import { beginAuth, finishAuth } from '../app/lib/auth.server';
let mf: Miniflare;
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: '2026-10-23',
      d1Databases: ['DB'],
    }),
  );
  env.DB = await mf.getD1Database('DB');
  const sql = await readFile('migrations/0001_initial.sql', 'utf8');
  await env.DB.batch(
    sql
      .split(';')
      .filter((s) => s.trim())
      .map((s) => env.DB.prepare(s)),
  );
});
afterAll(async () => {
  await mf.dispose();
});
beforeEach(() => {
  Object.assign(env, {
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 'a-long-test-secret-with-thirty-two-characters',
  });
  grant.mockReset();
});
async function transaction() {
  const response = await beginAuth();
  return response.headers.get('Set-Cookie')!.split(';')[0];
}
it('starts Google login with state, nonce, PKCE and only identity scope', async () => {
  const response = await beginAuth();
  const url = new URL(response.headers.get('Location')!);
  expect(url.searchParams.get('state')).toBe('test-state');
  expect(url.searchParams.get('nonce')).toBe('test-nonce');
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('scope')).toBe('openid');
  expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
});
it('creates an account once per Google sub and passes verification checks to the OIDC library', async () => {
  grant.mockResolvedValue({ claims: () => ({ sub: 'google-sub-123' }) });
  for (let n = 0; n < 2; n++) {
    const cookie = await transaction();
    const response = await finishAuth(
      new Request(
        'http://localhost:5173/auth/google/callback?code=one-time-code&state=test-state',
        { headers: { Cookie: cookie } },
      ),
    );
    expect(response.headers.get('Location')).toBe('/account');
    expect(response.headers.get('Set-Cookie')).toContain('arena_session=');
  }
  expect((await env.DB.prepare('SELECT * FROM users').all()).results).toHaveLength(1);
  expect(grant).toHaveBeenCalledWith(expect.anything(), expect.any(URL), {
    pkceCodeVerifier: 'test-verifier',
    expectedState: 'test-state',
    expectedNonce: 'test-nonce',
    idTokenExpected: true,
  });
});
it('rejects missing, tampered and expired OAuth transaction cookies before exchange', async () => {
  const c = createCookie('arena_oauth', { secrets: [env.SESSION_SECRET] });
  const expired = await c.serialize({
    verifier: 'v',
    state: 's',
    nonce: 'n',
    createdAt: Date.now() - 700000,
  });
  for (const cookie of ['', 'arena_oauth=tampered', expired]) {
    const response = await finishAuth(
      new Request('http://localhost:5173/auth/google/callback?code=x', {
        headers: { Cookie: cookie },
      }),
    );
    expect(response.headers.get('Location')).toBe('/account?error=signin');
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
  }
  expect(grant).not.toHaveBeenCalled();
});
it('returns a recoverable sign-in failure when OIDC verification fails', async () => {
  grant.mockRejectedValue(new Error('Invalid issuer, nonce, signature or state'));
  const cookie = await transaction();
  const response = await finishAuth(
    new Request('http://localhost:5173/auth/google/callback?code=x', {
      headers: { Cookie: cookie },
    }),
  );
  expect(response.headers.get('Location')).toBe('/account?error=signin');
});

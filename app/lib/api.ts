export async function api(body: unknown, id?: string) {
  const response = await fetch('/api/games' + (id ? '/' + id : ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response
    .json()
    .catch(() => ({ error: 'Could not connect. Retry when you are online.' }))) as {
    error?: string;
    game?: import('./game').Game;
  };
  if (!response.ok) {
    const error = new Error(result.error || 'Sign in again to save this game.') as Error & {
      status: number;
    };
    error.status = response.status;
    throw error;
  }
  return result;
}

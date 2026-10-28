import { openDB } from 'idb';
import type { Game, Review } from './game';
export type LocalRecord = {
  game: Game;
  syncedRevision: number;
  owner: string | null;
  conflict?: boolean;
  review?: Review;
};
let connection: ReturnType<typeof openDB> | undefined;
const database = () =>
  (connection ??= openDB('chess-arena', 1, {
    upgrade(db) {
      db.createObjectStore('games', { keyPath: 'game.id' });
    },
  }));
export async function localGet(id: string): Promise<LocalRecord | undefined> {
  return (await database()).get('games', id);
}
export async function localPut(record: LocalRecord) {
  await (await database()).put('games', record);
}
export async function localCommit(record: LocalRecord, expected: number) {
  const db = await database();
  const tx = db.transaction('games', 'readwrite');
  const old = (await tx.store.get(record.game.id)) as LocalRecord | undefined;
  if (old && old.game.revision !== expected) {
    await tx.done;
    throw new Error('Game changed in another tab. Reload the latest version.');
  }
  await tx.store.put(record);
  await tx.done;
}
export async function localSynced(id: string, revision: number) {
  const db = await database();
  const tx = db.transaction('games', 'readwrite');
  const record = (await tx.store.get(id)) as LocalRecord | undefined;
  if (record)
    await tx.store.put({ ...record, syncedRevision: Math.max(record.syncedRevision, revision) });
  await tx.done;
}
export async function localReview(id: string, review: Review) {
  const db = await database();
  const tx = db.transaction('games', 'readwrite');
  const record = (await tx.store.get(id)) as LocalRecord | undefined;
  if (
    record &&
    (!record.review ||
      record.review.version !== review.version ||
      record.review.positions.length <= review.positions.length)
  )
    await tx.store.put({ ...record, review });
  await tx.done;
}
export async function localGames(): Promise<LocalRecord[]> {
  return (await database()).getAll('games');
}
export async function localDelete(id: string) {
  await (await database()).delete('games', id);
}

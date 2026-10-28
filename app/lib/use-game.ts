import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { localCommit, localGet, localPut, localSynced, type LocalRecord } from './local';
import type { Game } from './game';

export function useGame(id: string, server: Game | null, owner: string | null) {
  const [game, setGame] = useState<Game | null>(server),
    [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Loading'),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false);
  const record = useRef<LocalRecord | null>(null),
    saving = useRef(false),
    syncing = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const conflictRef = useRef(false);
  const failConflict = useCallback((message: string) => {
    conflictRef.current = true;
    setConflict(true);
    setError(message);
    setStatus('Not synced');
  }, []);
  useEffect(() => {
    let live = true;
    (async () => {
      const cached = await localGet(id);
      let selected: LocalRecord;
      if (server) {
        const validCache = cached?.owner === owner ? cached : undefined;
        const prefix = validCache && server.moves.every((m, i) => validCache.game.moves[i] === m);
        if (validCache && validCache.game.revision > server.revision && prefix)
          selected = { ...validCache, syncedRevision: server.revision };
        else if (validCache && validCache.game.revision > validCache.syncedRevision && !prefix) {
          selected = validCache;
          if (live) failConflict('Game changed in another tab. Reload the latest version.');
        } else
          selected = {
            game: server,
            owner,
            syncedRevision: server.revision,
            review: validCache?.review,
          };
      } else {
        if (!cached || (!id.startsWith('local_') && cached.owner !== owner))
          throw new Error('This game is not on this device. Start a new game.');
        selected = cached;
      }
      if (!live) return;
      await localCommit(selected, cached?.game.revision ?? selected.game.revision);
      record.current = selected;
      if (!live) return;
      setGame(selected.game);
      setReady(true);
      setStatus(
        selected.owner
          ? selected.syncedRevision < selected.game.revision
            ? 'Not synced'
            : 'Saved'
          : 'Saved on this device',
      );
    })().catch((e) => {
      if (live) {
        if ((e as Error).message.includes('another tab')) failConflict((e as Error).message);
        else setError((e as Error).message);
      }
    });
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('arena-game-' + id);
      channel.current.onmessage = () => {
        if (live) failConflict('This game changed in another tab. Reload the latest version.');
      };
    }
    return () => {
      live = false;
      channel.current?.close();
    };
  }, [id, owner, server, failConflict]);
  const commit = useCallback(
    async (next: Game) => {
      if (!record.current || saving.current || conflictRef.current) return;
      saving.current = true;
      try {
        const updated = { ...record.current, game: next };
        await localCommit(updated, record.current.game.revision);
        record.current = updated;
        setGame(next);
        setStatus(updated.owner ? 'Saving' : 'Saved on this device');
        channel.current?.postMessage({ revision: next.revision });
      } catch (e) {
        if ((e as Error).message.includes('another tab')) failConflict((e as Error).message);
        else setError('Could not save on this device. Check browser storage and retry.');
      } finally {
        saving.current = false;
      }
    },
    [failConflict],
  );
  const sync = useCallback(async () => {
    if (!record.current?.owner || syncing.current || conflictRef.current || !ready) return;
    syncing.current = true;
    try {
      while (record.current && record.current.syncedRevision < record.current.game.revision) {
        const current: LocalRecord = record.current;
        const revision: number = current.syncedRevision;
        setStatus('Saving');
        const body: { intent: string; revision: number; move?: string } =
          revision < current.game.moves.length
            ? { intent: 'move', revision, move: current.game.moves[revision] }
            : { intent: 'resign', revision };
        const response: Game = (await api(body, id)).game!;
        const latest: LocalRecord = record.current!;
        if (
          response.moves.some((m, i) => latest.game.moves[i] !== m) ||
          response.revision > latest.game.revision ||
          (response.resigned && !latest.game.resigned)
        )
          throw Object.assign(
            new Error('Game changed in another tab. Reload the latest version.'),
            { status: 409 },
          );
        record.current = { ...latest, syncedRevision: response.revision };
        await localSynced(id, response.revision);
      }
      setStatus('Saved');
      setError('');
    } catch (e) {
      setStatus('Not synced');
      if ((e as Error & { status?: number }).status === 409) failConflict((e as Error).message);
      else setError((e as Error).message || 'Not synced. Your moves are saved on this device.');
    } finally {
      syncing.current = false;
    }
  }, [id, ready, failConflict]);
  useEffect(() => {
    if (!ready) return;
    void sync();
    const timer = setInterval(() => void sync(), 8000);
    window.addEventListener('online', sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', sync);
    };
  }, [ready, game?.revision, sync]);
  const reload = async () => {
    if (server) {
      await localPut({ game: server, owner, syncedRevision: server.revision });
    }
    location.reload();
  };
  return { game, ready, status, error, conflict, commit, sync, reload };
}

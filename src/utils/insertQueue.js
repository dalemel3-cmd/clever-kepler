import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { reportDataError } from '../errorReporting';

// Offline-safe inserts for lift_logs and performance_tests (weigh-ins have their own
// older queue in App.jsx). A set logged in a weight room with no signal used to look
// saved - the optimistic row sat in this device's cache - but it never reached the
// cloud and nothing ever retried it. Now:
//  - every new row gets its real UUID on the device, so a retry is an idempotent
//    "insert, skip if that id already exists" (upsert + ignoreDuplicates): a save whose
//    response was lost can never become a duplicate;
//  - a network failure parks the rows in a localStorage queue that retries on
//    reconnect, on the next app start, and every 30s while anything is waiting;
//  - a real rejection (bad data, permissions) is NOT queued - it's reported and the
//    caller removes the row, instead of retrying something that can never succeed.

export const newRowId = () => (globalThis.crypto?.randomUUID
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

export const isNetworkError = (e) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String(e?.message || e || '');
  return e?.status === 0 || /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|aborted/i.test(msg);
};

const readQueue = (key) => { try { const q = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(q) ? q : []; } catch { return []; } };
const writeQueue = (key, q) => { try { localStorage.setItem(key, JSON.stringify(q)); } catch {} };

const CHUNK = 200;

// table: Supabase table. queueKey: localStorage key. onSaved(ids, serverRows): mark
// those rows as uploaded. onRejected(ids): drop rows the server refused for good.
export function useInsertQueue({ table, queueKey, onSaved, onRejected }) {
  const [pending, setPending] = useState(() => readQueue(queueKey));
  const flushing = useRef(false);
  const cb = useRef({ onSaved, onRejected });
  cb.current = { onSaved, onRejected };

  // Storage is the source of truth and is written synchronously, so a flush that runs
  // right after an enqueue always sees it (a React state updater runs later).
  const setQueue = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(readQueue(queueKey)) : updater;
    writeQueue(queueKey, next);
    setPending(next);
  }, [queueKey]);

  const send = useCallback(async (payloads) => {
    const saved = [];
    for (let i = 0; i < payloads.length; i += CHUNK) {
      const { data, error } = await supabase.from(table)
        .upsert(payloads.slice(i, i + CHUNK), { onConflict: 'id', ignoreDuplicates: true })
        .select();
      if (error) throw error;
      if (data) saved.push(...data);
    }
    return saved;
  }, [table]);

  // Retry everything waiting. On a hard rejection of the batch, fall back to one row
  // at a time so a single bad row can't hold the rest hostage.
  const flush = useCallback(async () => {
    const queue = readQueue(queueKey);
    if (!queue.length || flushing.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    flushing.current = true;
    try {
      const data = await send(queue);
      const ids = queue.map(p => p.id);
      setQueue(prev => prev.filter(p => !ids.includes(p.id)));
      cb.current.onSaved(ids, data);
    } catch (e) {
      if (!isNetworkError(e)) {
        for (const p of queue) {
          try {
            const data = await send([p]);
            setQueue(prev => prev.filter(x => x.id !== p.id));
            cb.current.onSaved([p.id], data);
          } catch (err) {
            if (isNetworkError(err)) break;
            reportDataError(err, `${table}:queued-write`);
            setQueue(prev => prev.filter(x => x.id !== p.id));
            cb.current.onRejected([p.id]);
          }
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [queueKey, send, setQueue, table]);

  // Save now; if the network is the problem, queue instead.
  // Returns { ok: true } | { ok: true, queued: true } | { ok: false, error }.
  const insert = useCallback(async (payloads) => {
    if (!payloads.length) return { ok: true };
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Offline');
      const data = await send(payloads);
      cb.current.onSaved(payloads.map(p => p.id), data);
      return { ok: true };
    } catch (e) {
      if (isNetworkError(e)) {
        setQueue(prev => [...prev.filter(p => !payloads.some(x => x.id === p.id)), ...payloads]);
        return { ok: true, queued: true };
      }
      reportDataError(e, `${table}:write`);
      cb.current.onRejected(payloads.map(p => p.id));
      return { ok: false, error: e };
    }
  }, [send, setQueue, table]);

  const enqueue = useCallback((payloads) => {
    if (payloads.length) setQueue(prev => [...prev.filter(p => !payloads.some(x => x.id === p.id)), ...payloads]);
  }, [setQueue]);

  // Editing or deleting a row that hasn't uploaded yet changes the queued copy, so the
  // correction (or the delete) isn't undone when the queue finally sends.
  const patchQueued = useCallback((id, patch) => {
    if (readQueue(queueKey).some(p => p.id === id)) setQueue(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  }, [queueKey, setQueue]);
  const dropQueued = useCallback((id) => {
    if (readQueue(queueKey).some(p => p.id === id)) setQueue(prev => prev.filter(p => p.id !== id));
  }, [queueKey, setQueue]);
  const isQueued = useCallback((id) => readQueue(queueKey).some(p => p.id === id), [queueKey]);

  useEffect(() => {
    flush();
    const onOnline = () => flush();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flush]);

  useEffect(() => {
    if (!pending.length) return undefined;
    const t = setInterval(flush, 30000);
    return () => clearInterval(t);
  }, [pending.length, flush]);

  return { insert, enqueue, flush, patchQueued, dropQueued, isQueued, pendingCount: pending.length };
}

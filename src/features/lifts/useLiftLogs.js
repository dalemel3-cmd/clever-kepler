import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { reportDataError } from '../../errorReporting';
import { useInsertQueue, newRowId } from '../../utils/insertQueue';

const CACHE_KEY = 'shiloh_lift_logs';
const QUEUE_KEY = 'hpd_pending_lift_logs';

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
};
const writeCache = (rows) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch {}
};

// Weight-room lift logs (Bench, Squat, Deadlift, Hang Clean, Power Clean, plus
// whatever a coach adds in Settings). Same shape as usePerformanceTests: its own
// hook rather than folded into the main adaptive-poll pipeline, since this is a
// rarely-touched side panel, not something every screen needs on every render -
// local cache first, background fetch, realtime subscription.
export function useLiftLogs() {
  const [rows, setRows] = useState(readCache);
  const mounted = useRef(true);
  const rescueRef = useRef(() => {});

  const mergeRows = useCallback((incoming) => {
    setRows(prev => {
      const byId = new Map(prev.map(r => [r.id, r]));
      incoming.forEach(r => byId.set(r.id, r));
      const next = [...byId.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      writeCache(next);
      return next;
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('lift_logs').select('*').order('created_at', { ascending: false });
        if (error) reportDataError(error, 'lift_logs:fetch');
        else if (data && mounted.current) { mergeRows(data); rescueRef.current(data); }
      } catch { /* offline - the cache already loaded from localStorage covers this */ }
    })();

    let channel;
    try {
      channel = supabase
        .channel('shiloh_lift_logs_bus')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lift_logs' }, (payload) => {
          if (payload.new && Object.keys(payload.new).length) mergeRows([payload.new]);
        })
        .subscribe();
    } catch {}

    return () => {
      mounted.current = false;
      if (channel && typeof supabase.removeChannel === 'function') {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [mergeRows]);

  const toPayload = (o) => ({
    id: o.id,
    athlete_id: o.athlete_id,
    athlete_name: o.athlete_name || 'Unknown',
    sport: o.sport || '',
    lift_type: o.lift_type,
    weight_lbs: o.weight_lbs,
    reps: o.reps,
    source: o.source || 'manual',
    created_at: o.created_at,
  });
  // Rows the server accepted: take its copy (or just clear the pending mark when the
  // row already existed - a retry of a save whose response was lost).
  const markSaved = useCallback((ids, data) => {
    const byId = new Map((data || []).map(r => [r.id, r]));
    const idSet = new Set(ids);
    setRows(prev => {
      const next = prev.map(r => (idSet.has(r.id) ? (byId.get(r.id) || { ...r, pending: false }) : r));
      writeCache(next);
      return next;
    });
  }, []);
  const dropRows = useCallback((ids) => {
    const idSet = new Set(ids);
    setRows(prev => {
      const next = prev.filter(r => !idSet.has(r.id));
      writeCache(next);
      return next;
    });
  }, []);
  const queue = useInsertQueue({ table: 'lift_logs', queueKey: QUEUE_KEY, onSaved: markSaved, onRejected: dropRows });

  // Before v5.3.3 a set that failed to upload stayed in this device's cache as an
  // 'opt_...' row and was never retried. Once the server list is in, any such row the
  // server doesn't already have (same athlete, lift and time) gets a real id and joins
  // the queue, so those sets finally upload instead of living on one device forever.
  rescueRef.current = (server) => {
    const have = new Set(server.map(r => `${r.athlete_id}|${r.lift_type}|${new Date(r.created_at).getTime()}`));
    const stranded = readCache().filter(r => String(r.id).startsWith('opt_'));
    if (!stranded.length) return;
    const drop = new Set(stranded.map(r => r.id));
    const rescued = stranded
      .filter(r => r.athlete_id && !have.has(`${r.athlete_id}|${r.lift_type}|${new Date(r.created_at).getTime()}`))
      .map(r => ({ ...r, id: newRowId(), pending: true }));
    setRows(prev => {
      const next = [...prev.filter(r => !drop.has(r.id)), ...rescued].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      writeCache(next);
      return next;
    });
    queue.enqueue(rescued.map(toPayload));
    if (rescued.length) setTimeout(queue.flush, 0);
  };

  // Each new set gets its real id on the device (see utils/insertQueue): shows
  // immediately, uploads now if it can, otherwise waits in the offline queue.
  // Many sets (Team Log) go up in one request.
  const addLifts = useCallback(async (recs) => {
    if (!recs.length) return { ok: true, count: 0 };
    const rows = recs.map(rec => ({ source: 'manual', ...rec, id: newRowId(), created_at: rec.created_at || new Date().toISOString(), pending: true }));
    mergeRows(rows);
    const res = await queue.insert(rows.map(toPayload));
    return { ...res, count: recs.length };
  }, [mergeRows, queue.insert]); // eslint-disable-line react-hooks/exhaustive-deps
  const addLift = useCallback((rec) => addLifts([rec]), [addLifts]);

  // Corrects a mis-entered lift in place - a fat-fingered weight or rep count should
  // not require deleting the row and losing the rest of its history.
  const updateLift = useCallback(async (id, patch) => {
    setRows(prev => {
      const next = prev.map(r => (r.id === id ? { ...r, ...patch } : r)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      writeCache(next);
      return next;
    });
    // Not uploaded yet: fix the queued copy; the queue sends the corrected row.
    if (queue.isQueued(id)) { queue.patchQueued(id, patch); return { ok: true }; }
    try {
      const { error } = await supabase.from('lift_logs').update(patch).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      reportDataError(e, 'lift_logs:write');
      return { ok: false, error: e };
    }
  }, [queue]);

  // Reassigns a batch of already-logged sets to a different lift type in one shot,
  // leaving their weight/reps/athlete/date untouched - for the common mislabel case
  // (a whole session logged as "Bench" that should have been "Incline Bench") where
  // deleting and re-logging every set by hand would also lose the original timestamps.
  const bulkUpdateLiftType = useCallback(async (ids, newLiftType) => {
    if (!ids || !ids.length || !newLiftType) return { ok: false, error: new Error('Nothing to update') };
    const idSet = new Set(ids);
    setRows(prev => {
      const next = prev.map(r => (idSet.has(r.id) ? { ...r, lift_type: newLiftType } : r));
      writeCache(next);
      return next;
    });
    ids.forEach(id => queue.patchQueued(id, { lift_type: newLiftType }));
    const cloudIds = ids.filter(id => !queue.isQueued(id));
    if (!cloudIds.length) return { ok: true, count: ids.length };
    try {
      const { error } = await supabase.from('lift_logs').update({ lift_type: newLiftType }).in('id', cloudIds);
      if (error) throw error;
      return { ok: true, count: ids.length };
    } catch (e) {
      reportDataError(e, 'lift_logs:write');
      return { ok: false, error: e };
    }
  }, [queue]);

  const deleteLift = useCallback(async (id) => {
    let removed = null;
    setRows(prev => {
      removed = prev.find(r => r.id === id) || null;
      const next = prev.filter(r => r.id !== id);
      writeCache(next);
      return next;
    });
    if (queue.isQueued(id)) { queue.dropQueued(id); return { ok: true }; }
    try {
      const { error } = await supabase.from('lift_logs').delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      reportDataError(e, 'lift_logs:write');
      // Put the optimistically-removed row back rather than leaving the UI showing a
      // delete that didn't actually happen.
      if (removed) mergeRows([removed]);
      return { ok: false, error: e };
    }
  }, [mergeRows, queue]);

  return { liftLogs: rows, addLift, addLifts, updateLift, deleteLift, bulkUpdateLiftType, pendingLiftCount: queue.pendingCount, flushLiftQueue: queue.flush };
}

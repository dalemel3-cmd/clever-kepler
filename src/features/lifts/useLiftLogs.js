import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';

const CACHE_KEY = 'shiloh_lift_logs';

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch (e) { return []; }
};
const writeCache = (rows) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch (e) {}
};

// Weight-room lift logs (Bench, Squat, Deadlift, Hang Clean, Power Clean, plus
// whatever a coach adds in Settings). Same shape as usePerformanceTests: its own
// hook rather than folded into the main adaptive-poll pipeline, since this is a
// rarely-touched side panel, not something every screen needs on every render -
// local cache first, background fetch, realtime subscription.
export function useLiftLogs() {
  const [rows, setRows] = useState(readCache);
  const mounted = useRef(true);

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
        if (!error && data && mounted.current) mergeRows(data);
      } catch (e) { /* offline - the cache already loaded from localStorage covers this */ }
    })();

    let channel;
    try {
      channel = supabase
        .channel('shiloh_lift_logs_bus')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lift_logs' }, (payload) => {
          if (payload.new && Object.keys(payload.new).length) mergeRows([payload.new]);
        })
        .subscribe();
    } catch (e) {}

    return () => {
      mounted.current = false;
      if (channel && typeof supabase.removeChannel === 'function') {
        try { supabase.removeChannel(channel); } catch (e) {}
      }
    };
  }, [mergeRows]);

  const addLift = useCallback(async (rec) => {
    // Optimistic row so the entry appears immediately even offline; a real id from
    // Supabase replaces it once the insert round-trips (or the realtime echo
    // delivers the row from another device).
    const optimistic = { id: 'opt_' + Date.now(), source: 'manual', ...rec, created_at: rec.created_at || new Date().toISOString() };
    mergeRows([optimistic]);
    try {
      const { data, error } = await supabase.from('lift_logs').insert([{
        athlete_id: rec.athlete_id,
        athlete_name: rec.athlete_name || 'Unknown',
        sport: rec.sport || '',
        lift_type: rec.lift_type,
        weight_lbs: rec.weight_lbs,
        reps: rec.reps,
        source: rec.source || 'manual',
        created_at: optimistic.created_at,
      }]).select();
      if (error) throw error;
      if (data && data[0]) {
        setRows(prev => {
          const next = [data[0], ...prev.filter(r => r.id !== optimistic.id)]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          writeCache(next);
          return next;
        });
      }
      return { ok: true };
    } catch (e) {
      // Optimistic row stays visible; nothing else to reconcile offline for a feature
      // this lightly used yet - unlike weigh-ins there is no offline queue for this table.
      return { ok: false, error: e };
    }
  }, [mergeRows]);

  // Corrects a mis-entered lift in place - a fat-fingered weight or rep count should
  // not require deleting the row and losing the rest of its history.
  const updateLift = useCallback(async (id, patch) => {
    setRows(prev => {
      const next = prev.map(r => (r.id === id ? { ...r, ...patch } : r)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      writeCache(next);
      return next;
    });
    try {
      const { error } = await supabase.from('lift_logs').update(patch).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }, []);

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
    try {
      const { error } = await supabase.from('lift_logs').update({ lift_type: newLiftType }).in('id', ids);
      if (error) throw error;
      return { ok: true, count: ids.length };
    } catch (e) {
      return { ok: false, error: e };
    }
  }, []);

  const deleteLift = useCallback(async (id) => {
    let removed = null;
    setRows(prev => {
      removed = prev.find(r => r.id === id) || null;
      const next = prev.filter(r => r.id !== id);
      writeCache(next);
      return next;
    });
    try {
      const { error } = await supabase.from('lift_logs').delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      // Put the optimistically-removed row back rather than leaving the UI showing a
      // delete that didn't actually happen.
      if (removed) mergeRows([removed]);
      return { ok: false, error: e };
    }
  }, [mergeRows]);

  return { liftLogs: rows, addLift, updateLift, deleteLift, bulkUpdateLiftType };
}

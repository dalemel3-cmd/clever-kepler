import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';

const CACHE_KEY = 'shiloh_alert_status';

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { return {}; }
};
const writeCache = (map) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch (e) {}
};

// Lifecycle state for alert cards: open -> acknowledged -> resolved (or open -> resolved
// directly). Keyed by the alert's stable `alert_key` (weigh-in id + type, e.g. "abc123_sleep")
// so status survives across re-renders/reloads even though alerts themselves are re-derived
// from weigh-in data each time rather than stored as rows.
export function useAlertStatus() {
  const [statusMap, setStatusMap] = useState(readCache);
  const mounted = useRef(true);

  const mergeRows = useCallback((rows) => {
    setStatusMap(prev => {
      const next = { ...prev };
      rows.forEach(row => { next[row.alert_key] = row; });
      writeCache(next);
      return next;
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('alert_status').select('*');
        if (!error && data && mounted.current) mergeRows(data);
      } catch (e) { /* offline - fall back to cache already loaded */ }
    })();

    let channel;
    try {
      channel = supabase
        .channel('shiloh_alert_status_bus')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alert_status' }, (payload) => {
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

  const setStatus = useCallback(async (alertKey, status, alert, actor) => {
    const now = new Date().toISOString();
    const optimistic = {
      alert_key: alertKey,
      athlete_id: alert?.athlete_id || null,
      athlete_name: alert?.athlete_name || null,
      alert_type: alert?.type || null,
      status,
      actor: actor || null,
      updated_at: now,
      created_at: statusMap[alertKey]?.created_at || now
    };
    mergeRows([optimistic]);
    try {
      await supabase.from('alert_status').upsert(optimistic, { onConflict: 'alert_key' });
    } catch (e) {
      // Optimistic local state already applied; the realtime/refetch cycle will
      // reconcile once connectivity returns. Nothing else to do offline.
    }
  }, [mergeRows, statusMap]);

  const acknowledgeAlert = useCallback((alertKey, alert, actor) => setStatus(alertKey, 'acknowledged', alert, actor), [setStatus]);
  const resolveAlert = useCallback((alertKey, alert, actor) => setStatus(alertKey, 'resolved', alert, actor), [setStatus]);
  const reopenAlert = useCallback((alertKey, alert, actor) => setStatus(alertKey, 'open', alert, actor), [setStatus]);

  const statusFor = useCallback((alertKey) => statusMap[alertKey]?.status || 'open', [statusMap]);

  return { statusMap, statusFor, acknowledgeAlert, resolveAlert, reopenAlert };
}

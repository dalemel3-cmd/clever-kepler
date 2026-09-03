import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';

const CACHE_KEY = 'shiloh_performance_tests';

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch (e) { return []; }
};
const writeCache = (rows) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch (e) {}
};

// Speed & Power test results (10yd fly, laser time; Plyomat rows later). Deliberately
// its own hook rather than folded into the app's main adaptive-poll pipeline
// (fetchReportData in App.jsx) - this table is a rarely-touched side panel, not
// something every screen needs on every render, and the existing poll is tuned and
// heavily tested around weigh_ins specifically. Same shape as useAlertStatus for
// alert_status: local cache first, background fetch, realtime subscription.
export function usePerformanceTests() {
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
        const { data, error } = await supabase.from('performance_tests').select('*').order('created_at', { ascending: false });
        if (!error && data && mounted.current) mergeRows(data);
      } catch (e) { /* offline - the cache already loaded from localStorage covers this */ }
    })();

    let channel;
    try {
      channel = supabase
        .channel('shiloh_performance_tests_bus')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'performance_tests' }, (payload) => {
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

  const addTest = useCallback(async (rec) => {
    // Optimistic row so the entry appears immediately even offline; a real id from
    // Supabase replaces it once the insert round-trips (or the realtime echo delivers
    // the row from another device).
    const optimistic = { id: 'opt_' + Date.now(), source: 'manual', unit: 'sec', ...rec, created_at: rec.created_at || new Date().toISOString() };
    mergeRows([optimistic]);
    try {
      const { data, error } = await supabase.from('performance_tests').insert([{
        athlete_id: rec.athlete_id,
        athlete_name: rec.athlete_name || 'Unknown',
        sport: rec.sport || '',
        test_type: rec.test_type,
        metric: rec.metric,
        unit: rec.unit || 'sec',
        source: 'manual',
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

  return { performanceTests: rows, addTest };
}

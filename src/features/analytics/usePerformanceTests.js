import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { normalizeName as normKey } from './plyomatImport';

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

  // Corrects a mis-entered result in place - a fat-fingered value or the wrong test
  // date should not require deleting the row and losing the rest of its history (source,
  // notes/Plyomat session id) the way a delete-and-re-add would.
  const updateTest = useCallback(async (id, patch) => {
    setRows(prev => {
      const next = prev.map(r => (r.id === id ? { ...r, ...patch } : r)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      writeCache(next);
      return next;
    });
    try {
      const { error } = await supabase.from('performance_tests').update(patch).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  }, []);

  const deleteTest = useCallback(async (id) => {
    let removed = null;
    setRows(prev => {
      removed = prev.find(r => r.id === id) || null;
      const next = prev.filter(r => r.id !== id);
      writeCache(next);
      return next;
    });
    try {
      const { error } = await supabase.from('performance_tests').delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      // Put the optimistically-removed row back rather than leaving the UI showing a
      // delete that didn't actually happen.
      if (removed) mergeRows([removed]);
      return { ok: false, error: e };
    }
  }, [mergeRows]);

  // Writes an import plan from plyomatImport.buildImportPlan.
  //
  // Athletes first, then results, because a result row needs its athlete's id. If the
  // athlete insert fails the whole import stops rather than writing orphan results
  // under a null athlete_id - a half-imported file is harder to reason about than one
  // that plainly failed. `decisions` maps a CSV name to 'link' or 'create' for the
  // ambiguous names buildImportPlan held back; anything undecided stays out.
  const importPlan = useCallback(async (plan, decisions = {}, onAthletesChanged) => {
    if (!plan) return { ok: false, error: 'Nothing to import.' };

    const tests = [...plan.tests];
    const toCreate = [...plan.newAthletes];

    for (const r of plan.needsReview) {
      const d = decisions[r.csvName];
      if (d === 'link') {
        for (const row of r.rows || []) {
          tests.push({ ...row, athlete_id: r.candidate.id, athlete_name: r.candidate.name, pendingAthleteKey: null });
        }
      } else if (d === 'create') {
        toCreate.push({ name: r.csvName, sport: r.suggestedSport, grade: r.suggestedGrade });
        for (const row of r.rows || []) {
          tests.push({ ...row, athlete_id: null, pendingAthleteKey: normKey(r.csvName), athlete_name: r.csvName });
        }
      }
    }

    if (tests.length === 0) return { ok: false, error: 'Nothing selected to import.' };

    try {
      let athletesCreated = 0;
      const idByKey = new Map();

      if (toCreate.length) {
        const { data, error } = await supabase.from('athletes').insert(
          toCreate.map(a => ({ name: a.name, sport: a.sport || '', grade: a.grade || '' }))
        ).select();
        if (error) throw error;
        (data || []).forEach(a => idByKey.set(normKey(a.name), a.id));
        athletesCreated = (data || []).length;
      }

      const payload = tests.map(t => {
        const { pendingAthleteKey, matchConfidence, ...rest } = t;
        return { ...rest, athlete_id: t.athlete_id || idByKey.get(pendingAthleteKey) || null };
      }).filter(t => t.athlete_id);

      // PostgREST rejects an over-large body outright, and this file runs to hundreds of
      // rows, so the insert is chunked rather than sent as one statement.
      const CHUNK = 200;
      const written = [];
      for (let i = 0; i < payload.length; i += CHUNK) {
        const { data, error } = await supabase.from('performance_tests').insert(payload.slice(i, i + CHUNK)).select();
        if (error) throw error;
        if (data) written.push(...data);
      }

      if (written.length) mergeRows(written);
      if (athletesCreated && typeof onAthletesChanged === 'function') await onAthletesChanged();

      return { ok: true, testsWritten: written.length, athletesCreated };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }, [mergeRows]);

  return { performanceTests: rows, addTest, updateTest, deleteTest, importPlan };
}

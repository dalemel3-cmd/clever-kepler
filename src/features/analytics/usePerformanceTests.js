import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { reportDataError } from '../../errorReporting';
import { useInsertQueue, newRowId } from '../../utils/insertQueue';
import { normalizeName as normKey } from './normalizeName';

const CACHE_KEY = 'shiloh_performance_tests';
const QUEUE_KEY = 'hpd_pending_performance_tests';

const readCache = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
};
const writeCache = (rows) => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch {}
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
        const { data, error } = await supabase.from('performance_tests').select('*').order('created_at', { ascending: false });
        if (error) reportDataError(error, 'performance_tests:fetch');
        else if (data && mounted.current) { mergeRows(data); rescueRef.current(data); }
      } catch { /* offline - the cache already loaded from localStorage covers this */ }
    })();

    let channel;
    try {
      channel = supabase
        .channel('shiloh_performance_tests_bus')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'performance_tests' }, (payload) => {
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

  // Columns are listed explicitly rather than spreading the row: the Technique field
  // added in v4.19.0 once reached the optimistic row but never the database because it
  // was missing from this list. Any column added to the table has to be added here too.
  const toPayload = (o) => ({
    id: o.id,
    athlete_id: o.athlete_id,
    athlete_name: o.athlete_name || 'Unknown',
    sport: o.sport || '',
    test_type: o.test_type,
    test_variant: o.test_variant || null,
    metric: o.metric,
    unit: o.unit || 'sec',
    source: 'manual',
    created_at: o.created_at,
  });
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
  const queue = useInsertQueue({ table: 'performance_tests', queueKey: QUEUE_KEY, onSaved: markSaved, onRejected: dropRows });

  // Pre-v5.3.3 'opt_...' rows that never uploaded: re-queue any the server doesn't have
  // (same athlete, test, technique and time). See useLiftLogs for the same rescue.
  rescueRef.current = (server) => {
    const keyOf = r => `${r.athlete_id}|${r.test_type}|${r.test_variant || ''}|${new Date(r.created_at).getTime()}`;
    const have = new Set(server.map(keyOf));
    const stranded = readCache().filter(r => String(r.id).startsWith('opt_'));
    if (!stranded.length) return;
    const drop = new Set(stranded.map(r => r.id));
    const rescued = stranded.filter(r => r.athlete_id && !have.has(keyOf(r))).map(r => ({ ...r, id: newRowId(), pending: true }));
    setRows(prev => {
      const next = [...prev.filter(r => !drop.has(r.id)), ...rescued].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      writeCache(next);
      return next;
    });
    queue.enqueue(rescued.map(toPayload));
    if (rescued.length) setTimeout(queue.flush, 0);
  };

  // New results get their real id on the device (utils/insertQueue): shown at once,
  // uploaded now if possible, otherwise queued. Team Entry sends a roster in one request.
  const addTests = useCallback(async (recs) => {
    if (!recs.length) return { ok: true, count: 0 };
    const rows = recs.map(rec => ({ source: 'manual', unit: 'sec', ...rec, id: newRowId(), created_at: rec.created_at || new Date().toISOString(), pending: true }));
    mergeRows(rows);
    const res = await queue.insert(rows.map(toPayload));
    return { ...res, count: recs.length };
  }, [mergeRows, queue.insert]); // eslint-disable-line react-hooks/exhaustive-deps
  const addTest = useCallback((rec) => addTests([rec]), [addTests]);

  // Corrects a mis-entered result in place - a fat-fingered value or the wrong test
  // date should not require deleting the row and losing the rest of its history (source,
  // notes/Plyomat session id) the way a delete-and-re-add would.
  const updateTest = useCallback(async (id, patch) => {
    setRows(prev => {
      const next = prev.map(r => (r.id === id ? { ...r, ...patch } : r)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      writeCache(next);
      return next;
    });
    if (queue.isQueued(id)) { queue.patchQueued(id, patch); return { ok: true }; }
    try {
      const { error } = await supabase.from('performance_tests').update(patch).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      reportDataError(e, 'performance_tests:write');
      return { ok: false, error: e };
    }
  }, [queue]);

  const deleteTest = useCallback(async (id) => {
    let removed = null;
    setRows(prev => {
      removed = prev.find(r => r.id === id) || null;
      const next = prev.filter(r => r.id !== id);
      writeCache(next);
      return next;
    });
    if (queue.isQueued(id)) { queue.dropQueued(id); return { ok: true }; }
    try {
      const { error } = await supabase.from('performance_tests').delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      reportDataError(e, 'performance_tests:write');
      // Put the optimistically-removed row back rather than leaving the UI showing a
      // delete that didn't actually happen.
      if (removed) mergeRows([removed]);
      return { ok: false, error: e };
    }
  }, [mergeRows, queue]);

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
        // plyomatExternalId travels with a plan row for on-screen visibility only (see
        // plyomatImport.js) - performance_tests has no such column, so it's stripped here
        // alongside the other plan-only bookkeeping fields rather than sent to Postgres.
        const { pendingAthleteKey, matchConfidence, plyomatExternalId, ...rest } = t;
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
      reportDataError(e, 'performance_tests:write');
      return { ok: false, error: e.message || String(e) };
    }
  }, [mergeRows]);

  // Advances the "sync from Plyomat" checkpoint after a successful, non-partial API sync
  // import - kept here rather than inside importPlan itself, since importPlan is shared
  // by both the CSV and API paths and only the API path has a checkpoint to move. Called
  // by the panel with the Edge Function's own `fetchedThrough` timestamp, never advanced
  // past data a partial/rate-limited sync didn't actually retrieve.
  const advancePlyomatSyncCheckpoint = useCallback(async (fetchedThrough) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('plyomat_sync_state').update({
        last_synced_at: fetchedThrough,
        last_synced_by: userData?.user?.id || null,
        updated_at: new Date().toISOString(),
      }).eq('id', true);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      reportDataError(e, 'performance_tests:write');
      return { ok: false, error: e.message || String(e) };
    }
  }, []);

  return { performanceTests: rows, pendingTestCount: queue.pendingCount, flushTestQueue: queue.flush, addTest, addTests, updateTest, deleteTest, importPlan, advancePlyomatSyncCheckpoint };
}

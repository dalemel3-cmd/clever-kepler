import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { allowFetch } from '../../utils/fetchBrake';

// The Program Builder (web) - nothing here is cached on the device (docs/HANDOFF.md
// §120-121). The rack tablets load only today's programs, separately, through
// useTodaysWorkouts (§134). The list fetches only the summary
// columns (a few hundred bytes per program); a program's full `days` load when it is
// opened. Archived programs drop out of the list but stay in the table for reprints.
const LIST_COLS = 'id,name,week_label,phase,sport,updated_at,archived_at';
// Only used if the `programs` table hasn't been created yet (db/014_programs.sql): the
// builder still works on this browser, and those programs upload on the first load
// after the table exists, then this key is cleared.
const FALLBACK_KEY = 'hpd_programs';
const readFallback = () => { try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '[]'); } catch { return []; } };
const writeFallback = (rows) => { try { if (rows.length) localStorage.setItem(FALLBACK_KEY, JSON.stringify(rows)); else localStorage.removeItem(FALLBACK_KEY); } catch { /* ignore */ } };
const isMissingTable = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));
const toRow = (p) => ({ id: p.id, name: p.name || 'Untitled', week_label: p.week_label || null, phase: p.phase || null, sport: p.sport || null, days: p.days || [], max_map: p.max_map || {}, archived_at: p.archived_at || null, updated_at: new Date().toISOString() });
const summary = ({ days, max_map, ...rest }) => ({ ...rest, dayCount: Array.isArray(days) ? days.length : rest.dayCount });
const byUpdated = (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0);

// In-memory session cache so switching sub-tabs or re-opening a program is instant (0ms)
// without writing to localStorage in cloud mode.
let memList = null;
let memMode = 'loading';
const memFull = new Map();

export function usePrograms() {
  const [list, setList] = useState(() => memList || []);
  const [mode, setMode] = useState(() => memMode); // 'cloud' | 'local' | 'error' | 'loading'
  const mounted = useRef(true);

  const updateList = useCallback((updater) => {
    setList(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      memList = next;
      return next;
    });
  }, []);

  const updateMode = useCallback((m) => {
    memMode = m;
    setMode(m);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('programs').select(LIST_COLS).order('updated_at', { ascending: false });
      if (!mounted.current) return;
      if (error) {
        if (isMissingTable(error)) { updateMode('local'); updateList(readFallback().map(summary).sort(byUpdated)); }
        else updateMode('error');
        return;
      }
      const pending = readFallback();
      if (pending.length) {
        const { error: upErr } = await supabase.from('programs').upsert(pending.map(toRow));
        if (!upErr) { writeFallback([]); return refresh(); }
      }
      updateList(data || []);
      updateMode('cloud');
    } catch { if (mounted.current) updateMode('error'); }
  }, [updateList, updateMode]);

  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; }; }, [refresh]);

  // Full program (days + maxes) for the editor / printing.
  const load = useCallback(async (id) => {
    if (mode === 'local') return readFallback().find(p => p.id === id) || null;
    if (memFull.has(id)) return memFull.get(id);
    const { data, error } = await supabase.from('programs').select('*').eq('id', id).maybeSingle();
    if (!error && data) memFull.set(id, data);
    return error ? null : data;
  }, [mode]);

  const prefetch = useCallback((id) => {
    if (mode === 'local' || !id || memFull.has(id)) return;
    supabase.from('programs').select('*').eq('id', id).maybeSingle().then(({ data, error }) => {
      if (!error && data) memFull.set(id, data);
    }).catch(() => {});
  }, [mode]);

  const save = useCallback(async (program) => {
    const row = toRow(program);
    if (mode === 'local') {
      const next = [row, ...readFallback().filter(p => p.id !== row.id)];
      writeFallback(next);
      updateList(next.map(summary).sort(byUpdated));
      return { ok: true, local: true, row };
    }
    const prevList = memList || [];
    const prevFull = memFull.get(row.id);
    memFull.set(row.id, row);
    updateList(prev => [summary(row), ...prev.filter(p => p.id !== row.id)].sort(byUpdated));
    const { error } = await supabase.from('programs').upsert(row);
    if (error) {
      if (isMissingTable(error)) {
        updateMode('local');
        const next = [row, ...readFallback().filter(p => p.id !== row.id)];
        writeFallback(next);
        updateList(next.map(summary).sort(byUpdated));
        return { ok: true, local: true, row };
      }
      if (prevFull) memFull.set(row.id, prevFull); else memFull.delete(row.id);
      updateList(prevList);
      return { ok: false, error };
    }
    return { ok: true, row };
  }, [mode, updateList, updateMode]);

  const setArchived = useCallback(async (program, archived) => {
    return save({ ...program, archived_at: archived ? new Date().toISOString() : null });
  }, [save]);

  const remove = useCallback(async (id) => {
    if (mode === 'local') { const next = readFallback().filter(p => p.id !== id); writeFallback(next); updateList(next.map(summary).sort(byUpdated)); return { ok: true }; }
    const prevList = memList || [];
    const prevFull = memFull.get(id);
    memFull.delete(id);
    updateList(prev => prev.filter(p => p.id !== id));
    const { error } = await supabase.from('programs').delete().eq('id', id);
    if (error) {
      if (prevFull) memFull.set(id, prevFull);
      updateList(prevList);
      return { ok: false, error };
    }
    return { ok: true };
  }, [mode, updateList]);

  // Periodization overview (v5.11.0): every program's days, archived ones included (past
  // weeks are the point). Web-only; a few KB per program.
  const loadAll = useCallback(async () => {
    if (mode === 'local') return { ok: true, rows: readFallback() };
    if (!allowFetch('programs:all', { max: 6, windowMs: 60000 })) return { ok: false, error: new Error('Too many reloads') };
    const { data, error } = await supabase.from('programs').select('id,name,week_label,phase,sport,days,archived_at,updated_at');
    if (error) return { ok: false, error };
    return { ok: true, rows: data || [] };
  }, [mode]);

  // Spreadsheet import (v5.11.0): several new programs in one request.
  const saveMany = useCallback(async (programs) => {
    if (!programs.length) return { ok: true, count: 0 };
    const rows = programs.map(toRow);
    if (mode === 'local') {
      const next = [...rows, ...readFallback()];
      writeFallback(next);
      updateList(next.map(summary).sort(byUpdated));
      return { ok: true, local: true, count: rows.length };
    }
    const { error } = await supabase.from('programs').insert(rows);
    if (error) return { ok: false, error };
    rows.forEach(r => memFull.set(r.id, r));
    updateList(prev => [...rows.map(summary), ...prev].sort(byUpdated));
    return { ok: true, count: rows.length };
  }, [mode, updateList]);

  return { programs: list, mode, load, prefetch, save, setArchived, remove, refresh, loadAll, saveMany };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';

// Programs are a web-side printing tool, not something the iPads log into, so nothing
// is cached on the device (docs/HANDOFF.md §120-121). The list fetches only the summary
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

export function usePrograms() {
  const [list, setList] = useState([]);
  const [mode, setMode] = useState('loading'); // 'cloud' | 'local' | 'error' | 'loading'
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('programs').select(LIST_COLS).order('updated_at', { ascending: false });
      if (!mounted.current) return;
      if (error) {
        if (isMissingTable(error)) { setMode('local'); setList(readFallback().map(summary).sort(byUpdated)); }
        else setMode('error');
        return;
      }
      const pending = readFallback();
      if (pending.length) {
        const { error: upErr } = await supabase.from('programs').upsert(pending.map(toRow));
        if (!upErr) { writeFallback([]); return refresh(); }
      }
      setList(data || []);
      setMode('cloud');
    } catch { if (mounted.current) setMode('error'); }
  }, []);

  useEffect(() => { mounted.current = true; refresh(); return () => { mounted.current = false; }; }, [refresh]);

  // Full program (days + maxes) for the editor / printing.
  const load = useCallback(async (id) => {
    if (mode === 'local') return readFallback().find(p => p.id === id) || null;
    const { data, error } = await supabase.from('programs').select('*').eq('id', id).maybeSingle();
    return error ? null : data;
  }, [mode]);

  const save = useCallback(async (program) => {
    const row = toRow(program);
    if (mode === 'local') {
      const next = [row, ...readFallback().filter(p => p.id !== row.id)];
      writeFallback(next);
      setList(next.map(summary).sort(byUpdated));
      return { ok: true, local: true, row };
    }
    const { error } = await supabase.from('programs').upsert(row);
    if (error) {
      if (isMissingTable(error)) {
        setMode('local');
        const next = [row, ...readFallback().filter(p => p.id !== row.id)];
        writeFallback(next);
        setList(next.map(summary).sort(byUpdated));
        return { ok: true, local: true, row };
      }
      return { ok: false, error };
    }
    setList(prev => [summary(row), ...prev.filter(p => p.id !== row.id)].sort(byUpdated));
    return { ok: true, row };
  }, [mode]);

  const setArchived = useCallback(async (program, archived) => {
    return save({ ...program, archived_at: archived ? new Date().toISOString() : null });
  }, [save]);

  const remove = useCallback(async (id) => {
    if (mode === 'local') { const next = readFallback().filter(p => p.id !== id); writeFallback(next); setList(next.map(summary).sort(byUpdated)); return { ok: true }; }
    const { error } = await supabase.from('programs').delete().eq('id', id);
    if (error) return { ok: false, error };
    setList(prev => prev.filter(p => p.id !== id));
    return { ok: true };
  }, [mode]);

  return { programs: list, mode, load, save, setArchived, remove, refresh };
}

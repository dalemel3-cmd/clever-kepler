import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';

const CACHE_KEY = 'hpd_programs';
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; } };
const writeCache = (rows) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch { /* ignore */ } };
// "relation does not exist" (Postgres) / "table not in schema cache" (PostgREST): the
// programs table hasn't been created yet (db/014_programs.sql) - work on this device only.
const isMissingTable = (e) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));
const toRow = (p) => ({ id: p.id, name: p.name || 'Untitled', week_label: p.week_label || null, phase: p.phase || null, sport: p.sport || null, days: p.days || [], max_map: p.max_map || {}, updated_at: new Date().toISOString() });

// Programs for the Program Builder / Weight Room Card (docs/HANDOFF.md §120). Cloud
// table when it exists; always mirrored to localStorage so the builder works offline
// and before the migration has been run.
export function usePrograms() {
  const [programs, setPrograms] = useState(readCache);
  const [mode, setMode] = useState('loading'); // 'cloud' | 'local' | 'loading'
  const mounted = useRef(true);

  const put = useCallback((list) => { writeCache(list); setPrograms(list); }, []);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('programs').select('*').order('updated_at', { ascending: false });
        if (!mounted.current) return;
        if (error) { setMode(isMissingTable(error) ? 'local' : 'local'); return; }
        // Push anything made on this device before the table existed, then take the cloud copy.
        const cloudIds = new Set((data || []).map(r => r.id));
        const localOnly = readCache().filter(p => !cloudIds.has(p.id));
        if (localOnly.length) await supabase.from('programs').upsert(localOnly.map(toRow));
        const merged = [...localOnly, ...(data || [])].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0));
        put(merged);
        setMode('cloud');
      } catch { if (mounted.current) setMode('local'); }
    })();
    return () => { mounted.current = false; };
  }, [put]);

  const save = useCallback(async (program) => {
    const row = { ...program, ...toRow(program) };
    setPrograms(prev => {
      const next = [row, ...prev.filter(p => p.id !== row.id)];
      writeCache(next);
      return next;
    });
    if (mode !== 'cloud') return { ok: true, local: true };
    const { error } = await supabase.from('programs').upsert(toRow(row));
    return error ? { ok: false, error } : { ok: true };
  }, [mode]);

  const remove = useCallback(async (id) => {
    setPrograms(prev => { const next = prev.filter(p => p.id !== id); writeCache(next); return next; });
    if (mode === 'cloud') await supabase.from('programs').delete().eq('id', id);
  }, [mode]);

  return { programs, mode, save, remove };
}

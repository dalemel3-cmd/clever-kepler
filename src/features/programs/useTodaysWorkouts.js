import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { getCentralDateString } from '../../utils/athleteData';
import { allowFetch } from '../../utils/fetchBrake';
import { pruneSessions } from './workoutSession';

// Today's programs for the Lift Tracker tablets (v5.10.0, docs/HANDOFF.md §134). Only
// programs with a team and a day dated today come down, so a tablet downloads a few KB
// however big the program library gets. Kept on the device for the day, so a WiFi drop
// mid-session doesn't blank the workout; refreshed every 10 minutes and on a new day.
const KEY = 'hpd_today_workouts';
const COLS = 'id,name,week_label,phase,sport,days,max_map,updated_at';
const REFRESH_MS = 10 * 60 * 1000;

const readCache = (day) => { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && c.date === day ? c.rows : null; } catch { return null; } };
const writeCache = (day, rows) => { try { localStorage.setItem(KEY, JSON.stringify({ date: day, rows })); } catch { /* ignore */ } };

export function useTodaysWorkouts(enabled) {
  const [today, setToday] = useState(() => getCentralDateString());
  const [rows, setRows] = useState(() => readCache(getCentralDateString()) || []);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    const day = getCentralDateString();
    if (day !== today) { setToday(day); setRows(readCache(day) || []); return; } // re-runs via the effect
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (!allowFetch('programs:today', { max: 4, windowMs: 60000 })) return;
    try {
      const { data, error } = await supabase.from('programs').select(COLS)
        .is('archived_at', null).not('sport', 'is', null)
        .contains('days', JSON.stringify([{ date: day }]));
      if (error || !mounted.current) return;
      const list = (data || []).filter(p => p.sport);
      setRows(list);
      writeCache(day, list);
    } catch { /* keep what the device has */ }
  }, [today]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return () => { mounted.current = false; };
    pruneSessions(today);
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { mounted.current = false; clearInterval(t); };
  }, [enabled, load, today]);

  return { programs: enabled ? rows : [], today, refresh: load };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { getCentralDateString } from '../../utils/athleteData';
import { allowFetch } from '../../utils/fetchBrake';
import { pruneSessions } from './workoutSession';

// The programs the Lift Tracker tablets can offer (v5.10.0, docs/HANDOFF.md §134). Only
// team programs come down, so a tablet downloads a few KB however big the program library
// gets. Since v5.13.0 (§141) that's this week's and next week's dated days plus a team
// program written without dates (programs_for_tablets, db/015), so an athlete can pick
// the day they're doing; a database without that function falls back to today's days.
// Kept on the device for the day, so a WiFi drop mid-session doesn't blank the workout;
// refreshed every 10 minutes and on a new day.
const KEY = 'hpd_today_workouts';
const COLS = 'id,name,week_label,phase,sport,days,max_map,updated_at';
const REFRESH_MS = 10 * 60 * 1000;
const UNDATED_DAYS = 42;

const readCache = (day) => { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && c.date === day ? c.rows : null; } catch { return null; } };
const writeCache = (day, rows) => { try { localStorage.setItem(KEY, JSON.stringify({ date: day, rows })); } catch { /* ignore */ } };
const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const weekWindow = (ymd) => { const d = new Date(`${ymd}T12:00:00Z`); const from = addDays(ymd, -((d.getUTCDay() + 6) % 7)); return { from, to: addDays(from, 13) }; };

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
      const { from, to } = weekWindow(day);
      let { data, error } = await supabase.rpc('programs_for_tablets', { d_from: from, d_to: to, undated_since: new Date(Date.now() - UNDATED_DAYS * 86400000).toISOString() }).select(COLS);
      // Only a database without the function falls back (a dropped connection keeps the
      // tablet's copy instead of swapping it for today's days).
      if (error && (error.code === 'PGRST202' || /could not find the function|does not exist/i.test(error.message || ''))) {
        ({ data, error } = await supabase.from('programs').select(COLS)
          .is('archived_at', null).not('sport', 'is', null)
          .contains('days', JSON.stringify([{ date: day }])));
      }
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

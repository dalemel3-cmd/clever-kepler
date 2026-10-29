// Workout sessions in the database (v5.13.0, docs/HANDOFF.md §141). The rack tablet keeps
// the live session on the device (workoutSession.js) and saves it to workout_sessions as it
// goes, so an athlete can move racks, coaches see who did which day and when, and
// completed volume can be compared with prescribed. Saves are coalesced per athlete-day
// and sent after a short pause; a save that fails or happens without signal stays queued
// on the tablet (survives a reload) and goes up when the connection is back.
import { supabase } from '../../supabaseClient';
import { allowFetch } from '../../utils/fetchBrake';
import { reportDataError } from '../../errorReporting';

const PENDING_KEY = 'hpd_ws_pending';
export const SESSION_COLS = 'id,athlete_id,session_date,program_id,day_id,day_label,program_name,week_label,planned_date,started_at,finished_at,minutes,rpe,sets,done,items_done,items_total,updated_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
const keyOf = (r) => `${r.athlete_id}|${r.session_date}|${r.day_id}`;
const readPending = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}') || {}; } catch { return {}; } };
const writePending = (p) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* ignore */ } };

// The database row for a tablet session.
export function sessionRow({ athlete, program, day, dayLabel = '', session, today }) {
  return {
    athlete_id: athlete.id, athlete_name: athlete.name || null, sport: athlete.sport || null,
    session_date: today, program_id: UUID_RE.test(String(program.id)) ? program.id : null, day_id: String(day.id || ''),
    program_name: program.name || null, week_label: program.week_label || null, planned_date: day.date || null, day_label: dayLabel || null,
    started_at: iso(session.startedAt), finished_at: iso(session.finishedAt), minutes: session.minutes ?? null, rpe: session.rpe ?? null,
    sets: session.sets || {}, done: session.done || {}, items_done: session.progress?.done ?? 0, items_total: session.progress?.total ?? 0,
    updated_at: new Date().toISOString(),
  };
}

let timer = null;
let retry = null;
let flushing = null;
export const pendingSessionCount = () => Object.keys(readPending()).length;

export function queueSessionSave(row) {
  if (!row?.athlete_id || !row.day_id) return;
  const p = readPending();
  p[keyOf(row)] = row;
  writePending(p);
  clearTimeout(timer);
  timer = setTimeout(() => { flushSessions(); }, 1500);
}

export function flushSessions() {
  if (flushing) return flushing;
  flushing = (async () => {
    const rows = Object.values(readPending());
    if (!rows.length) return { ok: true, count: 0 };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { scheduleRetry(); return { ok: false, offline: true }; }
    if (!allowFetch('workout_sessions:save', { max: 30, windowMs: 60000 })) { scheduleRetry(); return { ok: false }; }
    try {
      const { error } = await supabase.from('workout_sessions').upsert(rows, { onConflict: 'athlete_id,session_date,day_id' });
      if (error) { reportDataError(error, 'workout_sessions:save'); scheduleRetry(); return { ok: false, error }; }
    } catch { scheduleRetry(); return { ok: false }; }
    // Drop what went up, unless it changed again while saving.
    const now = readPending();
    for (const r of rows) if (now[keyOf(r)]?.updated_at === r.updated_at) delete now[keyOf(r)];
    writePending(now);
    return { ok: true, count: rows.length };
  })().finally(() => { flushing = null; });
  return flushing;
}

function scheduleRetry() {
  if (retry) return;
  retry = setTimeout(() => { retry = null; if (pendingSessionCount()) flushSessions(); }, 60000);
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (pendingSessionCount()) flushSessions(); });
  if (pendingSessionCount()) setTimeout(() => flushSessions(), 3000); // left over from before a reload
}

// An athlete's sessions from `since` on (today's to pick up where another rack left off,
// recent ones for the Done marks in the workout picker). One small query per athlete opened.
export async function fetchAthleteSessions(athleteId, since) {
  if (!athleteId || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  if (!allowFetch('workout_sessions:athlete', { max: 30, windowMs: 60000 })) return null;
  try {
    const { data, error } = await supabase.from('workout_sessions').select(SESSION_COLS).eq('athlete_id', athleteId).gte('session_date', since).order('updated_at', { ascending: false }).limit(60);
    if (error) { reportDataError(error, 'workout_sessions:fetch'); return null; }
    // Rows still waiting on this tablet are newer than what the server has.
    const p = readPending();
    const out = (data || []).map(r => p[keyOf(r)] ? { ...r, ...p[keyOf(r)] } : r);
    for (const r of Object.values(p)) if (r.athlete_id === athleteId && r.session_date >= since && !out.some(x => keyOf(x) === keyOf(r))) out.push(r);
    return out;
  } catch { return null; }
}

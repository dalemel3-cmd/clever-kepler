// Workout sessions in the database (v5.13.0, docs/HANDOFF.md §141). The rack tablet keeps
// the live session on the device (workoutSession.js) and saves it to workout_sessions as it
// goes, so an athlete can move racks, coaches see who did which day and when, and
// completed volume can be compared with prescribed. Saves are coalesced per athlete-day
// and sent after a short pause; a save that fails or happens without signal stays queued
// on the tablet (survives a reload) and goes up when the connection is back.
import { supabase } from '../../supabaseClient';
import { allowFetch, fetchAllRows } from '../../utils/fetchBrake';
import { reportDataError } from '../../errorReporting';

const PENDING_KEY = 'hpd_ws_pending';
const FAILED_KEY = 'hpd_ws_failed'; // rows the database refused, kept on the tablet for a look
export const SESSION_COLS = 'id,athlete_id,athlete_name,sport,session_date,program_id,day_id,day_label,program_name,week_label,planned_date,started_at,finished_at,minutes,rpe,sets,done,items_done,items_total,updated_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
const keyOf = (r) => `${r.athlete_id}|${r.session_date}|${r.day_id}`;
const readPending = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}') || {}; } catch { return {}; } };
const writePending = (p) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* ignore */ } };

// The save time the database kept for this tablet's last save of each session (v5.15.9).
// It is the server's clock (db/016 sets a stamp from the future back to now), so "has
// another rack saved since?" compares server time with server time, not with this
// tablet's clock, which can run minutes off.
const ACKED_KEY = 'hpd_ws_acked';
const readAcked = () => { try { return JSON.parse(localStorage.getItem(ACKED_KEY) || '{}') || {}; } catch { return {}; } };
const recordAcked = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return;
  const a = readAcked();
  for (const r of rows) if (r?.athlete_id && r.updated_at) { const k = keyOf(r); delete a[k]; a[k] = r.updated_at; }
  const keys = Object.keys(a);
  for (const k of keys.slice(0, Math.max(0, keys.length - 200))) delete a[k]; // the newest 200 sessions
  try { localStorage.setItem(ACKED_KEY, JSON.stringify(a)); } catch { /* ignore */ }
};
export function ackedSaveAt(athleteId, sessionDate, dayId) {
  const v = readAcked()[`${athleteId}|${sessionDate}|${dayId}`];
  return v ? Date.parse(v) : null;
}
// Has another rack saved this session (`row`, from fetchAthleteSessions) since this tablet
// last saved it, or took it over (`s`, the tablet's session)? Compared with the database's
// stamp for this tablet's last save, or the other rack's it took over from (v5.15.9): a
// tablet clock running ahead used to make its own save look later than another rack's.
// Only a session this tablet never saved or restored falls back to its own clock.
export function savedElsewhere(row, s, athleteId, sessionDate) {
  if (!row || !s || row.pendingHere) return false;
  const known = Math.max(ackedSaveAt(athleteId, sessionDate, String(s.dayId ?? '')) || 0, s.serverUpdatedAt || 0);
  const t = Date.parse(row.updated_at);
  return known ? t > known : t > (s.savedAt || 0) + 1000;
}
const lastStamp = new Map(); // key -> ms of the last save queued on this tablet

// The database row for a tablet session.
export function sessionRow({ athlete, program, day, dayLabel = '', session, today }) {
  return {
    athlete_id: athlete.id, athlete_name: athlete.name || null, sport: athlete.sport || null,
    session_date: today, program_id: UUID_RE.test(String(program.id)) ? program.id : null, day_id: String(day.id || ''),
    program_name: program.name || null, week_label: program.week_label || null, planned_date: day.date || null, day_label: dayLabel || null,
    started_at: iso(session.startedAt), finished_at: iso(session.finishedAt), minutes: session.minutes ?? null, rpe: session.rpe ?? null,
    sets: session.sets || {}, done: session.done || {}, items_done: session.progress?.done ?? 0, items_total: session.progress?.total ?? 0,
    // Never earlier than a save restored from another rack (a slow clock here would make
    // the database's newer-wins rule ignore this save).
    updated_at: new Date(Math.max(Date.now(), (session.serverUpdatedAt || 0) + 1)).toISOString(),
  };
}

let timer = null;
let retry = null;
let flushing = null;
export const pendingSessionCount = () => Object.keys(readPending()).length;

export function queueSessionSave(row) {
  if (!row?.athlete_id || !row.day_id) return;
  const p = readPending();
  const k = keyOf(row);
  // Each save is stamped after this tablet's previous one (v5.15.9). Two saves in the same
  // millisecond tied, so the second (still queued) was dropped as already sent; a clock
  // set back made later saves look older, and the database skipped them as stale.
  const prev = Math.max(Date.parse(p[k]?.updated_at || '') || 0, lastStamp.get(k) || 0, Date.parse(readAcked()[k] || '') || 0);
  const t = Math.max(Date.parse(row.updated_at) || 0, prev + 1);
  lastStamp.set(k, t);
  p[k] = { ...row, updated_at: new Date(t).toISOString() };
  writePending(p);
  clearTimeout(timer);
  timer = setTimeout(() => { flushSessions(); }, 1500);
}

// The reply carries the stamps the database kept (a save it skipped as older than another
// rack's is left out of the reply).
const saveRows = async (rows) => {
  const { data, error } = await supabase.from('workout_sessions').upsert(rows, { onConflict: 'athlete_id,session_date,day_id' }).select('athlete_id,session_date,day_id,updated_at');
  if (!error) recordAcked(data);
  return error || null;
};
// Postgres data errors (22xxx bad value, 23xxx constraint) are about one row. Anything else
// (network, sign-in, server) is about the connection, and the whole queue waits for it.
const isRowError = (e) => /^2[23]/.test(String(e?.code || ''));
const park = (rows) => {
  try { const f = JSON.parse(localStorage.getItem(FAILED_KEY) || '[]'); localStorage.setItem(FAILED_KEY, JSON.stringify([...f, ...rows].slice(-50))); } catch { /* ignore */ }
};
// Drop what went up (or was set aside), unless it changed again while saving.
const dropSent = (rows) => {
  const now = readPending();
  for (const r of rows) if (now[keyOf(r)]?.updated_at === r.updated_at) delete now[keyOf(r)];
  writePending(now);
};

// One row the database refuses must not hold up the rest of the tablet's queue (v5.15.4):
// e.g. a coach deleted the program while this tablet had a save waiting offline, so its
// program_id no longer exists. Send one at a time, save that one without the program link,
// and set aside a row that still fails. A connection error stops and leaves the rest queued.
async function saveOneByOne(rows) {
  const done = [];
  for (const r of rows) {
    let err = await saveRows([r]);
    if (err && String(err.code) === '23503' && r.program_id) err = await saveRows([{ ...r, program_id: null }]);
    if (err && !isRowError(err)) return { done, error: err };
    if (err) { park([r]); reportDataError(err, 'workout_sessions:save-row'); }
    done.push(r);
  }
  return { done };
}

export function flushSessions() {
  if (flushing) return flushing;
  flushing = (async () => {
    const rows = Object.values(readPending());
    if (!rows.length) return { ok: true, count: 0 };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { scheduleRetry(); return { ok: false, offline: true }; }
    if (!allowFetch('workout_sessions:save', { max: 30, windowMs: 60000 })) { scheduleRetry(); return { ok: false }; }
    let done = rows;
    try {
      const error = await saveRows(rows);
      if (error && !isRowError(error)) { reportDataError(error, 'workout_sessions:save'); scheduleRetry(); return { ok: false, error }; }
      if (error) {
        const res = await saveOneByOne(rows);
        done = res.done;
        if (res.error) { reportDataError(res.error, 'workout_sessions:save'); dropSent(done); scheduleRetry(); return { ok: false, error: res.error }; }
      }
    } catch { scheduleRetry(); return { ok: false }; }
    dropSent(done);
    return { ok: true, count: done.length };
  })().then((res) => {
    flushing = null;
    // A change made while that save was in flight (e.g. Finish tapped mid-save) is still
    // queued and nothing else would send it until the next change: send it now (v5.15.4).
    if (res?.ok && res.count && pendingSessionCount()) { clearTimeout(timer); timer = setTimeout(() => { flushSessions(); }, 1500); }
    return res;
  }, (e) => { flushing = null; throw e; });
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
    // Marked (v5.15.9) so the rack doesn't take its own unsent save for another rack's.
    const out = (data || []).map(r => p[keyOf(r)] ? { ...r, ...p[keyOf(r)], pendingHere: true } : r);
    for (const r of Object.values(p)) if (r.athlete_id === athleteId && r.session_date >= since && !out.some(x => keyOf(x) === keyOf(r))) out.push({ ...r, pendingHere: true });
    return out;
  } catch { return null; }
}

// Periodization & coach view (v5.14.0): all saved workout sessions (up to 10,000 newest),
// merged with any unsynced sessions still pending in localStorage.
export async function fetchAllSessions() {
  const p = readPending();
  const pendingRows = Object.values(p);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return pendingRows;
  if (!allowFetch('workout_sessions:all', { max: 6, windowMs: 60000 })) return pendingRows;
  try {
    // Paged (v5.15.4): capped at the newest 1,000, older weeks' Completed bars would empty out.
    const { data, error } = await fetchAllRows(() => supabase.from('workout_sessions').select(SESSION_COLS).order('session_date', { ascending: false }).order('id'), { maxPages: 10 });
    if (error) { reportDataError(error, 'workout_sessions:all'); return pendingRows; }
    const out = (data || []).map(r => p[keyOf(r)] ? { ...r, ...p[keyOf(r)] } : r);
    for (const r of pendingRows) if (!out.some(x => keyOf(x) === keyOf(r))) out.push(r);
    return out;
  } catch { return pendingRows; }
}

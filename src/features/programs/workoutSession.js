// Today's workout on the Lift Tracker tablets (v5.10.0, docs/HANDOFF.md §134). Pure
// helpers: which program day an athlete trains today, the day's blocks with their own
// working weights, and the per-athlete session kept on the rack's tablet (start time for
// the automatic duration, sets logged, finish + RPE).
import { isBarbell, manualLb, maxesFor, setWeight } from './programData';

// The athlete's team program(s) with a day dated today. Programs without a team never
// show on the tablets (no guessing who "Any" was meant for).
export function workoutsFor(athlete, programs = [], today) {
  if (!athlete) return [];
  const team = athlete.sport || 'General';
  const out = [];
  for (const p of programs) {
    if (!p.sport || p.sport !== team) continue;
    for (const d of p.days || []) if (d.date === today) out.push({ program: p, day: d });
  }
  return out;
}

// The days an athlete can pick on the tablet (v5.13.0, docs/HANDOFF.md §141): every day
// of their team's programs the tablet has (this week's and next week's dated days, plus a
// team program with no dates), in date order - undated ones last, in program order.
export const dayLabelOf = (day, index) => [`Day ${index + 1}`, day?.focus].filter(Boolean).join(' · ');
export function workoutChoices(athlete, programs = [], today = '') {
  if (!athlete) return [];
  const team = athlete.sport || 'General';
  const out = [];
  for (const p of programs) {
    if (!p.sport || p.sport !== team) continue;
    (p.days || []).forEach((d, i) => {
      if (!d || !(d.blocks || []).some(b => b && b.name) && !(d.fin || []).length) return;
      out.push({ key: `${p.id}:${d.id || i}`, program: p, day: d, index: i, label: dayLabelOf(d, i), date: d.date || '', isToday: !!today && d.date === today });
    });
  }
  return out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || String(a.program.week_label || '').localeCompare(String(b.program.week_label || ''), undefined, { numeric: true }) || a.index - b.index);
}
// Same program day? (sessions remember the day's id; programs made offline have no uuid)
export const sameDay = (s, choice) => !!s && !!choice && (s.dayId || null) === (choice.day.id || null) && (!s.programId || !choice.program.id || s.programId === choice.program.id);

const firstInt = (v) => { const m = String(v ?? '').match(/\d+/); return m ? Number(m[0]) : null; };

// The day's blocks with weights from `maxes` (frozen when the session starts, so a PR
// halfway through doesn't move the rest of today's numbers). A block whose max key maps
// to a Lift Tracker lift logs its sets to lift_logs; anything else is checked off.
export function buildWorkoutDay(program, day, maxes = {}) {
  const map = program.max_map || {};
  const named = (day.blocks || []).filter(b => b && b.name);
  return named.map((b, i) => {
    const lift = b.maxKey ? map[b.maxKey] || '' : '';
    const max = b.maxKey ? maxes[b.maxKey] ?? null : null;
    // A manual weight on the set (v5.15.1) is used as typed; athletes adjust it with the
    // same stepper as a %-of-max weight.
    const sets = (b.sets || []).map((s, k) => {
      const pct = !manualLb(s) && Number(s.pct) > 0 ? Number(s.pct) : null;
      const wt = setWeight(s, max, { barbell: isBarbell(b) });
      return { k, reps: String(s.reps ?? ''), repsNum: firstInt(s.reps), pct, wt: wt === '' ? null : wt, tempo: s.tempo || '' };
    });
    return {
      id: b.id || `${day.id || 'day'}_${i}`, code: b.code || '', name: b.name, note: b.note || '', rx: b.rx || '',
      // Only barbell work logs into Lift Tracker under the mapped lift; a dumbbell / each-hand
      // exercise prescribed as a % of it (RFE split squat at 20% of squat) is checked off,
      // so it never lands in that lift's history.
      velocity: b.velocity || '', lift, max, sets, loggable: !!lift && sets.length > 0 && isBarbell(b),
      newGroup: i > 0 && String(named[i - 1].code || '')[0] !== String(b.code || '')[0],
    };
  });
}

// Work items: every set of a block, or one item for a block prescribed as text ("3x 8").
export const totalItems = (blocks) => blocks.reduce((n, b) => n + (b.sets.length || 1), 0);
export const doneItems = (blocks, s) => blocks.reduce((n, b) => {
  if (!b.sets.length) return n + (s?.done?.[b.id] ? 1 : 0);
  return n + b.sets.filter(x => s?.sets?.[b.id]?.[x.k] || s?.done?.[`${b.id}_${x.k}`]).length;
}, 0);

const KEY = (athleteId, day) => `hpd_workout_${athleteId}_${day}`;
export function readSession(athleteId, day) {
  try { return JSON.parse(localStorage.getItem(KEY(athleteId, day)) || 'null'); } catch { return null; }
}
export function writeSession(athleteId, day, s) {
  try { localStorage.setItem(KEY(athleteId, day), JSON.stringify({ ...s, savedAt: Date.now() })); } catch { /* ignore */ }
}
// A session saved from another rack (workout_sessions row) as this tablet's session.
export function sessionFromRow(row, maxes = {}) {
  const ms = (v) => (v ? Date.parse(v) : null);
  return {
    v: 1, programId: row.program_id || null, dayId: row.day_id || null, startedAt: ms(row.started_at) || Date.now(), maxes,
    sets: row.sets || {}, done: row.done || {}, progress: { done: row.items_done || 0, total: row.items_total || 0 },
    finishedAt: ms(row.finished_at), rpe: row.rpe ?? null, minutes: row.minutes ?? null, fromCloud: true,
  };
}
export function startSession({ athlete, program, day, liftLogs, seasonStartDate, now = Date.now() }) {
  const maxes = maxesFor(athlete.id, liftLogs, program.max_map || {}, { seasonStartDate });
  return { v: 1, programId: program.id, dayId: day.id || null, startedAt: now, maxes, sets: {}, done: {}, progress: null, finishedAt: null, rpe: null, minutes: null };
}
// Automatic duration: start (athlete first opened today's workout) to Finish. The timer
// stops at the cap (Settings > Lift Tracker, 60 min by default) so a workout nobody
// finished doesn't keep counting; the minutes can still be changed before the RPE is saved.
export const DEFAULT_TIMER_CAP = 60;
export const capOf = (cap) => (Number(cap) > 0 ? Number(cap) : DEFAULT_TIMER_CAP);
export const elapsedMinutes = (startedAt, now = Date.now(), cap = DEFAULT_TIMER_CAP) => Math.min(capOf(cap), Math.max(1, Math.round((now - startedAt) / 60000)));
export const timerCapped = (startedAt, now = Date.now(), cap = DEFAULT_TIMER_CAP) => now - startedAt >= capOf(cap) * 60000;

// Sessions are only needed for the day they belong to. Old ones are removed when the
// Lift Tracker opens so the tablet's storage never grows over a season.
export function pruneSessions(today) {
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('hpd_workout_') && !k.endsWith(`_${today}`)) stale.push(k);
    }
    stale.forEach(k => localStorage.removeItem(k));
    return stale.length;
  } catch { return 0; }
}

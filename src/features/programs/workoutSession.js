// Today's workout on the Lift Tracker tablets (v5.10.0, docs/HANDOFF.md §134). Pure
// helpers: which program day an athlete trains today, the day's blocks with their own
// working weights, and the per-athlete session kept on the rack's tablet (start time for
// the automatic duration, sets logged, finish + RPE).
import { isBarbell, maxesFor, workingWeight } from './programData';

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
    const sets = (b.sets || []).map((s, k) => {
      const pct = Number(s.pct) > 0 ? Number(s.pct) : null;
      const wt = pct ? workingWeight(max, pct / 100, { barbell: isBarbell(b) }) : '';
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
  try { localStorage.setItem(KEY(athleteId, day), JSON.stringify(s)); } catch { /* ignore */ }
}
export function startSession({ athlete, program, day, liftLogs, seasonStartDate, now = Date.now() }) {
  const maxes = maxesFor(athlete.id, liftLogs, program.max_map || {}, { seasonStartDate });
  return { v: 1, programId: program.id, dayId: day.id || null, startedAt: now, maxes, sets: {}, done: {}, progress: null, finishedAt: null, rpe: null, minutes: null };
}
// Automatic duration: start (athlete first opened today's workout) to Finish.
export const elapsedMinutes = (startedAt, now = Date.now()) => Math.min(300, Math.max(1, Math.round((now - startedAt) / 60000)));

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

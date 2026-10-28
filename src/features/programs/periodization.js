// Periodization overview data (v5.11.0, docs/HANDOFF.md §137). Pure. Reads the
// programs' dated days (athlete-independent: prescriptions, not what anyone lifted) and
// sums them per day, week (Monday start) or month: sessions, sets, reps, load
// (reps × % of max), average intensity (rep-weighted % of max) and top %.
import { MAX_KEYS } from './programData';

export const LIFT_FILTERS = [['', 'All lifts'], ...MAX_KEYS];
export const VOLUME_MEASURES = [['load', 'Load (reps × %)'], ['reps', 'Reps'], ['sets', 'Sets']];
const firstInt = (v) => { const m = String(v ?? '').match(/\d+/); return m ? Number(m[0]) : 0; };
const at = (ymd) => new Date(`${ymd}T12:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
export const mondayOf = (ymd) => { const d = at(ymd); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); };

// One entry per dated program day; `undated` counts days that can't go on a calendar.
export function sessionsFrom(programs = [], { sport = 'ALL', lift = '', from = '', to = '' } = {}) {
  const sessions = [];
  let undated = 0;
  for (const p of programs) {
    if (sport !== 'ALL' && (p.sport || '') !== sport) continue;
    for (const d of p.days || []) {
      if (!d.date) { undated++; continue; }
      if ((from && d.date < from) || (to && d.date > to)) continue;
      const s = { date: d.date, programId: p.id, program: p.name || '', week: p.week_label || '', phase: p.phase || '', focus: d.focus || '', sets: 0, reps: 0, wReps: 0, wSum: 0, load: 0, top: null, lifts: {} };
      for (const b of d.blocks || []) {
        if (!b.name || !b.sets?.length || (lift && b.maxKey !== lift)) continue;
        for (const set of b.sets) {
          const reps = firstInt(set.reps);
          const pct = Number(set.pct) > 0 ? Number(set.pct) : null;
          s.sets += 1; s.reps += reps;
          if (pct != null) { s.wReps += reps; s.wSum += reps * pct; s.load += (reps * pct) / 100; s.top = Math.max(s.top ?? 0, pct); }
          if (b.maxKey) {
            const L = s.lifts[b.maxKey] || (s.lifts[b.maxKey] = { sets: 0, reps: 0, lo: null, hi: null });
            L.sets += 1; L.reps += reps;
            if (pct != null) { L.lo = Math.min(L.lo ?? pct, pct); L.hi = Math.max(L.hi ?? pct, pct); }
          }
        }
      }
      sessions.push(s);
    }
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.program.localeCompare(b.program));
  return { sessions, undated };
}

const nextKey = (key, view) => {
  if (view === 'month') { const [y, m] = key.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; }
  const d = at(key); d.setUTCDate(d.getUTCDate() + 7); return iso(d);
};

// Day / week / month totals. Weeks and months with no training between the first and
// last session are kept as empty buckets, so breaks and deloads show on the timeline.
export function bucketize(sessions, view = 'week') {
  const keyOf = view === 'month' ? (s) => s.date.slice(0, 7) : view === 'week' ? (s) => mondayOf(s.date) : (s) => s.date;
  const map = new Map();
  for (const s of sessions) {
    const k = keyOf(s);
    const b = map.get(k) || { key: k, sessions: 0, sets: 0, reps: 0, wReps: 0, wSum: 0, load: 0, top: null, phases: [], weeks: [], programs: [], focus: [], lifts: {} };
    b.sessions += 1; b.sets += s.sets; b.reps += s.reps; b.wReps += s.wReps; b.wSum += s.wSum; b.load += s.load;
    if (s.top != null) b.top = Math.max(b.top ?? 0, s.top);
    for (const [arr, v] of [[b.phases, s.phase], [b.weeks, s.week], [b.programs, s.program], [b.focus, s.focus]]) if (v && !arr.includes(v)) arr.push(v);
    for (const [k2, L] of Object.entries(s.lifts)) {
      const T = b.lifts[k2] || (b.lifts[k2] = { sets: 0, reps: 0, lo: null, hi: null });
      T.sets += L.sets; T.reps += L.reps;
      if (L.lo != null) { T.lo = Math.min(T.lo ?? L.lo, L.lo); T.hi = Math.max(T.hi ?? L.hi, L.hi); }
    }
    map.set(k, b);
  }
  let keys = [...map.keys()].sort();
  if (view !== 'day' && keys.length > 1) {
    const all = [];
    for (let k = keys[0]; k <= keys[keys.length - 1]; k = nextKey(k, view)) all.push(k);
    keys = all;
  }
  return keys.map(k => {
    const b = map.get(k) || { key: k, sessions: 0, sets: 0, reps: 0, wReps: 0, wSum: 0, load: 0, top: null, phases: [], weeks: [], programs: [], focus: [], lifts: {} };
    return { ...b, avg: b.wReps ? b.wSum / b.wReps : null, load: Math.round(b.load * 10) / 10 };
  });
}

// Consecutive buckets with the same phase -> one labeled segment of the phase strip.
export function phaseSegments(buckets) {
  const segs = [];
  for (const b of buckets) {
    const label = b.phases.join(' / ') || (b.sessions ? 'No phase' : 'Off');
    const last = segs[segs.length - 1];
    if (last && last.label === label) last.span += 1; else segs.push({ label, span: 1, start: b.key });
  }
  return segs;
}

export function bucketLabel(key, view, long = false) {
  if (view === 'month') { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: long ? 'long' : 'short', year: long ? 'numeric' : undefined, timeZone: 'UTC' }); }
  const d = at(key);
  if (view === 'week') return long ? `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  return long ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export const liftSummary = (lifts) => MAX_KEYS.filter(([k]) => lifts[k]).map(([k, l]) => {
  const L = lifts[k];
  const pct = L.lo == null ? '' : L.lo === L.hi ? ` @ ${L.lo}%` : ` @ ${L.lo}–${L.hi}%`;
  return `${l} ${L.sets}×${L.reps ? Math.round(L.reps / L.sets) : '?'}${pct}`;
});

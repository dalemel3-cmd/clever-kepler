// Periodization overview data (v5.11.0, docs/HANDOFF.md §137). Pure. Reads the
// programs' dated days (athlete-independent: prescriptions, not what anyone lifted) and
// sums them per day, week (Monday start) or month: sessions, sets, reps, load
// (reps × % of max), average intensity (rep-weighted % of max) and top %.
// v5.12.0 (§139): every exercise counts, not just the ones written set by set with a % -
// "3x 8", "4x 3 ea" and "5x2" are read as sets × reps, timed sets ("3x 20s") count as
// sets but not reps, and the filter can pick a main lift or a movement group by name.
// Main lifts as the overview names them. The builder's % key "dl" is labelled TBDL (trap
// bar); here it's any deadlift, and an RDL is never counted as one (v5.12.1).
export const MAIN_LIFTS = [['clean', 'Clean'], ['bench', 'Bench'], ['squat', 'Squat'], ['dl', 'Deadlift'], ['ohp', 'OHP']];
export const MOVEMENTS = [['power', 'Power / Olympic'], ['lower', 'Lower body'], ['push', 'Upper push'], ['pull', 'Upper pull'], ['core', 'Core']];
export const LIFT_FILTERS = [['', 'All exercises'], ...MAIN_LIFTS, ...MOVEMENTS.map(([k, l]) => [`m:${k}`, l])];
export const VOLUME_MEASURES = [['reps', 'Reps'], ['sets', 'Sets'], ['load', 'Load (reps × %)']];

// Reps in one prescription: "5", "4ea", "3 ea", "6+" (rep out), "2+1" (a complex: 3 reps),
// "10s + 5" (5). A hold ("20s", "30s ea", "1 x 10s"; "20/15/15" on a plank) is a timed set.
export function repsOf(text, name = '') {
  const t = String(text ?? '').toLowerCase().replace(/\b(ea|each|per side|reps?)\b/g, ' ').trim();
  if (!t) return { reps: 0, timed: false };
  const secs = /\d+\s*(s|sec|secs|seconds)\b/.test(t);
  const plus = t.match(/\+\s*(\d+)(?!\s*(s|sec))/);
  if (secs) return plus ? { reps: Number(plus[1]), timed: false } : { reps: 0, timed: true };
  if (/^\d+(\s*\+\s*\d+)+$/.test(t)) return { reps: t.split('+').reduce((a, x) => a + Number(x), 0), timed: false };
  if (t.includes('/') && /plank|hold|\biso\b|isometric/i.test(name)) return { reps: 0, timed: true };
  const m = t.match(/\d+/);
  return { reps: m ? Number(m[0]) : 0, timed: false };
}

// The sets an exercise prescribes: set-by-set rows, or a text prescription read as
// sets × reps ("3x 8 · @ 95 lb"). Anything else ("2 Rounds", "BW") isn't counted.
export function prescribedSets(b) {
  if (b?.sets?.length) return b.sets.map(s => ({ ...repsOf(s.reps, b.name), pct: Number(s.pct) > 0 ? Number(s.pct) : null }));
  const m = String(b?.rx || '').split('·')[0].match(/^\s*(\d+)\s*[x×]\s*(.+)$/i);
  if (!m || Number(m[1]) > 20) return [];
  const one = { ...repsOf(m[2], b.name), pct: null };
  return Array.from({ length: Number(m[1]) }, () => ({ ...one }));
}

// Main lift by the exercise's name (front and back squat are Squat; a split squat, DB
// bench, step-up or RDL is not, even when prescribed as a % of one - an RDL still counts
// in the totals and under Lower body).
const RDL = /\brdl\b|\brld\b|romanian|stiff.?leg/i;
const MAIN_RULES = [
  ['clean', /clean|snatch/i, null],
  ['bench', /bench/i, /step|pigeon|to bench|\bdb\b|dumbbell|jump/i],
  ['squat', /squat/i, /split|\biso\b|\bsl\b|single|spanish|squat squat|goblet|to bench|jump|\bdb\b/i],
  ['dl', /deadlift|tbdl|trap bar/i, new RegExp(`jump|${RDL.source}`, 'i')],
  ['ohp', /military|overhead press|push press|\bohp\b/i, /kneeling|landmine|\bdb\b/i],
];
const VARIATION = new RegExp(`split|\\biso\\b|single|\\bsl\\b|step|lunge|jump|\\bdb\\b|dumbbell|pigeon|${RDL.source}`, 'i');
export function mainLiftOf(b) {
  const name = String(b?.name || '');
  for (const [k, yes, no] of MAIN_RULES) if (yes.test(name) && !(no && no.test(name))) return k;
  return b?.maxKey && !VARIATION.test(name) ? b.maxKey : '';
}

// Movement group by keywords in the name, first match wins; '' when nothing fits.
const MOVE_RULES = [
  ['', /sprint|wicket|\bfly \d|\d+\s?(yd|yard)s?\b|stretch|pigeon|mobility/i],
  ['core', /plank|dead ?bug|pal+off|bird ?dog|superman|crunch|sit.?up|twist|hollow|hallow|flutter|toe touch|leg raise|v.?up|rollout|ab wheel/i],
  ['power', /clean|snatch|jerk|high pull|\bpower\b|jump|hop|bound|throw|toss|slam|\bpass\b|depth drop|snap down|pogo|plyo|skater|broad/i],
  ['lower', /squat|lunge|step.?up|split|rdl|rld|deadlift|tbdl|trap bar|hip thrust|glute|hamstring|nordic|calf|leg (press|curl|ext)|good ?morning|sled|copenhagen|back ext|clam|adduct|abduct|hinge|ankle/i],
  ['pull', /row|pull|chin|lat\b|curl|shrug|pullover|rear delt|[ty].?raise/i],
  ['push', /bench|press|push.?up|\bdip|tricep|raise|\bfly\b|flye/i],
];
export function movementOf(name) {
  for (const [k, re] of MOVE_RULES) if (re.test(String(name || ''))) return k;
  return '';
}
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
      const s = { date: d.date, programId: p.id, program: p.name || '', week: p.week_label || '', phase: p.phase || '', focus: d.focus || '', sets: 0, reps: 0, timed: 0, wReps: 0, wSum: 0, load: 0, top: null, lifts: {} };
      for (const b of d.blocks || []) {
        if (!b.name) continue;
        const key = mainLiftOf(b);
        if (lift && (lift.startsWith('m:') ? movementOf(b.name) !== lift.slice(2) : key !== lift)) continue;
        for (const { reps, timed, pct } of prescribedSets(b)) {
          s.sets += 1;
          if (timed) { s.timed += 1; continue; }
          s.reps += reps;
          if (pct != null) { s.wReps += reps; s.wSum += reps * pct; s.load += (reps * pct) / 100; s.top = Math.max(s.top ?? 0, pct); }
          if (key) {
            const L = s.lifts[key] || (s.lifts[key] = { sets: 0, reps: 0, lo: null, hi: null });
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
    const b = map.get(k) || { key: k, sessions: 0, sets: 0, reps: 0, timed: 0, wReps: 0, wSum: 0, load: 0, top: null, phases: [], weeks: [], programs: [], focus: [], lifts: {} };
    b.sessions += 1; b.sets += s.sets; b.reps += s.reps; b.timed += s.timed; b.wReps += s.wReps; b.wSum += s.wSum; b.load += s.load;
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
    const b = map.get(k) || { key: k, sessions: 0, sets: 0, reps: 0, timed: 0, wReps: 0, wSum: 0, load: 0, top: null, phases: [], weeks: [], programs: [], focus: [], lifts: {} };
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

export const liftSummary = (lifts) => MAIN_LIFTS.filter(([k]) => lifts[k]).map(([k, l]) => {
  const L = lifts[k];
  const pct = L.lo == null ? '' : L.lo === L.hi ? ` @ ${L.lo}%` : ` @ ${L.lo}–${L.hi}%`;
  return `${l} ${L.sets}×${L.reps ? Math.round(L.reps / L.sets) : '?'}${pct}`;
});

// Completed volume from rack-tablet workout_sessions (v5.14.0): sums sets and reps
// actually logged or checked off per session_date, matched against the program day's
// blocks so exercise/movement filters and text prescriptions ("3x 8 ea") work identically.
export function completedFrom(workoutSessions = [], programs = [], { sport = 'ALL', lift = '', from = '', to = '' } = {}) {
  const dayById = new Map();
  for (const p of programs || []) {
    for (const d of p.days || []) {
      if (d?.id) dayById.set(String(d.id), { program: p, day: d });
    }
  }
  const out = [];
  for (const ws of workoutSessions || []) {
    const date = ws?.session_date;
    if (!date) continue;
    const match = dayById.get(String(ws.day_id || ''));
    const team = ws.sport || match?.program?.sport || '';
    if (sport !== 'ALL' && team !== sport) continue;
    if ((from && date < from) || (to && date > to)) continue;
    let sets = 0, reps = 0;
    const blocks = match?.day?.blocks || [];
    const wsSets = ws.sets || {};
    const wsDone = ws.done || {};
    if (blocks.length) {
      blocks.forEach((b, i) => {
        if (!b?.name) return;
        const key = mainLiftOf(b);
        if (lift && (lift.startsWith('m:') ? movementOf(b.name) !== lift.slice(2) : key !== lift)) return;
        const bid = b.id || `${match.day.id || 'day'}_${i}`;
        const pSets = prescribedSets(b);
        if (b.sets?.length) {
          b.sets.forEach((s, k) => {
            const logged = wsSets[bid]?.[k];
            const checked = wsDone[`${bid}_${k}`];
            if (logged) {
              sets += 1;
              reps += Number(logged.r) || repsOf(s.reps, b.name).reps || 0;
            } else if (checked) {
              sets += 1;
              const ro = repsOf(s.reps, b.name);
              if (!ro.timed) reps += ro.reps;
            }
          });
        } else if (wsDone[bid]) {
          for (const ps of pSets) {
            sets += 1;
            if (!ps.timed) reps += ps.reps;
          }
        }
      });
    } else if (!lift) {
      for (const bMap of Object.values(wsSets)) {
        for (const st of Object.values(bMap || {})) {
          sets += 1;
          reps += Number(st?.r) || 0;
        }
      }
      sets += Object.keys(wsDone).length;
    }
    out.push({
      ...ws,
      sport: team,
      program_name: ws.program_name || match?.program?.name || '',
      week_label: ws.week_label || match?.program?.week_label || '',
      completedSets: sets,
      completedReps: reps,
    });
  }
  return out.sort((a, b) => String(b.session_date || '').localeCompare(String(a.session_date || '')) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

export function attachCompleted(buckets = [], completedSessions = [], view = 'week') {
  const keyOf = view === 'month' ? (d) => d.slice(0, 7) : view === 'week' ? (d) => mondayOf(d) : (d) => d;
  const map = new Map();
  for (const cs of completedSessions) {
    if (!cs.session_date) continue;
    const k = keyOf(cs.session_date);
    const cur = map.get(k) || { completedSessions: 0, completedSets: 0, completedReps: 0, athletes: new Set() };
    cur.completedSessions += 1;
    cur.completedSets += cs.completedSets || 0;
    cur.completedReps += cs.completedReps || 0;
    if (cs.athlete_id) cur.athletes.add(cs.athlete_id);
    map.set(k, cur);
  }
  return buckets.map(b => {
    const c = map.get(b.key);
    const athleteCount = c ? c.athletes.size : 0;
    return {
      ...b,
      completedSessions: c ? c.completedSessions : 0,
      completedSets: c ? c.completedSets : 0,
      completedReps: c ? c.completedReps : 0,
      completedAthletes: athleteCount,
      completedSetsAvg: c && athleteCount ? Math.round((c.completedSets / athleteCount) * 10) / 10 : 0,
      completedRepsAvg: c && athleteCount ? Math.round(c.completedReps / athleteCount) : 0,
    };
  });
}

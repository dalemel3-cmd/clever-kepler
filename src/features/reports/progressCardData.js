// Data for the Athlete Progress Card (design handoff "HPD Athlete Reports" #1,
// docs/HANDOFF.md §119, §124). Pure functions. One athlete: a fixed list of metrics
// (CARD_METRICS; N/A when untested), each with its per-test-day series, PR, change since
// first test, team rank and a sparkline; plus focus areas.
import { getCentralDateString, hasWeight, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';
import { estimate1RM } from '../lifts/liftRanking';
import { TEST_TYPES } from '../analytics/testVariants';
import { gradYearFor } from '../leaderboard/printLeaderboardData';
import { displayName } from './readinessData';
import { linearFit } from '../../utils/trendLine';

export const FOCUS_PCT = 3;   // handoff: latest >= 3% below best -> focus area

// The card's fixed metric list, in print order (v5.7.4). Every one shows - "N/A" when the
// athlete hasn't tested it - unless a coach toggles it off. Lifts match the app's lift
// names (Settings) by alias; tests match a test type, optionally one technique.
export const CARD_METRICS = [
  { key: 'vj_hoh', label: 'Vertical (Hands on Hips)', kind: 'test', testType: 'vertical_jump', variant: 'hands_on_hips' },
  { key: 'vj_arm', label: 'Vertical (Arm Swing)', kind: 'test', testType: 'vertical_jump', variant: 'arm_swing' },
  { key: 'broad', label: 'Broad Jump', kind: 'test', testType: 'board_jump' },
  { key: 'fly10', label: 'Fly 10', kind: 'test', testType: '10yd_fly' },
  { key: 'bench', label: 'Bench Press', kind: 'lift', aliases: ['Bench', 'Bench Press'] },
  { key: 'hang_clean', label: 'Hang Clean', kind: 'lift', aliases: ['Hang Clean'] },
  { key: 'front_squat', label: 'Front Squat', kind: 'lift', aliases: ['Front Squat'] },
  { key: 'back_squat', label: 'Back Squat', kind: 'lift', aliases: ['Back Squat', 'Squat'] },
  { key: 'deadlift', label: 'Deadlift', kind: 'lift', aliases: ['Deadlift'] },
  { key: 'tbdl', label: 'Trap Bar Deadlift', kind: 'lift', aliases: ['Trap Bar Deadlift', 'TBDL', 'Trap Bar DL'] },
  { key: 'mass', label: 'Body Mass', kind: 'mass' },
];

const dayOf = (r) => getCentralDateString(new Date(r.created_at));
const monthOf = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short' });
const mdOf = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtSet = (l) => `${+Number(l.weight_lbs).toFixed(1)} × ${Number(l.reps)}`;

// Data rows + value accessor for one catalog metric.
function metricDef(m, { liftLogs, performanceTests }) {
  const norm = (x) => String(x || '').trim().toLowerCase();
  if (m.kind === 'lift') {
    const names = new Set(m.aliases.map(norm));
    return { ...m, unit: 'lb', decimals: 0, lowerIsBetter: false,
      rows: liftLogs.filter(l => names.has(norm(l.lift_type)) && Number(l.weight_lbs) > 0 && Number(l.reps) > 0),
      val: (l) => estimate1RM(Number(l.weight_lbs), Number(l.reps)), set: fmtSet };
  }
  const tt = TEST_TYPES.find(t => t.key === m.testType) || { unit: 'in', better: 'desc' };
  return { ...m, unit: tt.unit === 'sec' ? 's' : tt.unit, decimals: tt.unit === 'sec' ? 2 : 1, lowerIsBetter: tt.better === 'asc',
    rows: performanceTests.filter(t => t.test_type === m.testType && (!m.variant || (t.test_variant || 'untagged') === m.variant) && Number(t.metric) > 0),
    val: (t) => Number(t.metric) };
}

// Best result per athlete per day, oldest first: athleteId -> [{day, value, set}]
const seriesCache = new WeakMap();
function seriesBy(def) {
  if (seriesCache.has(def)) return seriesCache.get(def);
  const by = new Map();
  for (const r of def.rows) {
    const v = def.val(r);
    const d = dayOf(r);
    if (!by.has(r.athlete_id)) by.set(r.athlete_id, new Map());
    const m = by.get(r.athlete_id);
    const cur = m.get(d);
    if (!cur || (def.lowerIsBetter ? v < cur.value : v > cur.value)) m.set(d, { day: d, value: v, set: def.set ? def.set(r) : null });
  }
  const out = new Map();
  for (const [id, m] of by) out.set(id, [...m.values()].sort((a, b) => a.day.localeCompare(b.day)));
  seriesCache.set(def, out);
  return out;
}

const bestOf = (pts, lowerIsBetter) => pts.reduce((b, p) => (lowerIsBetter ? (p.value < b.value ? p : b) : (p.value > b.value ? p : b)), pts[0]);

// Sparkline box. The handoff's was 130x44; v5.15.0 made it 150x60 and v5.15.3 156x70, the
// widest that still leaves the longest metric name room. The card also grows the height
// (up to SPARK.growMax more) into any space left on the page. x is spread evenly with 6px
// each side. y is returned as t (0 = lowest value, 1 = highest) and drawn at the chart's
// height: from h - 8 (t = 0) up to 8 (t = 1), the baseline at h - 4 (sparkY).
export const SPARK = { w: 156, h: 70, growMax: 34 };
export const sparkY = (t, h) => +((h - 8) - t * (h - 16)).toFixed(1);
// Speed (lower is better) is drawn as raw times, so faster sits lower, with a dashed
// least-squares trend line that slopes down as the athlete gets faster (v5.15.0); the
// scale takes in the line's ends.
function spark(pts, lowerIsBetter, bestIdx, neutral) {
  const n = pts.length;
  const vs = pts.map(p => p.value);
  const fit = lowerIsBetter ? linearFit(vs) : null;
  const ends = fit ? [fit.at(0), fit.at(n - 1)] : [];
  const lo = Math.min(...vs, ...ends), hi = Math.max(...vs, ...ends);
  const x = (i) => (n > 1 ? 6 + i * ((SPARK.w - 12) / (n - 1)) : SPARK.w / 2);
  const t = (v) => +(hi > lo ? (v - lo) / (hi - lo) : 0.5).toFixed(4);
  const dots = pts.map((p, i) => {
    const isBest = !neutral && i === bestIdx;
    const isLast = i === n - 1;
    return { x: +x(i).toFixed(1), t: t(vs[i]), r: isBest ? 4.5 : isLast ? 3.5 : 2.5, kind: isBest ? 'best' : isLast ? 'last' : 'other' };
  });
  // Up to 5 evenly spaced month labels under the chart.
  const labelIdx = n <= 5 ? pts.map((_, i) => i) : [0, 1, 2, 3, 4].map(k => Math.round(k * (n - 1) / 4));
  // One label per month: skip a label that repeats the one before it.
  const months = [];
  for (const i of [...new Set(labelIdx)]) {
    const text = monthOf(pts[i].day);
    if (months.length && (months[months.length - 1].text === text || dots[i].x - months[months.length - 1].x < 24)) continue;
    months.push({ x: dots[i].x, text });
  }
  const trend = fit ? { x1: +x(0).toFixed(1), t1: t(ends[0]), x2: +x(n - 1).toFixed(1), t2: t(ends[1]) } : null;
  return { dots, months, trend };
}

const reportIndexCache = new WeakMap();
function getReportIndex(reportData) {
  if (reportIndexCache.has(reportData)) return reportIndexCache.get(reportData);
  const weighByAthlete = new Map();
  const rpeByAthlete = new Map();
  const rpeDaysBySport = new Map();
  for (const r of reportData) {
    const aId = r.athlete_id;
    if (isRpeLog(r)) {
      const d = dayOf(r);
      const s = r.sport || 'General';
      if (!rpeByAthlete.has(aId)) rpeByAthlete.set(aId, []);
      rpeByAthlete.get(aId).push(r);
      if (!rpeDaysBySport.has(s)) rpeDaysBySport.set(s, new Set());
      rpeDaysBySport.get(s).add(d);
    } else if (hasWeight(r) && !isPostPracticeLog(r)) {
      if (!weighByAthlete.has(aId)) weighByAthlete.set(aId, []);
      weighByAthlete.get(aId).push(r);
    }
  }
  const idx = { weighByAthlete, rpeByAthlete, rpeDaysBySport };
  reportIndexCache.set(reportData, idx);
  return idx;
}

export const TRAINING_DAYS = 28; // "Last 4 weeks" on the training strip

// Training strip ranges (v5.15.0). Default is every session; a coach can narrow it.
export const TRAINING_RANGES = [
  { id: 'all', label: 'All sessions' },
  { id: '4w', label: 'Last 4 weeks', days: TRAINING_DAYS },
  { id: '8w', label: 'Last 8 weeks', days: 56 },
  { id: 'season', label: 'This season' },
  { id: 'custom', label: 'Custom dates' },
];
// { start, end } Central dates (null = open) and the label printed on the card.
export function trainingBounds(id, { now = new Date(), seasonStartDate, from, to } = {}) {
  const r = TRAINING_RANGES.find(x => x.id === id) || TRAINING_RANGES[0];
  const long = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (r.days) return { start: getCentralDateString(new Date(now.getTime() - (r.days - 1) * 86400000)), end: null, text: r.label };
  if (r.id === 'season' && seasonStartDate) return { start: seasonStartDate, end: null, text: `Since ${mdOf(seasonStartDate)}` };
  if (r.id === 'custom' && (from || to)) {
    const text = from && to ? `${mdOf(from)} – ${long(to)}` : from ? `Since ${long(from)}` : `Through ${long(to)}`;
    return { start: from || null, end: to || null, text };
  }
  return { start: null, end: null, text: 'All sessions' };
}

export function buildProgressCard({ athlete, athletes = [], liftLogs = [], performanceTests = [], reportData = [], now = new Date(), showE1rm = false, hidden = {}, trainingRange = { start: null, end: null } }) {
  if (!athlete) return null;
  const { weighByAthlete, rpeByAthlete, rpeDaysBySport } = getReportIndex(reportData);
  // Rank against the whole team (same sport), not the position group.
  const peerIds = new Set(athletes.filter(a => (a.sport || 'General') === (athlete.sport || 'General')).map(a => a.id));
  const groupLabel = athlete.sport || 'team';
  const defs = CARD_METRICS.filter(m => m.kind !== 'mass' && !hidden[m.key]).map(m => metricDef(m, { liftLogs, performanceTests }));

  // Latest real weigh-in, for "x BW" on lifts.
  const myWeighs = weighByAthlete.get(athlete.id) || [];
  let lastWeigh = null;
  for (const r of myWeighs) {
    if (!lastWeigh || new Date(r.created_at) > new Date(lastWeigh.created_at)) lastWeigh = r;
  }
  const bodyWeight = lastWeigh ? Number(lastWeigh.weight_lbs) : null;

  const metrics = [];
  for (const def of defs) {
    const all = seriesBy(def);
    const pts = all.get(athlete.id);
    if (!pts?.length) { metrics.push({ key: def.key, kind: def.kind, label: def.label, unit: def.unit, na: true, tests: 0 }); continue; }
    const best = bestOf(pts, def.lowerIsBetter);
    const bestIdx = pts.indexOf(best);
    const latest = pts[pts.length - 1];
    // PR = the best is the latest test, strictly better than every earlier one.
    const isPR = pts.length > 1 && bestIdx === pts.length - 1 && pts.slice(0, -1).every(p => (def.lowerIsBetter ? p.value > latest.value : p.value < latest.value));
    const d = latest.value - pts[0].value;
    const better = def.lowerIsBetter ? d < 0 : d > 0;
    const dp = def.decimals;
    // Rank among the position group (or sport) by each athlete's best.
    const groupBests = [...all].filter(([id]) => peerIds.has(id)).map(([id, s]) => ({ id, v: bestOf(s, def.lowerIsBetter).value }))
      .sort((a, b) => (def.lowerIsBetter ? a.v - b.v : b.v - a.v));
    const rank = groupBests.findIndex(g => g.id === athlete.id) + 1;
    const offBest = (def.lowerIsBetter ? latest.value / best.value - 1 : 1 - latest.value / best.value) * 100;
    metrics.push({
      key: def.key, kind: def.kind, label: def.label, unit: def.unit, lowerIsBetter: def.lowerIsBetter,
      tests: pts.length, firstDay: pts[0].day, lastDay: latest.day,
      latestText: def.kind === 'lift' ? latest.set : latest.value.toFixed(dp),
      latestE1rm: def.kind === 'lift' ? Math.round(latest.value) : null, bestE1rm: def.kind === 'lift' ? Math.round(best.value) : null, showE1rm,
      latestDay: latest.day, latestIsBest: bestIdx === pts.length - 1,
      isPR,
      delta: pts.length < 2 || +d.toFixed(dp) === 0 ? null : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(dp)} ${def.unit}${def.kind === 'lift' ? ' est.' : ''}`,
      deltaTone: pts.length < 2 ? 'flat' : better ? 'up' : 'down',
      since: monthOf(pts[0].day),
      rank, rankN: groupBests.length, rankText: groupBests.length > 1 ? `#${rank} of ${groupBests.length} ${groupLabel}` : '',
      bestText: def.kind === 'lift' ? best.set : best.value.toFixed(dp), bestDay: best.day, offBest,
      xbw: def.kind === 'lift' && bodyWeight > 0 ? `${(best.value / bodyWeight).toFixed(2)}× BW` : null,
      ...spark(pts, def.lowerIsBetter, bestIdx, false),
    });
  }
  const shown = metrics.filter(m => !m.na);

  // Body mass: real weigh-ins only, one per day (latest of the day). Neutral color, no PR.
  const wByDay = new Map();
  for (const r of myWeighs) {
    const d = dayOf(r);
    const cur = wByDay.get(d);
    if (!cur || new Date(r.created_at) > new Date(cur.at)) wByDay.set(d, { day: d, value: Number(r.weight_lbs), at: r.created_at });
  }
  const wPts = [...wByDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  // Thin daily weigh-ins to at most ~12 points so the sparkline stays readable.
  const step = Math.max(1, Math.ceil(wPts.length / 12));
  const wSpark = wPts.filter((_, i) => i % step === 0 || i === wPts.length - 1);
  let mass = null;
  if (wPts.length) {
    const d = wPts[wPts.length - 1].value - wPts[0].value;
    mass = {
      key: 'mass', kind: 'mass', label: 'Body Mass', unit: 'lb', tests: wPts.length, latestText: wPts[wPts.length - 1].value.toFixed(1), bestText: wPts[wPts.length - 1].value.toFixed(1), latestIsBest: true, isPR: false,
      delta: wPts.length < 2 || +d.toFixed(1) === 0 ? null : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} lb`, deltaTone: 'neutral', since: monthOf(wPts[0].day), rankText: '',
      firstDay: wPts[0].day, lastDay: wPts[wPts.length - 1].day,
      ...spark(wSpark, false, -1, true),
    };
  }
  const massRow = hidden.mass ? null : (mass || { key: 'mass', kind: 'mass', label: 'Body Mass', unit: 'lb', na: true, tests: 0 });
  const cardMetrics = massRow ? [...metrics, massRow] : metrics;

  const focus = shown.filter(m => m.tests > 1 && m.offBest >= FOCUS_PCT).sort((a, b) => b.offBest - a.offBest).slice(0, 2)
    .map(m => ({ label: m.label, note: `Latest ${m.latestText} ${m.unit}, ${m.offBest.toFixed(1)}% below your best of ${m.bestText} (${mdOf(m.bestDay)}). Retest after the next block.` }));

  const days = cardMetrics.flatMap(m => [m.firstDay, m.lastDay]).filter(Boolean).sort();
  const span = days.length ? (() => {
    const a = days[0], b = days[days.length - 1];
    const ya = a.slice(0, 4), yb = b.slice(0, 4);
    return ya === yb ? `${monthOf(a)}${monthOf(a) !== monthOf(b) ? `–${monthOf(b)}` : ''} ${yb}` : `${monthOf(a)} ${ya}–${monthOf(b)} ${yb}`;
  })() : '';

  // Training strip: session RPE in the chosen range (every session unless a range is
  // picked, v5.15.0). "Logged" = days this athlete logged an RPE out of the days anyone on
  // their team did (the team's session days) in the same range.
  const { start: tStart, end: tEnd } = trainingRange || {};
  const inRange = (d) => (!tStart || d >= tStart) && (!tEnd || d <= tEnd);
  const sportKey = athlete.sport || 'General';
  const myRpe = (rpeByAthlete.get(athlete.id) || []).filter(r => inRange(dayOf(r)));
  const sportRpeDays = rpeDaysBySport.get(sportKey) || new Set();
  let teamDaysCount = 0;
  for (const d of sportRpeDays) {
    if (inRange(d)) teamDaysCount++;
  }
  const myDays = new Set(myRpe.map(dayOf));
  const sortedDays = [...myDays].sort();
  const training = {
    sessions: myRpe.length,
    avgRpe: myRpe.length ? myRpe.reduce((t, r) => t + Number(r.rpe), 0) / myRpe.length : null,
    loggedDays: myDays.size,
    teamDays: teamDaysCount,
    rate: teamDaysCount ? Math.round((myDays.size / teamDaysCount) * 100) : null,
    first: sortedDays.length ? mdOf(sortedDays[0]) : null,
    last: sortedDays.length ? mdOf(sortedDays[sortedDays.length - 1]) : null,
  };

  return {
    training, bodyWeight,
    name: displayName(athlete.name), sport: athlete.sport || '', pos: athlete.position || '', classYear: gradYearFor(athlete.grade, now),
    span, groupLabel,
    metrics: cardMetrics, focus,
  };
}

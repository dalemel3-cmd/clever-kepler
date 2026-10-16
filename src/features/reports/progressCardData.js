// Data for the Athlete Progress Card (design handoff "HPD Athlete Reports" #1,
// docs/HANDOFF.md §119, §124). Pure functions. One athlete: a fixed list of metrics
// (CARD_METRICS; N/A when untested), each with its per-test-day series, PR, change since
// first test, team rank and a sparkline; plus focus areas.
import { getCentralDateString, hasWeight, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';
import { estimate1RM } from '../lifts/liftRanking';
import { TEST_TYPES } from '../analytics/testVariants';
import { gradYearFor } from '../leaderboard/printLeaderboardData';
import { displayName } from './readinessData';

export const FOCUS_PCT = 3;   // handoff: latest >= 3% below best -> focus area
export const TOP_RANK = 5;    // "Top 5 in {team}"

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
function seriesBy(def) {
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
  return out;
}

const bestOf = (pts, lowerIsBetter) => pts.reduce((b, p) => (lowerIsBetter ? (p.value < b.value ? p : b) : (p.value > b.value ? p : b)), pts[0]);

// Handoff sparkline: 130x44, x spread evenly, y = 36 - norm*30, negated when lower is better.
function spark(pts, lowerIsBetter, bestIdx, neutral) {
  const n = pts.length;
  const vs = pts.map(p => (lowerIsBetter ? -p.value : p.value));
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (i) => (n > 1 ? 6 + i * (118 / (n - 1)) : 65);
  const y = (v) => (hi > lo ? 36 - ((v - lo) / (hi - lo)) * 30 : 21);
  const dots = pts.map((p, i) => {
    const isBest = !neutral && i === bestIdx;
    const isLast = i === n - 1;
    return { x: +x(i).toFixed(1), y: +y(vs[i]).toFixed(1), r: isBest ? 4.5 : isLast ? 3.5 : 2.5, kind: isBest ? 'best' : isLast ? 'last' : 'other' };
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
  return { pts: dots.map(d => `${d.x},${d.y}`).join(' '), dots, months };
}

export const TRAINING_DAYS = 28; // training strip window

export function buildProgressCard({ athlete, athletes = [], liftLogs = [], performanceTests = [], reportData = [], now = new Date(), showE1rm = false, hidden = {} }) {
  if (!athlete) return null;
  // Rank against the whole team (same sport), not the position group.
  const peerIds = new Set(athletes.filter(a => (a.sport || 'General') === (athlete.sport || 'General')).map(a => a.id));
  const groupLabel = athlete.sport || 'team';
  const defs = CARD_METRICS.filter(m => m.kind !== 'mass' && !hidden[m.key]).map(m => metricDef(m, { liftLogs, performanceTests }));

  // Latest real weigh-in, for "x BW" on lifts.
  const lastWeigh = reportData.filter(r => r.athlete_id === athlete.id && hasWeight(r) && !isPostPracticeLog(r) && !isRpeLog(r))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
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
  for (const r of reportData) {
    if (r.athlete_id !== athlete.id || !hasWeight(r) || isPostPracticeLog(r) || isRpeLog(r)) continue;
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

  const scored = shown.filter(m => m.tests > 1);
  const focus = shown.filter(m => m.tests > 1 && m.offBest >= FOCUS_PCT).sort((a, b) => b.offBest - a.offBest).slice(0, 2)
    .map(m => ({ label: m.label, note: `Latest ${m.latestText} ${m.unit}, ${m.offBest.toFixed(1)}% below your best of ${m.bestText} (${mdOf(m.bestDay)}). Retest after the next block.` }));

  const days = cardMetrics.flatMap(m => [m.firstDay, m.lastDay]).filter(Boolean).sort();
  const span = days.length ? (() => {
    const a = days[0], b = days[days.length - 1];
    const ya = a.slice(0, 4), yb = b.slice(0, 4);
    return ya === yb ? `${monthOf(a)}${monthOf(a) !== monthOf(b) ? `–${monthOf(b)}` : ''} ${yb}` : `${monthOf(a)} ${ya}–${monthOf(b)} ${yb}`;
  })() : '';
  const firstMonth = days.length ? monthOf(days[0]) : '';

  // Training strip: last 4 weeks of session RPE. "Logged" = days this athlete logged an
  // RPE out of the days anyone on their team did (the team's session days).
  const cutoff = getCentralDateString(new Date(now.getTime() - (TRAINING_DAYS - 1) * 86400000));
  const teamIds = new Set(athletes.filter(a => (a.sport || 'General') === (athlete.sport || 'General')).map(a => a.id));
  const rpeIn = reportData.filter(r => isRpeLog(r) && dayOf(r) >= cutoff);
  const mine = rpeIn.filter(r => r.athlete_id === athlete.id);
  const teamDays = new Set(rpeIn.filter(r => teamIds.has(r.athlete_id)).map(dayOf));
  const myDays = new Set(mine.map(dayOf));
  const training = {
    sessions: mine.length,
    avgRpe: mine.length ? mine.reduce((t, r) => t + Number(r.rpe), 0) / mine.length : null,
    loggedDays: myDays.size, teamDays: teamDays.size,
    rate: teamDays.size ? Math.round((myDays.size / teamDays.size) * 100) : null,
    last: mine.length ? mdOf(mine.map(dayOf).sort().pop()) : null,
  };

  return {
    training, bodyWeight,
    name: displayName(athlete.name), sport: athlete.sport || '', pos: athlete.position || '', classYear: gradYearFor(athlete.grade, now),
    span, firstMonth, groupLabel,
    tiles: {
      prs: shown.filter(m => m.isPR).length,
      improved: scored.filter(m => m.deltaTone === 'up').length, scored: scored.length,
      top: shown.filter(m => m.rankN > 1 && m.rank <= TOP_RANK).length,
    },
    metrics: cardMetrics, focus,
  };
}

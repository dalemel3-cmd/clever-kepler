// Data for the Athlete Progress Card (design handoff "HPD Athlete Reports" #1,
// docs/HANDOFF.md §119). Pure functions. One athlete: every metric they have results
// for (lifts, jumps/sprints, body mass), each with its per-test-day series, PR, change
// since first test, position-group rank and a sparkline; plus focus areas.
import { getCentralDateString, hasWeight, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';
import { estimate1RM } from '../lifts/liftRanking';
import { TEST_TYPES, VARIANT_LABEL, UNTAGGED_VARIANT_LABEL } from '../analytics/testVariants';
import { gradYearFor } from '../leaderboard/printLeaderboardData';
import { displayName } from './readinessData';

export const MAX_METRICS = 8;
export const FOCUS_PCT = 3;   // handoff: latest >= 3% below best -> focus area
export const TOP_RANK = 5;    // handoff: "Top 5 in {Pos}"

const dayOf = (r) => getCentralDateString(new Date(r.created_at));
const monthOf = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short' });
const mdOf = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtSet = (l) => `${+Number(l.weight_lbs).toFixed(1)} × ${Number(l.reps)}`;

// Every metric definition with a per-athlete accessor that returns day -> {value, set?}.
function metricDefs({ liftTypes, liftLogs, performanceTests }) {
  const defs = [];
  const liftsWithData = new Set(liftLogs.map(l => l.lift_type));
  for (const lift of liftTypes) {
    if (!liftsWithData.has(lift)) continue;
    defs.push({ key: `lift:${lift}`, kind: 'lift', label: lift, unit: 'lb', decimals: 0, lowerIsBetter: false,
      rows: liftLogs.filter(l => l.lift_type === lift && Number(l.weight_lbs) > 0 && Number(l.reps) > 0),
      val: (l) => estimate1RM(Number(l.weight_lbs), Number(l.reps)), set: fmtSet });
  }
  for (const tt of TEST_TYPES) {
    const variants = [...new Set(performanceTests.filter(t => t.test_type === tt.key).map(t => t.test_variant || 'untagged'))];
    for (const v of variants) {
      const vName = v === 'untagged' ? UNTAGGED_VARIANT_LABEL : (VARIANT_LABEL[v] || v);
      defs.push({ key: `test:${tt.key}:${v}`, kind: 'test',
        label: tt.variants.length > 1 || v === 'untagged' ? `${tt.label} · ${vName}` : tt.label,
        unit: tt.unit === 'sec' ? 's' : tt.unit, decimals: tt.unit === 'sec' ? 2 : 1, lowerIsBetter: tt.better === 'asc',
        rows: performanceTests.filter(t => t.test_type === tt.key && (t.test_variant || 'untagged') === v && Number(t.metric) > 0),
        val: (t) => Number(t.metric) });
    }
  }
  return defs;
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
    if (months.length && months[months.length - 1].text === text) continue;
    months.push({ x: dots[i].x, text });
  }
  return { pts: dots.map(d => `${d.x},${d.y}`).join(' '), dots, months };
}

export function buildProgressCard({ athlete, athletes = [], liftLogs = [], performanceTests = [], reportData = [], settings = {}, now = new Date(), showE1rm = false }) {
  if (!athlete) return null;
  const liftTypes = settings.liftTypes?.length ? settings.liftTypes : ['Bench', 'Squat', 'Deadlift', 'Hang Clean', 'Power Clean'];
  const peers = athletes.filter(a => (a.sport || 'General') === (athlete.sport || 'General') && (!athlete.position || a.position === athlete.position));
  const peerIds = new Set(peers.map(a => a.id));
  const groupLabel = athlete.position || athlete.sport || 'team';
  const defs = metricDefs({ liftTypes, liftLogs, performanceTests });

  const metrics = [];
  for (const def of defs) {
    const all = seriesBy(def);
    const pts = all.get(athlete.id);
    if (!pts?.length) continue;
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
      latestE1rm: def.kind === 'lift' ? Math.round(latest.value) : null, showE1rm,
      isPR,
      delta: pts.length < 2 || +d.toFixed(dp) === 0 ? null : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(dp)} ${def.unit}${def.kind === 'lift' ? ' est.' : ''}`,
      deltaTone: pts.length < 2 ? 'flat' : better ? 'up' : 'down',
      since: monthOf(pts[0].day),
      rank, rankN: groupBests.length, rankText: groupBests.length > 1 ? `#${rank} of ${groupBests.length} ${groupLabel}` : '',
      bestText: def.kind === 'lift' ? best.set : best.value.toFixed(dp), bestDay: best.day, offBest,
      ...spark(pts, def.lowerIsBetter, bestIdx, false),
    });
  }
  // Order: most-tested first so the card leads with what the athlete actually does.
  metrics.sort((a, b) => b.tests - a.tests || a.label.localeCompare(b.label));
  const shown = metrics.slice(0, MAX_METRICS - 1);

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
      key: 'mass', kind: 'mass', label: 'Body Mass', unit: 'lb', tests: wPts.length, latestText: wPts[wPts.length - 1].value.toFixed(1), isPR: false,
      delta: wPts.length < 2 || +d.toFixed(1) === 0 ? null : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} lb`, deltaTone: 'neutral', since: monthOf(wPts[0].day), rankText: '',
      firstDay: wPts[0].day, lastDay: wPts[wPts.length - 1].day,
      ...spark(wSpark, false, -1, true),
    };
  }
  const cardMetrics = mass ? [...shown, mass] : shown;

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

  return {
    name: displayName(athlete.name), sport: athlete.sport || '', pos: athlete.position || '', classYear: gradYearFor(athlete.grade, now),
    span, firstMonth, groupLabel,
    tiles: {
      prs: shown.filter(m => m.isPR).length,
      improved: scored.filter(m => m.deltaTone === 'up').length, scored: scored.length,
      top: shown.filter(m => m.rankN > 1 && m.rank <= TOP_RANK).length,
    },
    metrics: cardMetrics, focus, hiddenCount: Math.max(0, metrics.length - shown.length),
  };
}

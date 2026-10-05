// Data for the printable metric leaderboard (design handoff "HPD Metric Leaderboard",
// docs/HANDOFF.md §106). Pure functions, no React. Ranking follows the handoff:
// best result per athlete in the period (max, or min when lower is better), ties broken
// by most recent test then name; Top 10 on page 1, then 22 per continuation page.
import { estimate1RM, inBounds } from '../lifts/liftRanking';
import { getCentralDateString } from '../../utils/athleteData';
import { TEST_TYPES, VARIANT_LABEL, UNTAGGED_VARIANT_LABEL } from '../analytics/testVariants';

export const TOP_N = 10;
export const PER_PAGE = 22;

// Every metric the app has data for: one per lift type (est. 1RM, the number the Lift
// Tracker ranks by) and one per Speed & Power test *and technique* - an arm-swing and a
// hands-on-hips vertical are different tests and never share a board.
export function availableMetrics({ liftTypes = [], liftLogs = [], performanceTests = [] }) {
  const out = [];
  const liftsWithData = new Set((liftLogs || []).map(l => l.lift_type));
  for (const lift of liftTypes) {
    if (!liftsWithData.has(lift)) continue;
    out.push({ key: `lift:${lift}`, kind: 'lift', lift, title: lift, measure: 'Est. 1RM', unit: 'lb', decimals: 0, lowerIsBetter: false });
  }
  for (const tt of TEST_TYPES) {
    const variants = [...new Set((performanceTests || []).filter(t => t.test_type === tt.key).map(t => t.test_variant || 'untagged'))];
    for (const v of variants) {
      const vName = v === 'untagged' ? UNTAGGED_VARIANT_LABEL : (VARIANT_LABEL[v] || v);
      out.push({
        key: `test:${tt.key}:${v}`, kind: 'test', testType: tt.key, variant: v,
        title: tt.label,
        measure: tt.variants.length > 1 || v === 'untagged' ? vName : (tt.unit === 'sec' ? 'Time' : 'Result'),
        unit: tt.unit === 'sec' ? 's' : tt.unit,
        decimals: tt.unit === 'sec' ? 2 : 1,
        lowerIsBetter: tt.better === 'asc',
      });
    }
  }
  return out;
}

// "11th" -> graduating class year. The school year rolls over in August, so in
// Oct 2026 a senior (12th) is the Class of 2027.
export function gradYearFor(grade, now = new Date()) {
  const g = parseInt(String(grade || '').replace(/\D/g, ''), 10);
  if (!(g >= 6 && g <= 12)) return '';
  const seniorYear = now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
  return String(seniorYear + (12 - g));
}

const fmtSigned = (d, decimals) => (d > 0 ? '+' : '−') + Math.abs(d).toFixed(decimals);

// One result per athlete per test day (their best that day), oldest first.
function sessionsFor(metric, athleteIds, { liftLogs, performanceTests, bounds }) {
  const byAthlete = new Map();
  const add = (athleteId, day, value) => {
    if (!byAthlete.has(athleteId)) byAthlete.set(athleteId, new Map());
    const m = byAthlete.get(athleteId);
    const cur = m.get(day);
    const better = cur == null || (metric.lowerIsBetter ? value < cur : value > cur);
    if (better) m.set(day, value);
  };
  if (metric.kind === 'lift') {
    for (const l of liftLogs || []) {
      if (l.lift_type !== metric.lift || !athleteIds.has(l.athlete_id) || !inBounds(l, bounds)) continue;
      const v = estimate1RM(Number(l.weight_lbs), Number(l.reps));
      if (v > 0) add(l.athlete_id, getCentralDateString(new Date(l.created_at)), Math.round(v));
    }
  } else {
    for (const t of performanceTests || []) {
      if (t.test_type !== metric.testType || (t.test_variant || 'untagged') !== metric.variant) continue;
      if (!athleteIds.has(t.athlete_id) || !inBounds(t, bounds)) continue;
      const v = Number(t.metric);
      if (v > 0) add(t.athlete_id, getCentralDateString(new Date(t.created_at)), v);
    }
  }
  return byAthlete;
}

// Sparkline points in the handoff's 128x36 viewBox. x is fixed per test-day slot
// across the whole team (a later starter begins further right); y is scaled to the
// athlete's own range, inverted when lower is better so "up" always means improvement.
function sparkline(points, slotIndex, slotCount, lowerIsBetter) {
  const vs = points.map(p => p.value);
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo;
  const xy = points.map(p => {
    let t = span ? (p.value - lo) / span : 0.5;
    if (lowerIsBetter) t = 1 - t;
    const i = slotIndex.get(p.day);
    const x = slotCount > 1 ? (i / (slotCount - 1)) * 124 + 2 : 64;
    return [+x.toFixed(1), +(32 - t * 28).toFixed(1)];
  });
  const last = xy[xy.length - 1];
  return { pts: xy.map(p => p.join(',')).join(' '), cx: last[0], cy: last[1] };
}

export function buildPrintLeaderboard({ metric, athletes = [], liftLogs = [], performanceTests = [], bounds = {}, sport = 'ALL', fullRoster = true, now = new Date() }) {
  if (!metric) return { rows: [], top: [], pages: [], total: 0, testSpan: '' };
  const roster = sport === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === sport);
  const byId = new Map(roster.map(a => [a.id, a]));
  const sessions = sessionsFor(metric, new Set(byId.keys()), { liftLogs, performanceTests, bounds });

  const allDays = [...new Set([...sessions.values()].flatMap(m => [...m.keys()]))].sort();
  const slotIndex = new Map(allDays.map((d, i) => [d, i]));

  const list = [];
  for (const [athleteId, days] of sessions) {
    const points = [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, value]) => ({ day, value }));
    if (!points.length) continue;
    const best = points.reduce((b, p) => (metric.lowerIsBetter ? Math.min(b, p.value) : Math.max(b, p.value)), points[0].value);
    list.push({ athlete: byId.get(athleteId), points, best, lastDay: points[points.length - 1].day });
  }
  list.sort((x, y) => (metric.lowerIsBetter ? x.best - y.best : y.best - x.best)
    || y.lastDay.localeCompare(x.lastDay)
    || (x.athlete.name || '').localeCompare(y.athlete.name || ''));

  const rows = list.map(({ athlete, points, best }, k) => {
    const first = points[0].value, latest = points[points.length - 1].value;
    const d = +(latest - first).toFixed(metric.decimals);
    const improved = metric.lowerIsBetter ? d < 0 : d > 0;
    const flat = points.length < 2 || d === 0;
    return {
      id: athlete.id,
      rank: k + 1,
      name: athlete.name,
      pos: athlete.position || '',
      grad: gradYearFor(athlete.grade, now),
      value: best.toFixed(metric.decimals),
      change: flat ? '—' : fmtSigned(d, metric.decimals),
      changeTone: flat ? 'flat' : improved ? 'up' : 'down',
      ...sparkline(points, slotIndex, allDays.length, metric.lowerIsBetter),
    };
  });

  const rest = fullRoster ? rows.slice(TOP_N) : [];
  const pages = [];
  for (let i = 0; i < rest.length; i += PER_PAGE) {
    const chunk = rest.slice(i, i + PER_PAGE);
    pages.push({ rows: chunk, from: chunk[0].rank, to: chunk[chunk.length - 1].rank, n: pages.length + 2 });
  }

  const monthOf = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { month: 'short' });
  const testSpan = allDays.length ? (monthOf(allDays[0]) === monthOf(allDays[allDays.length - 1]) ? monthOf(allDays[0]) : `${monthOf(allDays[0])}–${monthOf(allDays[allDays.length - 1])}`) : '';

  return { rows, top: rows.slice(0, TOP_N), pages, pageCount: pages.length + 1, total: rows.length, testSpan };
}

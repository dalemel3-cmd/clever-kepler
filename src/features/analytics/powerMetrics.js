// Per-athlete jump / sprint metrics for the Performance > Jumps & Sprints deep-dive tab.
// Pure functions (no React). "Better" follows TEST_TYPES: lower is better for sprint
// times ('asc'), higher for jumps ('desc'), the same rule the Speed & Power leaderboard
// and the Profile PBs use, so a PB here is always the PB shown everywhere else.
import { TEST_TYPE_BY_KEY } from './testVariants';

const DAY = 86400000;
const t = (r) => new Date(r.created_at).getTime();
export const variantOf = (r) => r.test_variant || 'untagged';
export const isAsc = (testKey) => (TEST_TYPE_BY_KEY[testKey]?.better || 'asc') === 'asc';
// a beats b?
const beats = (asc, a, b) => (asc ? a < b : a > b);

// Relative improvement of `now` over `then`, positive = better regardless of direction.
export const improvement = (asc, now, then) => (then ? (asc ? (then - now) / then : (now - then) / then) : null);

// Variants actually present for a test type, most rows first (so the default pick is
// the protocol most of the roster was tested under).
export function variantsFor(tests, testKey) {
  const counts = new Map();
  for (const r of (tests || [])) if (r.test_type === testKey) counts.set(variantOf(r), (counts.get(variantOf(r)) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, count: n }));
}

// Chronological PB history: every result that beat the athlete's previous best.
export function pbHistory(results, asc) {
  const sorted = [...results].sort((a, b) => t(a) - t(b));
  const out = [];
  let best = null;
  for (const r of sorted) {
    const v = Number(r.metric);
    if (best == null || beats(asc, v, best)) { best = v; out.push(r); }
  }
  return out;
}

// One row per athlete tested on testKey/variant. The PB uses full history; the
// window drives "tests in window" and the change figure.
export function buildPowerRows(athletes, tests, { testKey, variant, windowWeeks = 26, now = Date.now() }) {
  const asc = isAsc(testKey);
  const byAthlete = new Map();
  for (const r of (tests || [])) {
    if (r.test_type !== testKey || variantOf(r) !== variant || !(Number(r.metric) > 0)) continue;
    if (!byAthlete.has(r.athlete_id)) byAthlete.set(r.athlete_id, []);
    byAthlete.get(r.athlete_id).push(r);
  }
  const cutoff = now - windowWeeks * 7 * DAY;
  const rows = [];
  for (const a of athletes) {
    const all = byAthlete.get(a.id);
    if (!all || !all.length) continue;
    const sorted = [...all].sort((x, y) => t(x) - t(y));
    const pbs = pbHistory(sorted, asc);
    const pb = pbs[pbs.length - 1];
    const latest = sorted[sorted.length - 1];
    const inWindow = sorted.filter(r => t(r) >= cutoff);
    const first = inWindow[0];
    const windowVals = inWindow.map(r => Number(r.metric));
    const windowBest = windowVals.length ? (asc ? Math.min(...windowVals) : Math.max(...windowVals)) : null;
    const testDays = new Set(sorted.map(r => r.created_at.slice(0, 10)));
    rows.push({
      athlete: a,
      pb: Number(pb.metric),
      pbResult: pb,
      pbDaysAgo: Math.floor((now - t(pb)) / DAY),
      pbsInWindow: pbs.filter(r => t(r) >= cutoff).length,
      latest: Number(latest.metric),
      latestResult: latest,
      daysSince: Math.floor((now - t(latest)) / DAY),
      // Latest vs PB, positive = off the PB by that much.
      offPb: (asc ? Number(latest.metric) - Number(pb.metric) : Number(pb.metric) - Number(latest.metric)) / Number(pb.metric),
      // First result in the window vs the best in the window, positive = improved.
      change: inWindow.length > 1 ? improvement(asc, windowBest, Number(first.metric)) : null,
      testsInWindow: inWindow.length,
      tests: sorted.length,
      testDays: testDays.size,
      recent: sorted.slice(-8).map(r => Number(r.metric)),
      results: sorted,
      pbs,
    });
  }
  // Rank within the rows given (i.e. the filtered group) and vs the sport's average PB.
  const ranked = [...rows].sort((x, y) => (asc ? x.pb - y.pb : y.pb - x.pb));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  const sportAvg = new Map();
  for (const r of rows) {
    const k = r.athlete.sport || 'General';
    const cur = sportAvg.get(k) || { s: 0, n: 0 };
    cur.s += r.pb; cur.n += 1; sportAvg.set(k, cur);
  }
  for (const r of rows) {
    const g = sportAvg.get(r.athlete.sport || 'General');
    r.vsSport = g.n > 1 ? improvement(asc, r.pb, g.s / g.n) : null;
  }
  return rows;
}

// Status chips, most important first. A sprint is judged tighter than a jump: 3% off a
// fly time is a lot, 5% off a vertical is a normal off day.
export function powerFlags(row, testKey) {
  const f = [];
  const tol = isAsc(testKey) ? 0.03 : 0.05;
  if (row.pbDaysAgo <= 14) f.push({ key: 'pb', label: 'New PB', tone: 'ok' });
  else if (row.offPb != null && row.offPb > tol) f.push({ key: 'down', label: `${Math.round(row.offPb * 100)}% off PB`, tone: 'bad' });
  if (row.daysSince >= 42) f.push({ key: 'quiet', label: `Not tested in ${Math.round(row.daysSince / 7)} wk`, tone: 'muted' });
  return f;
}

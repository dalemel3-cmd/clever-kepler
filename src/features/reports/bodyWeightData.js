// Data for the Body Weight report (v5.9.0, docs/HANDOFF.md §133). Pure functions.
// For the last 7 / 14 / 28 days: each athlete's first and latest weigh-in in the period,
// the change between them, where they sit against their baseline, the low/high, and the
// day-by-day series for the trend line. Post-practice and RPE-only rows are left out
// (same rule as the Readiness Report); the weigh-in CSV keeps post-practice rows, labeled.
import { getAthleteBaseline, getCentralDateString, getCentralTimeString, hasWeight, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';
import { displayName } from './readinessData';

export const BW_PERIODS = [7, 14, 28];
export const BW_SORTS = [['name', 'Name'], ['change', 'Biggest loss in period'], ['base', 'Furthest below baseline']];

const isRealWeighIn = (r) => hasWeight(r) && !isPostPracticeLog(r) && !isRpeLog(r);
const dayOf = (r) => getCentralDateString(new Date(r.created_at));
// Calendar-day arithmetic on "YYYY-MM-DD" (no DST surprises).
export const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);

export function buildBodyWeightReport({ athletes = [], reportData = [], settings = {}, sport = 'ALL', days = 7, sort = 'name', now = Date.now() }) {
  const to = getCentralDateString(new Date(now));
  const from = addDays(to, -(days - 1));
  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));
  const threshold = Number(settings.dehydrationThreshold) || 2;
  const roster = sport === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === sport);
  const ids = new Set(roster.map(a => a.id));

  const logsBy = new Map();
  for (const r of reportData) {
    if (!ids.has(r.athlete_id) || !hasWeight(r) || !r.created_at) continue;
    if (!logsBy.has(r.athlete_id)) logsBy.set(r.athlete_id, []);
    logsBy.get(r.athlete_id).push(r);
  }

  const rows = [];
  const missing = [];
  const weighIns = [];   // every weigh-in in the period, for the CSV
  for (const a of roster) {
    const logs = (logsBy.get(a.id) || []).slice().sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
    const base = getAthleteBaseline(a, reportData);
    const baseW = base && Number(base.weight_lbs) > 0 ? Number(base.weight_lbs) : null;
    const name = displayName(a.name);
    // One value per day: the day's last real weigh-in (a re-weigh replaces the first).
    const byDay = new Map();
    for (const r of logs) {
      const d = dayOf(r);
      if (d < from || d > to) continue;
      const post = isPostPracticeLog(r);
      if (!isRpeLog(r)) weighIns.push({ day: d, time: getCentralTimeString(new Date(r.created_at)), name, sport: a.sport || '', pos: a.position || '', w: Number(r.weight_lbs), type: post ? 'Post-practice' : 'Weigh-in', baseW });
      if (isRealWeighIn(r)) byDay.set(d, Number(r.weight_lbs));
    }
    const series = [...byDay.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([day, w]) => ({ day, w }));
    if (!series.length) {
      const last = logs.filter(isRealWeighIn).pop();
      missing.push({ id: a.id, name, sport: a.sport || '', daysAgo: last ? daysBetween(dayOf(last), to) : null });
      continue;
    }
    const start = series[0], latest = series[series.length - 1];
    const ws = series.map(p => p.w);
    const change = series.length > 1 ? latest.w - start.w : null;
    const vsBase = baseW != null ? latest.w - baseW : null;
    rows.push({
      id: a.id, name, sport: a.sport || '', pos: a.position || '',
      baseW, start, latest, series, count: series.length,
      change, changePct: change != null ? (change / start.w) * 100 : null,
      vsBase, vsBasePct: vsBase != null ? (vsBase / baseW) * 100 : null,
      low: Math.min(...ws), high: Math.max(...ws), avg: ws.reduce((s, w) => s + w, 0) / ws.length,
      // Same rule as the Readiness Report's mass-drop list: more than the threshold below baseline.
      belowBase: vsBase != null && -vsBase > threshold,
      bigLoss: change != null && -change > threshold,
    });
  }

  const byName = (x, y) => x.name.localeCompare(y.name);
  const bySportName = (x, y) => (sport === 'ALL' ? (x.sport || '').localeCompare(y.sport || '') : 0) || byName(x, y);
  if (sort === 'change') rows.sort((x, y) => (x.change ?? Infinity) - (y.change ?? Infinity) || byName(x, y));
  else if (sort === 'base') rows.sort((x, y) => (x.vsBasePct ?? Infinity) - (y.vsBasePct ?? Infinity) || byName(x, y));
  else rows.sort(bySportName);
  missing.sort(bySportName);
  weighIns.sort((x, y) => x.day.localeCompare(y.day) || x.time.localeCompare(y.time) || x.name.localeCompare(y.name));

  const changed = rows.filter(r => r.change != null);
  return {
    days, from, to, dayList, rows, missing, weighIns,
    rosterCount: roster.length,
    belowBaseCount: rows.filter(r => r.belowBase).length,
    avgChange: changed.length ? changed.reduce((s, r) => s + r.change, 0) / changed.length : null,
    changedCount: changed.length,
    threshold,
  };
}

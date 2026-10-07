// Data for the Performance vs Readiness printout (docs/HANDOFF.md §114). Pure functions.
// Puts a jump/sprint result next to the two things staff can act on: body weight vs the
// athlete's baseline, and the training load they carried into the test. Lifts are left
// out on purpose - only metrics that can lead to an intervention.
import { centralWallTimeToISO, computeAcuteChronicLoad, getAthleteBaseline, getCentralDateString, hasWeight, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';
import { availableMetrics } from '../leaderboard/printLeaderboardData';
import { displayName } from './readinessData';

const DAY = 86400000;
// Flag = jump/sprint at least DROP_PCT off the athlete's best mark AND body weight at
// least WEIGHT_PCT below baseline. Both are editable on the printout (v5.5.1).
export const DROP_PCT = 11;
export const WEIGHT_PCT = 2;
export const SPIKE_AT = 1.5;    // A:C going into the test - highlighted, not part of the flag
export const WEIGH_IN_LOOKBACK = 3; // days a weigh-in can precede the test and still count

export const perfMetrics = (performanceTests) => availableMetrics({ performanceTests }).filter(m => m.kind === 'test');

const isRealWeighIn = (r) => hasWeight(r) && !isPostPracticeLog(r) && !isRpeLog(r);
const dayOf = (r) => getCentralDateString(new Date(r.created_at));
// Midnight Central at the start of a calendar day: "before the test" cut-off.
const dayStart = (day) => new Date(centralWallTimeToISO(day, '00:00')).getTime();

// Best result per athlete per day for one metric, oldest first.
function seriesFor(metric, performanceTests) {
  const by = new Map();
  for (const t of performanceTests || []) {
    if (t.test_type !== metric.testType || (t.test_variant || 'untagged') !== metric.variant) continue;
    const v = Number(t.metric);
    if (!(v > 0)) continue;
    const d = dayOf(t);
    if (!by.has(t.athlete_id)) by.set(t.athlete_id, new Map());
    const m = by.get(t.athlete_id);
    const cur = m.get(d);
    if (cur == null || (metric.lowerIsBetter ? v < cur : v > cur)) m.set(d, v);
  }
  const out = new Map();
  for (const [id, m] of by) out.set(id, [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, value]) => ({ day, value })));
  return out;
}

// One test result in context: vs previous best, weight vs baseline, load going in, flag.
function contextFor({ metric, athlete, series, i, logs, base, settings, dropPct, weightPct }) {
  const { day, value } = series[i];
  // Best mark up to and including this test, and how far this result is off it.
  const upTo = series.slice(0, i + 1);
  const bestP = upTo.reduce((b, p) => (metric.lowerIsBetter ? (p.value < b.value ? p : b) : (p.value > b.value ? p : b)), upTo[0]);
  const best = bestP.value;
  const off = (metric.lowerIsBetter ? value / best - 1 : 1 - value / best) * 100;
  const pb = i > 0 && bestP === series[i] && series.slice(0, i).every(p => p.value !== value);

  // Weight: that day's weigh-in, else the latest one in the few days before.
  const start = dayStart(day);
  const wi = logs.filter(r => isRealWeighIn(r) && dayOf(r) <= day && start - new Date(r.created_at).getTime() < WEIGH_IN_LOOKBACK * DAY)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const baseW = base && Number(base.weight_lbs) > 0 ? Number(base.weight_lbs) : null;
  const curW = wi ? Number(wi.weight_lbs) : null;
  const dLb = baseW != null && curW != null ? curW - baseW : null;
  const dPct = dLb != null ? (dLb / baseW) * 100 : null;

  // Load carried into the test: windows end at the start of the test day.
  let acute = null, ratio = null;
  if (settings.enableRpe) {
    const rpe = logs.filter(isRpeLog);
    if (rpe.some(r => new Date(r.created_at).getTime() < start)) {
      const ac = computeAcuteChronicLoad(rpe, { chronicWeeks: settings.rpeChronicWeeks || 4, trackDuration: settings.rpeTrackDuration !== false, now: start });
      acute = Math.round(ac.acuteLoad); ratio = ac.ratio;
    }
  }

  const drop = off >= dropPct;
  const low = dPct != null && dPct <= -weightPct;
  const spike = ratio != null && ratio >= SPIKE_AT;
  const flag = drop && low ? 'red' : null;
  const notes = [];
  if (flag) {
    notes.push(`${metric.title.toLowerCase()} ${off.toFixed(1)}% off best`);
    notes.push(`down ${Math.abs(dPct).toFixed(1)}% body weight (${Math.abs(dLb).toFixed(1)} lb)`);
    if (spike) notes.push(`A:C ${ratio.toFixed(2)} going in`);
  }
  return {
    id: `${athlete.id}|${day}`, athleteId: athlete.id, name: displayName(athlete.name), sport: athlete.sport || '', pos: athlete.position || '',
    day, value, valueText: value.toFixed(metric.decimals), best, bestText: best.toFixed(metric.decimals), bestDay: bestP.day, off, pb, first: i === 0,
    weighDay: wi ? dayOf(wi) : null, curW, baseW, dLb, dPct, acute, ratio, drop, low, spike, flag, note: notes.join(', '),
  };
}

export function buildPerfReadiness({ metric, athletes = [], reportData = [], performanceTests = [], settings = {}, sport = 'ALL', day = null, withAthletePages = true, dropPct = DROP_PCT, weightPct = WEIGHT_PCT }) {
  if (!metric) return { days: [], day: null, rows: [], athletePages: [] };
  const roster = sport === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === sport);
  const byId = new Map(roster.map(a => [a.id, a]));
  const all = seriesFor(metric, performanceTests);
  const series = new Map([...all].filter(([id]) => byId.has(id)));
  const days = [...new Set([...series.values()].flatMap(s => s.map(p => p.day)))].sort().reverse();
  const pick = day && days.includes(day) ? day : days[0] || null;

  const logsBy = new Map();
  for (const r of reportData) {
    if (!byId.has(r.athlete_id)) continue;
    if (!logsBy.has(r.athlete_id)) logsBy.set(r.athlete_id, []);
    logsBy.get(r.athlete_id).push(r);
  }
  const ctx = (id, i) => {
    const a = byId.get(id);
    return contextFor({ metric, athlete: a, series: series.get(id), i, logs: logsBy.get(id) || [], base: getAthleteBaseline(a, reportData), settings, dropPct, weightPct });
  };

  const rank = { red: 0, gold: 1 };
  const rows = [];
  for (const [id, s] of series) {
    const i = s.findIndex(p => p.day === pick);
    if (i >= 0) rows.push(ctx(id, i));
  }
  rows.sort((x, y) => (rank[x.flag] ?? 2) - (rank[y.flag] ?? 2) || (y.off ?? -999) - (x.off ?? -999) || x.name.localeCompare(y.name));

  const athletePages = !withAthletePages ? [] : rows.map(r => {
    const s = series.get(r.athleteId);
    const hist = s.map((_, i) => ctx(r.athleteId, i)).reverse();
    // "Tests 2%+ down in weight averaged X% off best, vs Y% otherwise" - only with both kinds.
    const scored = hist.filter(h => !h.first && h.dPct != null);
    const lowSet = scored.filter(h => h.low), rest = scored.filter(h => !h.low);
    const avg = (xs) => xs.reduce((t, h) => t + h.off, 0) / xs.length;
    const summary = lowSet.length && rest.length
      ? { lowN: lowSet.length, lowAvg: avg(lowSet), restN: rest.length, restAvg: avg(rest) } : null;
    return { athleteId: r.athleteId, name: r.name, sport: r.sport, pos: r.pos, hist, summary };
  });

  return {
    days, day: pick, rows, athletePages,
    redCount: rows.filter(r => r.flag === 'red').length,
    thresholds: { drop: dropPct, weight: weightPct, spike: SPIKE_AT },
  };
}

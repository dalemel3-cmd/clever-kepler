// Per-athlete session-RPE metrics for the Performance > RPE deep-dive tab. Pure
// functions (no React) so the numbers are easy to test and match the rest of the app:
// the A:C ratio comes from the same computeAcuteChronicLoad the Profile and Reports use.
import { computeAcuteChronicLoad, getCentralDateString, isRpeLog } from '../../utils/athleteData';

const DAY = 86400000;

// sRPE load for one session: RPE x minutes when the program tracks duration, RPE alone
// when it doesn't (same rule as computeAcuteChronicLoad).
export const sessionLoad = (l, trackDuration) =>
  (Number(l.rpe) || 0) * (trackDuration ? (Number(l.session_minutes) || 0) : 1);

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

// Foster's monotony and strain over the last 7 calendar days, rest days counted as 0.
// Monotony = mean daily load / SD of daily load; > 2.0 is the usual warning line.
// Undefined (null) when every day is identical, including a week of all rest.
export function monotonyStrain(logs, trackDuration, now = Date.now()) {
  const days = Array.from({ length: 7 }, (_, i) => getCentralDateString(new Date(now - i * DAY)));
  const byDay = new Map(days.map(d => [d, 0]));
  for (const l of logs) {
    const d = getCentralDateString(new Date(l.created_at));
    if (byDay.has(d)) byDay.set(d, byDay.get(d) + sessionLoad(l, trackDuration));
  }
  const daily = [...byDay.values()];
  const total = daily.reduce((s, x) => s + x, 0);
  const s = sd(daily);
  if (!total || !s) return { monotony: null, strain: null, weekLoad: total };
  const monotony = mean(daily) / s;
  return { monotony, strain: total * monotony, weekLoad: total };
}

// Weekly load totals for the last `weeks` rolling 7-day blocks, oldest first, ending
// today (block 0 = 7-13 days ago ... last = the past 7 days).
export function weeklyLoads(logs, trackDuration, weeks, now = Date.now()) {
  const out = Array.from({ length: weeks }, (_, i) => ({ weeksAgo: weeks - 1 - i, load: 0, sessions: 0 }));
  for (const l of logs) {
    const age = now - new Date(l.created_at).getTime();
    if (!(age >= 0)) continue;
    const idx = weeks - 1 - Math.floor(age / (7 * DAY));
    if (idx < 0 || idx >= weeks) continue;
    out[idx].load += sessionLoad(l, trackDuration);
    out[idx].sessions += 1;
  }
  return out;
}

// One row per athlete that has any RPE history. windowWeeks controls the averages and
// the weekly trend; the A:C ratio always uses the full history it needs.
export function buildRpeRows(athletes, reportData, settings, { windowWeeks = 6, now = Date.now() } = {}) {
  const track = settings.rpeTrackDuration !== false;
  const high = settings.rpeHighThreshold || 8;
  const rpeLogs = (reportData || []).filter(isRpeLog);
  const byAthlete = new Map();
  for (const l of rpeLogs) {
    if (!byAthlete.has(l.athlete_id)) byAthlete.set(l.athlete_id, []);
    byAthlete.get(l.athlete_id).push(l);
  }
  const cutoff = now - windowWeeks * 7 * DAY;
  const rows = [];
  for (const a of athletes) {
    const all = byAthlete.get(a.id) || [];
    if (!all.length) continue;
    const inWindow = all.filter(l => new Date(l.created_at).getTime() >= cutoff);
    const ac = computeAcuteChronicLoad(all, { chronicWeeks: settings.rpeChronicWeeks || 4, trackDuration: track, now });
    const ms = monotonyStrain(all, track, now);
    const weeks = weeklyLoads(all, track, windowWeeks, now);
    const thisWeek = weeks[weeks.length - 1]?.load || 0;
    const lastWeek = weeks[weeks.length - 2]?.load || 0;
    const latest = all.reduce((m, l) => (new Date(l.created_at) > new Date(m.created_at) ? l : m), all[0]);
    rows.push({
      athlete: a,
      sessions: inWindow.length,
      avgRpe: inWindow.length ? mean(inWindow.map(l => Number(l.rpe) || 0)) : null,
      highSessions: inWindow.filter(l => Number(l.rpe) >= high).length,
      totalLoad: inWindow.reduce((s, l) => s + sessionLoad(l, track), 0),
      acuteLoad: ac.acuteLoad,
      chronicWeekly: ac.chronicAvgWeeklyLoad,
      ratio: ac.ratio,
      weekChange: lastWeek > 0 ? (thisWeek - lastWeek) / lastWeek : null,
      monotony: ms.monotony,
      strain: ms.strain,
      weeks,
      lastSession: latest.created_at,
      daysSince: Math.floor((now - new Date(latest.created_at).getTime()) / DAY),
      logs: all,
    });
  }
  return rows;
}

// Status chips for a row, most important first. Thresholds come from Settings where
// they exist; 0.8 (underloaded) and 2.0 (monotony) are the standard literature lines.
export function flagsFor(row, settings) {
  const f = [];
  if (row.ratio != null && row.ratio >= (settings.rpeLoadSpikeRatio || 1.3)) f.push({ key: 'spike', label: 'Load spike', tone: 'bad' });
  if (row.monotony != null && row.monotony > 2) f.push({ key: 'monotony', label: 'High monotony', tone: 'warn' });
  if (row.ratio != null && row.ratio < 0.8) f.push({ key: 'low', label: 'Underloaded', tone: 'warn' });
  if (row.daysSince >= 7) f.push({ key: 'quiet', label: `No RPE in ${row.daysSince}d`, tone: 'muted' });
  return f;
}

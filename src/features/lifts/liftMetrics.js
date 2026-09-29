// Per-athlete strength metrics for the Performance > Strength deep-dive tab. Pure
// functions (no React). Everything is ranked by estimated 1RM from liftRanking, so the
// numbers agree with the Lift Tracker leaderboard, PNG and CSV.
import { estimate1RM } from './liftRanking';
import { hasWeight, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';

const DAY = 86400000;
const e1 = (l) => estimate1RM(Number(l.weight_lbs) || 0, Number(l.reps) || 0);
const t = (l) => new Date(l.created_at).getTime();

// Latest body weight per athlete from weigh-ins (same rule as the leaderboard).
export function latestBodyWeights(reportData) {
  const map = new Map();
  for (const r of (reportData || [])) {
    if (!hasWeight(r) || isPostPracticeLog(r) || isRpeLog(r)) continue;
    const cur = map.get(r.athlete_id);
    if (!cur || t(r) > t(cur)) map.set(r.athlete_id, r);
  }
  return new Map([...map].map(([id, r]) => [id, Number(r.weight_lbs)]));
}

// Best estimated 1RM per rolling 7-day block, oldest first (last = the past 7 days).
// Weeks with no sets are null so charts show a gap rather than a fake drop to 0.
export function weeklyBest(logs, weeks, now = Date.now()) {
  const out = Array.from({ length: weeks }, (_, i) => ({ weeksAgo: weeks - 1 - i, best: null, sets: 0, volume: 0 }));
  for (const l of logs) {
    const age = now - t(l);
    if (!(age >= 0)) continue;
    const idx = weeks - 1 - Math.floor(age / (7 * DAY));
    if (idx < 0 || idx >= weeks) continue;
    const w = out[idx];
    w.best = Math.max(w.best ?? 0, e1(l));
    w.sets += 1;
    w.volume += (Number(l.weight_lbs) || 0) * (Number(l.reps) || 0);
  }
  return out;
}

// Chronological PR history: every set that beat the athlete's previous best e1RM.
export function prHistory(logs) {
  const sorted = [...logs].sort((a, b) => t(a) - t(b));
  const prs = [];
  let best = -Infinity;
  for (const l of sorted) {
    const v = e1(l);
    if (v > best) { best = v; prs.push({ ...l, est: Math.round(v) }); }
  }
  return prs;
}

// One row per athlete that has logged `lift`. windowWeeks drives the trend, sets and
// volume; the PR always uses the athlete's full history.
export function buildStrengthRows(athletes, liftLogs, { lift, windowWeeks = 8, now = Date.now(), bodyWeights = new Map() }) {
  const byAthlete = new Map();
  for (const l of (liftLogs || [])) {
    if (l.lift_type !== lift) continue;
    if (!byAthlete.has(l.athlete_id)) byAthlete.set(l.athlete_id, []);
    byAthlete.get(l.athlete_id).push(l);
  }
  const cutoff = now - windowWeeks * 7 * DAY;
  const half = now - Math.floor(windowWeeks / 2) * 7 * DAY;
  const rows = [];
  for (const a of athletes) {
    const all = byAthlete.get(a.id);
    if (!all || !all.length) continue;
    const prs = prHistory(all);
    const pr = prs[prs.length - 1];
    const inWindow = all.filter(l => t(l) >= cutoff);
    const recent = inWindow.filter(l => t(l) >= half);
    const earlier = inWindow.filter(l => t(l) < half);
    const bestOf = (xs) => (xs.length ? Math.max(...xs.map(e1)) : null);
    const recentBest = bestOf(recent);
    const earlierBest = bestOf(earlier);
    const latest = all.reduce((m, l) => (t(l) > t(m) ? l : m), all[0]);
    const bw = bodyWeights.get(a.id) || null;
    rows.push({
      athlete: a,
      pr: pr.est,
      prSet: pr,
      prDaysAgo: Math.floor((now - t(pr)) / DAY),
      prsInWindow: prs.filter(p => t(p) >= cutoff).length,
      recentBest: recentBest == null ? null : Math.round(recentBest),
      // Best of the later half of the window vs the earlier half.
      change: recentBest != null && earlierBest ? (recentBest - earlierBest) / earlierBest : null,
      pctOfPr: recentBest != null ? recentBest / pr.est : null,
      relative: bw ? pr.est / bw : null,
      bodyWeight: bw,
      sets: inWindow.length,
      volume: inWindow.reduce((s, l) => s + (Number(l.weight_lbs) || 0) * (Number(l.reps) || 0), 0),
      weeks: weeklyBest(all, windowWeeks, now),
      lastSet: latest,
      daysSince: Math.floor((now - t(latest)) / DAY),
      logs: all,
      prs,
    });
  }
  return rows;
}

// Status chips, most important first.
export function strengthFlags(row) {
  const f = [];
  if (row.prDaysAgo <= 14) f.push({ key: 'pr', label: 'New PR', tone: 'ok' });
  if (row.pctOfPr != null && row.pctOfPr < 0.9 && row.prDaysAgo > 14) f.push({ key: 'down', label: `${Math.round(row.pctOfPr * 100)}% of PR`, tone: 'bad' });
  else if (row.prDaysAgo >= 56 && row.daysSince < 14) f.push({ key: 'stall', label: 'Plateau', tone: 'warn' });
  if (row.daysSince >= 14) f.push({ key: 'quiet', label: `Not logged in ${row.daysSince}d`, tone: 'muted' });
  return f;
}

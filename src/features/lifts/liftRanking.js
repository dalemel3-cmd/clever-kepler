// Shared lift math for the Lift Tracker's leaderboard, its PNG export and the CSV
// export, so the on-screen board, the image and the spreadsheet can never disagree.
import { getCentralDateString } from '../../utils/athleteData';

// Estimated 1-rep max (Epley). Weight and reps are always stored as the raw set an
// athlete actually did - this is only used to compare sets logged at different rep
// counts (245x5 vs 275x3), never stored back on the row itself.
export const estimate1RM = (weight, reps) => (reps <= 1 ? weight : weight * (1 + reps / 30));

export const RANK_MODES = [
  { id: 'est1rm', label: 'Estimated 1RM', short: 'EST. 1RM' },
  { id: 'heaviest', label: 'Heaviest set', short: 'HEAVIEST SET' },
  { id: 'relative', label: 'Pound-for-pound (1RM ÷ body weight)', short: 'BODY WEIGHT' },
];

export const TIMEFRAMES = [
  { id: 'all', label: 'All time' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'season', label: 'This season' },
  { id: 'custom', label: 'Custom dates' },
];

// Inclusive date window on the program's Central calendar day, as YYYY-MM-DD strings
// (compared lexically). from/to only apply to 'custom'.
export function timeframeBounds(frame, { seasonStartDate, from, to } = {}) {
  const today = getCentralDateString();
  const daysAgo = (n) => getCentralDateString(new Date(Date.now() - n * 86400000));
  switch (frame) {
    case '7d': return { start: daysAgo(6), end: today };
    case '30d': return { start: daysAgo(29), end: today };
    case 'season': return { start: seasonStartDate || null, end: today };
    case 'custom': return { start: from || null, end: to || null };
    default: return { start: null, end: null };
  }
}

export const inBounds = (log, { start, end }) => {
  if (!start && !end) return true;
  const d = getCentralDateString(new Date(log.created_at));
  return (!start || d >= start) && (!end || d <= end);
};

// Human label for a window, e.g. "Aug 3 – Sep 29, 2026" or "All time".
export function describeBounds(frame, bounds) {
  if (frame === 'all' || (!bounds.start && !bounds.end)) return 'All time';
  const fmt = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (bounds.start && bounds.end) return `${fmt(bounds.start)} – ${fmt(bounds.end)}`;
  return bounds.start ? `Since ${fmt(bounds.start)}` : `Through ${fmt(bounds.end)}`;
}

// One row per athlete: their best set for `lift` inside the window, ranked by the
// chosen mode. Pound-for-pound needs a body weight; athletes without one are left
// out of that ranking (and counted, so the UI can say so) rather than guessed.
export function buildLeaderboard(liftLogs, athletes, { lift, sport = 'ALL', rankBy = 'est1rm', bounds = {}, bodyWeightFor = () => null }) {
  const roster = sport === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === sport);
  const byId = new Map(roster.map(a => [a.id, a]));
  const best = new Map();
  const score = (l) => {
    const w = Number(l.weight_lbs), r = Number(l.reps);
    return rankBy === 'heaviest' ? w : estimate1RM(w, r);
  };
  for (const l of (liftLogs || [])) {
    if (l.lift_type !== lift || !byId.has(l.athlete_id) || !inBounds(l, bounds)) continue;
    const s = score(l);
    const cur = best.get(l.athlete_id);
    // Heaviest-set ties go to more reps, e.g. 225x5 over 225x3.
    if (!cur || s > cur.score || (s === cur.score && Number(l.reps) > Number(cur.reps))) best.set(l.athlete_id, { ...l, score: s });
  }
  let missingBodyWeight = 0;
  const rows = [];
  for (const row of best.values()) {
    const athlete = byId.get(row.athlete_id);
    const est = Math.round(estimate1RM(Number(row.weight_lbs), Number(row.reps)));
    const out = { ...row, athlete_name: athlete?.name || row.athlete_name, sport: athlete?.sport || row.sport || '', est };
    if (rankBy === 'relative') {
      const bw = Number(bodyWeightFor(row.athlete_id));
      if (!bw) { missingBodyWeight++; continue; }
      out.bodyWeight = bw;
      out.value = est / bw;
      out.display = `${out.value.toFixed(2)}×`;
    } else {
      out.value = rankBy === 'heaviest' ? Number(row.weight_lbs) : est;
      out.display = String(Math.round(out.value));
    }
    rows.push(out);
  }
  rows.sort((a, b) => b.value - a.value || a.athlete_name.localeCompare(b.athlete_name));
  return { rows, missingBodyWeight };
}

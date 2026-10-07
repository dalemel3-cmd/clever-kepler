// Data for the Readiness Report (design handoff "HPD Printables", Part 2; docs/HANDOFF.md
// §107). Pure functions, no React. Every list the document shows comes from here, and
// the summary tiles are counted from the same lists, so a tile can never disagree with
// its section.
import { computeAcuteChronicLoad, getAthleteBaseline, getCentralDateString, hasSleep, hasWeight, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';
import { estimate1RM } from '../lifts/liftRanking';
import { TEST_TYPES, TEST_TYPE_BY_KEY, VARIANT_LABEL, UNTAGGED_VARIANT_LABEL } from '../analytics/testVariants';
import { computeSweatDrops } from '../alerts/NegativeSweatDropCards';

const DAY = 86400000;
export const SPIKE_AT = 1.5;      // handoff: "Spike" zone
export const UNDER_BELOW = 0.8;   // handoff: "Underloaded" zone
export const FLAG_PCT = 5;        // handoff: latest 5%+ below personal best
export const PR_DAYS = 14;
export const WEIGH_IN_DAYS = 14;

// The app stores some names in ALL CAPS. Title-case those words only, keep Mc- and
// hyphen capitals, and leave short tokens (JP, KJ) alone.
export const displayName = (s) => String(s || '').split(' ').map(w => {
  if (w !== w.toUpperCase() || w.length <= 2) return w;
  const t = w.charAt(0) + w.slice(1).toLowerCase();
  return t.replace(/^Mc(\w)/, (_, c) => `Mc${c.toUpperCase()}`).replace(/-(\w)/g, (_, c) => `-${c.toUpperCase()}`);
}).join(' ');

const mdy = (d) => d.toLocaleDateString('en-US');
// Baseline dates are stored as ISO strings, but a few older ones are display strings
// ("Sep 7"). Show the ISO ones as M/D/YYYY and pass anything else through.
const baselineDateLabel = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return /^\d{4}-\d{2}-\d{2}/.test(String(v)) && !isNaN(d) ? mdy(d) : String(v);
};

const at = (r) => new Date(r.created_at).getTime();
const isRealWeighIn = (r) => hasWeight(r) && !isPostPracticeLog(r) && !isRpeLog(r);

export function buildReadinessReport({ athletes, reportData = [], liftLogs = [], performanceTests = [], settings, sport = 'ALL', now = Date.now(), showE1rm = false }) {
  const roster = (sport === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === sport));
  const ids = new Set(roster.map(a => a.id));
  const logsBy = new Map();
  for (const r of reportData) {
    if (!ids.has(r.athlete_id)) continue;
    if (!logsBy.has(r.athlete_id)) logsBy.set(r.athlete_id, []);
    logsBy.get(r.athlete_id).push(r);
  }
  const byName = (a, b) => displayName(a.name).localeCompare(displayName(b.name));

  // 01 Dehydration & mass drop: latest real weigh-in vs the athlete's baseline.
  const threshold = Number(settings.dehydrationThreshold) || 2;
  const mass = [];
  for (const a of roster) {
    const weighIns = (logsBy.get(a.id) || []).filter(isRealWeighIn).sort((x, y) => at(y) - at(x));
    const cur = weighIns[0];
    if (!cur) continue;
    const base = getAthleteBaseline(a, reportData);
    if (!base || !base.weight_lbs || base.id === cur.id) continue;
    const drop = Number(base.weight_lbs) - Number(cur.weight_lbs);
    if (!(drop > threshold)) continue;
    const pct = (drop / Number(base.weight_lbs)) * 100;
    mass.push({ id: a.id, name: displayName(a.name), sport: a.sport || '', base: Number(base.weight_lbs), baseDate: baselineDateLabel(base.date_str), cur: Number(cur.weight_lbs), drop, pct, logged: mdy(new Date(cur.created_at)), severe: pct >= 3 });
  }
  mass.sort((x, y) => y.pct - x.pct);

  // Post-practice sweat loss (same calculation as the Alerts cards) and sleep deficits.
  const sweat = computeSweatDrops({ athletes: roster, reportData, settings }).map(s => ({
    id: s.athlete.id, name: displayName(s.athlete.name), sport: s.athlete.sport || '', pre: s.bWeight, post: s.pWeight, drop: s.drop, pct: s.pctLoss, when: `${s.pDate} ${s.pTime}`, severe: s.isSevere,
  }));
  const sleepThreshold = Number(settings.sleepThreshold) || 6.5;
  const sleep = [];
  for (const a of roster) {
    const recent = (logsBy.get(a.id) || []).filter(r => hasSleep(r) && now - at(r) < 7 * DAY).sort((x, y) => at(y) - at(x));
    const low = recent.filter(r => Number(r.sleep_hrs) < sleepThreshold);
    if (low.length) sleep.push({ id: a.id, name: displayName(a.name), sport: a.sport || '', latest: Number(low[0].sleep_hrs), nights: low.length, when: mdy(new Date(low[0].created_at)) });
  }
  sleep.sort((x, y) => x.latest - y.latest);

  // 02 Training load: everyone with an RPE session in the chronic window.
  const load = [];
  if (settings.enableRpe) {
    const chronicWeeks = settings.rpeChronicWeeks || 4;
    const highAt = Number(settings.rpeLoadSpikeRatio) || 1.3;
    for (const a of roster) {
      const rpe = (logsBy.get(a.id) || []).filter(isRpeLog);
      const inWindow = rpe.filter(r => now - at(r) < chronicWeeks * 7 * DAY && now - at(r) >= 0);
      if (!inWindow.length) continue;
      const ac = computeAcuteChronicLoad(rpe, { chronicWeeks, trackDuration: settings.rpeTrackDuration !== false, now });
      const r = ac.ratio;
      const zone = r == null ? 'none' : r >= SPIKE_AT ? 'spike' : r >= highAt ? 'high' : r >= UNDER_BELOW ? 'target' : 'under';
      load.push({ id: a.id, name: displayName(a.name), sport: a.sport || '', ratio: r, acute: Math.round(ac.acuteLoad), sessions: inWindow.length, avgRpe: inWindow.reduce((s, l) => s + Number(l.rpe), 0) / inWindow.length, zone });
    }
    load.sort((x, y) => (y.ratio ?? -1) - (x.ratio ?? -1) || x.name.localeCompare(y.name));
  }
  const spikes = load.filter(r => r.zone === 'spike').length;
  const under = load.filter(r => r.zone === 'under').length;

  // 03 Performance flags (latest 5%+ below personal best) and 04 new PRs.
  const flagGroups = new Map();
  const prs = [];
  const addFlag = (title, row) => { if (!flagGroups.has(title)) flagGroups.set(title, []); flagGroups.get(title).push(row); };
  const athleteById = new Map(roster.map(a => [a.id, a]));

  if (settings.enableSpeedPower) {
    const groups = new Map();
    for (const t of performanceTests) {
      if (!ids.has(t.athlete_id) || !(Number(t.metric) > 0)) continue;
      const k = `${t.athlete_id}|${t.test_type}|${t.test_variant || 'untagged'}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    for (const [k, rows] of groups) {
      const [aid, type, variant] = k.split('|');
      const tt = TEST_TYPE_BY_KEY[type];
      if (!tt) continue;
      const asc = tt.better === 'asc';
      const sorted = [...rows].sort((x, y) => at(x) - at(y));
      const latest = sorted[sorted.length - 1];
      const unit = tt.unit === 'sec' ? 's' : tt.unit;
      const dp = tt.unit === 'sec' ? 2 : 1;
      const vName = variant === 'untagged' ? UNTAGGED_VARIANT_LABEL : (VARIANT_LABEL[variant] || variant);
      const title = tt.variants.length > 1 || variant === 'untagged' ? `${tt.label} · ${vName}` : tt.label;
      const a = athleteById.get(aid);
      const vals = sorted.map(r => Number(r.metric));
      const best = asc ? Math.min(...vals) : Math.max(...vals);
      const lv = Number(latest.metric);
      const off = (asc ? lv / best - 1 : 1 - lv / best) * 100;
      if (sorted.length > 1 && off >= FLAG_PCT) addFlag(title, { id: aid, name: displayName(a.name), sport: a.sport || '', latest: `${lv.toFixed(dp)} ${unit}`, best: `${best.toFixed(dp)} ${unit}`, off });
      // PB in the last 14 days that beat an earlier result (a first-ever test isn't a PB).
      let prev = null, lastPb = null;
      for (const r of sorted) {
        const v = Number(r.metric);
        if (prev != null && (asc ? v < prev : v > prev)) lastPb = r;
        if (prev == null || (asc ? v < prev : v > prev)) prev = v;
      }
      if (lastPb && now - at(lastPb) < PR_DAYS * DAY) prs.push({ id: `${aid}|${type}|${variant}`, name: displayName(a.name), sport: a.sport || '', what: tt.label, val: `${Number(lastPb.metric).toFixed(dp)}` });
    }
  }

  if (settings.enableLiftTracker) {
    const groups = new Map();
    for (const l of liftLogs) {
      if (!ids.has(l.athlete_id)) continue;
      const k = `${l.athlete_id}|${l.lift_type}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(l);
    }
    for (const [k, rows] of groups) {
      const [aid, lift] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
      const a = athleteById.get(aid);
      const sorted = [...rows].sort((x, y) => at(x) - at(y));
      // Latest session = the athlete's best set on their most recent lifting day.
      const day = (l) => getCentralDateString(new Date(l.created_at));
      const lastDay = day(sorted[sorted.length - 1]);
      const e1 = (l) => estimate1RM(Number(l.weight_lbs), Number(l.reps));
      // Show the actual set ("225 × 3"); est. 1RM (what flags/PRs are judged on) optional.
      const top = (ls) => ls.reduce((b, l) => (e1(l) > e1(b) ? l : b), ls[0]);
      const setTxt = (l) => `${+Number(l.weight_lbs).toFixed(1)} × ${Number(l.reps)}${showE1rm ? ` (est. ${Math.round(e1(l))})` : ''}`;
      const latestSet = top(sorted.filter(l => day(l) === lastDay));
      const latest = e1(latestSet);
      const before = sorted.filter(l => day(l) !== lastDay);
      const bestSet = top(sorted);
      const best = e1(bestSet);
      const off = (1 - latest / best) * 100;
      if (before.length && off >= FLAG_PCT) addFlag(`Strength · ${lift}`, { id: aid, name: displayName(a.name), sport: a.sport || '', latest: setTxt(latestSet), best: setTxt(bestSet), off });
      let prev = null, lastPr = null;
      for (const l of sorted) {
        const v = e1(l);
        if (prev != null && v > prev) lastPr = l;
        if (prev == null || v > prev) prev = v;
      }
      if (lastPr && now - at(lastPr) < PR_DAYS * DAY) prs.push({ id: `${aid}|${lift}`, name: displayName(a.name), sport: a.sport || '', what: lift, val: setTxt(lastPr) });
    }
  }
  const flags = [...flagGroups.entries()]
    .map(([title, rows]) => ({ title, rows: rows.sort((x, y) => y.off - x.off || x.name.localeCompare(y.name)) }))
    .sort((x, y) => x.title.localeCompare(y.title));
  const flagCount = flags.reduce((s, g) => s + g.rows.length, 0);
  prs.sort((x, y) => x.name.localeCompare(y.name) || x.what.localeCompare(y.what));

  // 05 Weigh-in needed: no real weigh-in in 14+ days, grouped by sport.
  const needBySport = new Map();
  for (const a of [...roster].sort(byName)) {
    const last = (logsBy.get(a.id) || []).filter(isRealWeighIn).reduce((m, r) => Math.max(m, at(r)), 0);
    const days = last ? Math.floor((now - last) / DAY) : null;
    if (days != null && days < WEIGH_IN_DAYS) continue;
    const k = a.sport || 'Unassigned';
    if (!needBySport.has(k)) needBySport.set(k, []);
    needBySport.get(k).push({ id: a.id, label: displayName(a.name) + (days != null ? ` · ${days}d` : '') });
  }
  const weighIn = [...needBySport.entries()]
    .sort((x, y) => (x[0] === 'Unassigned') - (y[0] === 'Unassigned') || x[0].localeCompare(y[0]))
    .map(([s, names]) => ({ sport: s, names }));
  const weighInTotal = weighIn.reduce((s, g) => s + g.names.length, 0);

  return {
    loadEnabled: !!settings.enableRpe, mass, sweat, sleep, load, spikes, under, flags, flagCount, prs, weighIn, weighInTotal,
    thresholds: { dehydration: threshold, sleep: sleepThreshold, high: Number(settings.rpeLoadSpikeRatio) || 1.3 },
  };
}

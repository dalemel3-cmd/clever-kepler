// Run with:  node tests/e1rm-rounding.js   (pure functions: no browser or server needed)
// v5.16.5: estimated 1RMs are shown to the nearest 5 lb; ranking and PR checks stay exact.
// The app's modules import without file extensions; a tiny resolver hook adds them.
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    try { return await next(spec, ctx); }
    catch (e) { if (!/^[.]/.test(spec)) throw e; for (const x of ['.js', '.jsx', '/index.js']) { try { return await next(spec + x, ctx); } catch {} } throw e; }
  }`));
const { round5, estimate1RM, buildLeaderboard } = await import('../src/features/lifts/liftRanking.js');
const { prHistory, buildStrengthRows } = await import('../src/features/lifts/liftMetrics.js');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

check('round5 goes to the nearest 5', round5(302) === 300 && round5(303) === 305 && round5(307.4) === 305 && round5(307.5) === 310 && round5(0) === 0);
const L = (id, a, w, r, day) => ({ id, athlete_id: a, athlete_name: a, lift_type: 'Squat', weight_lbs: w, reps: r, created_at: `2026-11-${day}T15:00:00Z` });
// 301 vs 303 exact: both show 300 / 305 area but the ranking keeps the exact order.
const logs = [L('1', 'a', 301, 1, '01'), L('2', 'b', 303, 1, '01')];
const board = buildLeaderboard(logs, [{ id: 'a', name: 'Ann', sport: 'X' }, { id: 'b', name: 'Bo', sport: 'X' }], { lift: 'Squat' });
check('the leaderboard orders by the exact value and shows multiples of 5', board.rows[0].athlete_name === 'Bo' && board.rows.map(r => r.display).join() === '305,300', board.rows.map(r => r.display).join());
const prs = prHistory([L('1', 'a', 301, 1, '01'), L('2', 'a', 303, 1, '02')]);
check('a set 2 lb better is still a new PR, shown rounded', prs.length === 2 && prs[0].est === 300 && prs[1].est === 305, JSON.stringify(prs.map(p => p.est)));
const rows = buildStrengthRows([{ id: 'a', name: 'Ann' }], [L('1', 'a', 275, 3, '10')], { lift: 'Squat', now: Date.parse('2026-11-12T00:00:00Z'), bodyWeights: new Map([['a', 200]]) });
check('the PR shows to 5 but relative strength uses the exact value', rows[0].pr === 305 && Math.abs(rows[0].relative - estimate1RM(275, 3) / 200) < 1e-9, `${rows[0].pr} ${rows[0].relative}`);
console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

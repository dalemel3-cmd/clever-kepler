// Run with:  node tests/swc.js   (pure functions: no browser or server needed)
// v5.17.1: smallest worthwhile change (0.2 x the athlete's own SD) and the coach's SESOI.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    try { return await next(spec, ctx); }
    catch (e) { if (!/^[.]/.test(spec)) throw e; for (const x of ['.js', '.jsx', '/index.js']) { try { return await next(spec + x, ctx); } catch {} } throw e; }
  }`));
const { sd, mean, baselineOf, changeVs } = await import('../src/utils/swc.js');
const { priorValues } = await import('../src/features/gps/gpsData.js');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const near = (a, b) => Math.abs(a - b) < 1e-9;

check('sample SD (n - 1) and mean', near(sd([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7)) && mean([1, 2, 3]) === 2 && sd([5]) === null);
const b = baselineOf([20, 22, 24]); // mean 22, SD 2 -> SWC 0.4
check('SWC = 0.2 x SD; with no SESOI the threshold is the SWC', near(b.mean, 22) && near(b.sd, 2) && near(b.swc, 0.4) && b.sesoi === null && near(b.threshold, 0.4));
check('a SESOI larger than the SWC sets the threshold; a smaller one does not', near(baselineOf([20, 22, 24], 1).threshold, 1) && near(baselineOf([20, 22, 24], 0.1).threshold, 0.4) && baselineOf([20, 22, 24], '').sesoi === null);
check('identical earlier values (SD 0): the threshold never drops below the measure\'s step', baselineOf([0, 0, 0], null, 1).threshold === 1 && changeVs(1, baselineOf([0, 0, 0], null, 1)).dir === 'trivial' && changeVs(2, baselineOf([0, 0, 0], null, 1)).dir === 'up');
check('fewer than 3 results: no baseline', baselineOf([20, 22]) === null);
check('a change within the threshold is trivial; past it, up or down', changeVs(22.3, b).dir === 'trivial' && changeVs(22.5, b).dir === 'up' && changeVs(21.5, b).dir === 'down' && near(changeVs(21.5, b).diff, -0.5));
check('no baseline or no latest: no verdict', changeVs(22, null) === null && changeVs(null, b) === null);
const S = (d, v) => ({ athlete_id: 'a', session_date: d, distance_yd: v });
check('GPS baseline = the 28 days before the day, not the day itself', priorValues([S('2026-10-19', 1), S('2026-10-20', 2), S('2026-11-16', 3), S('2026-11-17', 4)], 'a', '2026-11-17', 'distance_yd').join() === '2,3');

check('only game days (or only practices) when asked', priorValues([S('2026-11-06', 9), S('2026-11-10', 3), S('2026-11-13', 8)], 'a', '2026-11-17', 'distance_yd', 28, d => ['2026-11-06', '2026-11-13'].includes(d)).join() === '9,8');
console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

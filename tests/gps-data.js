// Run with:  node tests/gps-data.js   (pure functions: no browser or server needed)
// v5.16.7: the Titan GPS CSV reader, name matching, import checks and weekly totals.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    try { return await next(spec, ctx); }
    catch (e) { if (!/^[.]/.test(spec)) throw e; for (const x of ['.js', '.jsx', '/index.js']) { try { return await next(spec + x, ctx); } catch {} } throw e; }
  }`));
const { parseTitan, parseCsv, matchAthlete, buildImport, weeklyTotals, weekStart, recentAverage, isoFromUs, windowDays, seriesFor, teamAverage, compact, acuteChronic, meanOf } = await import('../src/features/gps/gpsData.js');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const HEAD = 'Date,Player Name,GPS Distance,GPS Top Speed,GPS Accel Zones  Count,GPS Decel Zones  Count,GPS Speed Bands  Distance,GPS Personal Bands  Distance';
const csv = [HEAD,
  '11/17/2026,Ann Alpha,6439.869,16.965,31,14,495.561,27.987',
  '11/17/2026,bo bravo,5366.941,17.222,29,17,310.855,28.21',
  '11/17/2026,Cy Zero,0,0,0,0,0,0',
  '11/17/2026,xcdelta Cal Delta,3267.684,14.039,19,5,78.54,0',
  '11/17/2026,Nobody Known,3000,12,1,1,10,0',
  '11/18/2026,Ann Alpha,6845.81,17.495,28,10,382.551,254.967',
  '11/18/2026,"Bravo, Bo",1,1,1,1,1,1',
  ',Missing Date,1,1,1,1,1,1',
].join('\r\n');
const athletes = [{ id: 'a', name: 'ANN ALPHA' }, { id: 'b', name: 'BO BRAVO' }, { id: 'c', name: 'CY ZERO' }, { id: 'd', name: 'CAL DELTA' }, { id: 'e1', name: 'SAM SAME' }, { id: 'e2', name: 'sam same' }];

console.log('\n[A] Reading the file');
const p = parseTitan(csv);
check('header found despite the double spaces; dates become ISO', p.errors.length === 0 && p.rows[0].date === '2026-11-17' && p.rows[0].distance_yd === 6439.869 && p.rows[0].accel_count === 31 && p.rows[0].personal_band_yd === 27.987, JSON.stringify(p.rows[0]));
check('a row with no date is counted as bad, not read', p.badRows === 1 && p.rows.length === 7, `${p.badRows} ${p.rows.length}`);
check('quoted commas and a BOM are handled', parseCsv('﻿a,b\n"x,y",z\n')[1][0] === 'x,y');
check('a file that is not the Titan export says what is missing', /missing GPS Distance/.test(parseTitan('Date,Player Name,Foo\n1/1/2026,A,1').errors[0]));
check('dates: US and ISO accepted, impossible ones refused', isoFromUs('1/5/2026') === '2026-01-05' && isoFromUs('2026-01-05') === '2026-01-05' && isoFromUs('2/30/2026') === null && isoFromUs('x') === null);

console.log('\n[B] Matching names to the roster');
const m = (n) => matchAthlete(n, athletes);
check('case and spacing are ignored (exact)', m('ann  alpha')?.athlete.id === 'a' && m('ann  alpha').kind === 'exact' && m('BO BRAVO')?.kind === 'exact');
check('a doubled first word is matched by the last two words, marked partial', m('xcdelta Cal Delta')?.athlete.id === 'd' && m('xcdelta Cal Delta').kind === 'partial');
check('an unknown name, and a name two athletes share, are never guessed', m('Nobody Known') === null && m('Sam Same') === null && m('xx Sam Same') === null);
const apos = [{ id: 'p', name: 'ANDRE SMITH' }, { id: 'q', name: 'JANE SMITH' }];
check("names with an apostrophe or hyphen are not guessed (D'Andre Smith is not Andre Smith)", matchAthlete("D'Andre Smith", apos) === null && matchAthlete('Mary-Jane Smith', apos) === null && matchAthlete('Mary Jane Smith', apos)?.athlete.id === 'q');

console.log('\n[C] What an import would do');
const r = buildImport(p, athletes);
check('matched rows, one all-zero row skipped', r.rows.length === 4 && r.skippedZero === 1, JSON.stringify({ rows: r.rows.length, z: r.skippedZero }));
check('every name that was not exact is listed to check: the partial one with its suggestion, the unknowns without', r.needsLook.length === 3 && r.needsLook.find(x => x.name === 'xcdelta Cal Delta')?.chosen === 'd' && r.needsLook.find(x => x.name === 'Nobody Known')?.chosen === '' && r.unresolved === 2, JSON.stringify(r.needsLook));
check('days and athlete count', r.days.join() === '2026-11-17,2026-11-18' && r.athleteCount === 3);
const hand = buildImport(p, athletes, { 'Nobody Known': 'c', 'Bravo, Bo': 'skip' });
check('a hand match is used, "skip" drops the rows, and the names stay listed with the choice', hand.rows.some(x => x.athlete_id === 'c' && x.distance_yd === 3000) && hand.unresolved === 0 && hand.skippedByHand === 1 && hand.needsLook.find(x => x.name === 'Nobody Known')?.chosen === 'c' && hand.needsLook.find(x => x.name === 'Bravo, Bo')?.chosen === 'skip');
const twice = buildImport(parseTitan([HEAD, '11/17/2026,Ann Alpha,1,1,1,1,1,1', '11/17/2026,Ann Alpha,2,2,2,2,2,2'].join('\n')), athletes);
check('the same athlete twice on a day: one row saved (the later), and it is reported', twice.rows.length === 1 && twice.rows[0].distance_yd === 2 && twice.duplicates === 1);
const noAccel = parseTitan(['Date,Player Name,GPS Distance,GPS Top Speed', '11/17/2026,Ann Alpha,5000,17', '11/18/2026,Ann Alpha,,18'].join('\n'));
const ni = buildImport(noAccel, athletes);
check('a column missing from the file is left out of the saved rows (it can never blank what is saved)', noAccel.present.join() === 'distance_yd,top_speed_mph' && ni.rows.every(x => !('accel_count' in x) && !('decel_count' in x)) && ni.rows.length === 2, JSON.stringify(ni.rows[0]));
check('blank and unreadable cells are counted', noAccel.blankCells === 1 && parseTitan([HEAD, '11/17/2026,Ann Alpha,"6,439",17,1,1,1,1'].join('\n')).badNumbers === 1);
check('an out-of-range value is flagged', buildImport(parseTitan([HEAD, '11/17/2026,Ann Alpha,500000,170,1,1,1,1'].join('\n')), athletes).outOfRange === 1);

console.log('\n[D] Weeks');
check('weeks start on Monday', weekStart('2026-11-17') === '2026-11-16' && weekStart('2026-11-22') === '2026-11-16' && weekStart('2026-11-23') === '2026-11-23');
const S = (d, dist, top) => ({ athlete_id: 'a', session_date: d, distance_yd: dist, top_speed_mph: top, accel_count: 10, decel_count: 5, high_speed_yd: 100, personal_band_yd: 20 });
const t = weeklyTotals([S('2026-11-16', 5000, 16), S('2026-11-18', 3000, 18), S('2026-11-23', 4000, 17), { ...S('2026-11-17', 999, 30), athlete_id: 'z' }], 'a', 4, '2026-11-24');
check('4 weeks ending this week; totals, days and the week\'s top speed', t.length === 4 && t[2].week === '2026-11-16' && t[2].distance_yd === 8000 && t[2].days === 2 && t[2].top_speed_mph === 18 && t[2].accel_count === 20 && t[3].distance_yd === 4000, JSON.stringify(t.map(w => [w.week, w.distance_yd])));
check('empty weeks are empty, not zero; other athletes are left out', t[0].distance_yd === null && t[0].days === 0);
check('average of the earlier weeks', recentAverage(t, 'distance_yd') === 8000 && recentAverage([{ distance_yd: null }, { distance_yd: 5 }], 'distance_yd') === null);

console.log('\n[E] Team views (v5.16.9)');
const T = [S('2026-11-03', 4000, 15), S('2026-11-17', 5000, 16), S('2026-11-19', 3000, 17), { ...S('2026-11-17', 6000, 18), athlete_id: 'b' }, { ...S('2026-11-21', 9, 9), athlete_id: 'b' }];
const wd = windowDays(T, '2026-11-19', 14);
check('session days in the window, oldest first, nothing after the end day', wd.join() === '2026-11-17,2026-11-19', wd.join());
check('an athlete\'s value per day, empty where no session', seriesFor(T, 'b', wd, 'distance_yd').join() === '6000,' && seriesFor(T, 'a', wd, 'top_speed_mph').join() === '16,17');
check('team average per day over who has a value', teamAverage(T, ['a', 'b'], wd, 'distance_yd').join() === '5500,3000' && teamAverage(T, ['a'], ['2026-11-01'], 'distance_yd')[0] === null);
check('compact cell text', compact(6439.9, 'distance_yd') === '6.4k' && compact(495.6, 'high_speed_yd') === '496' && compact(17.22, 'top_speed_mph') === '17.2' && compact(null, 'x') === '');

console.log('\n[F] Acute : chronic (v5.17.0)');
// Ann: 1,000 yd every Monday for 4 weeks, then 2,000 on the last two days. Bo: one session only.
const AC = ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'].map(d => S(d, 1000, 15)).concat([S('2026-11-21', 2000, 15), S('2026-11-22', 2000, 15), { ...S('2026-11-20', 3000, 15), athlete_id: 'b' }, S('2026-11-23', 99999, 15)]);
const ac = acuteChronic(AC, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'z', name: 'Z' }], '2026-11-22', 'distance_yd');
const A = ac.find(r => r.athlete.id === 'a'), B = ac.find(r => r.athlete.id === 'b');
check('totals over 7, 14 and 28 days (inclusive of the end day and the 28th day back; nothing after the end)', A.sum7 === 5000 && A.sum14 === 6000 && A.sum28 === 8000, JSON.stringify(A));
check('7:28 = 7-day total / (28-day total / 4); 14:28 = 14-day total / 2 / that', Math.abs(A.ratio7 - 2.5) < 1e-9 && Math.abs(A.ratio14 - 1.5) < 1e-9);
check('athletes with under 3 weeks of history are marked building; no sessions = left out', A.building === false && B.building === true && !ac.some(r => r.athlete.id === 'z'));
check('a day whose 28-day window reaches before the loaded history reads building', acuteChronic(AC, [{ id: 'a', name: 'A' }], '2026-11-22', 'distance_yd', '2026-11-01')[0].building === true);
const zero = acuteChronic([S('2026-11-01', 0, 15), S('2026-11-20', 0, 15)].map(x => ({ ...x, accel_count: 0 })), [{ id: 'a', name: 'A' }], '2026-11-22', 'accel_count');
check('a load of 0 for 4 weeks gives no ratio (not "in range")', zero[0].ratio7 === null);
check('average of non-empty values', meanOf([1, null, 3]) === 2 && meanOf([null]) === null);

console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
process.exit(fail ? 1 : 0);

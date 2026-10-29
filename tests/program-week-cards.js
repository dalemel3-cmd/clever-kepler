// Run with:  node tests/program-week-cards.js   (no browser needed)
// v5.12.0 (docs/HANDOFF.md §139): weekly-card workbooks (one tab per week, days side by
// side, one row per set - modeled on the coach's MBB / WSOC Fall 26 cards as the app's
// .xlsx reader returns them) and Periodization counting every exercise, % or not.
import { register } from 'node:module';
register('./lib/src-resolve.mjs', import.meta.url);
const { isWeekCard, parseWeekCard, cardGroups, cardCounts, weekCardPrograms, weekNo } = await import('../src/features/programs/programWeekCard.js');
const { repsOf, prescribedSets, mainLiftOf, movementOf, sessionsFrom, bucketize } = await import('../src/features/programs/periodization.js');
const { isGrid } = await import('../src/features/programs/programGrid.js');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

// --- Periodization: every exercise counts -----------------------------------------
const r = (t, n) => JSON.stringify(repsOf(t, n));
check('reps: "5" / "4ea" / "3 ea" / "6+" / "2+1"', repsOf('5').reps === 5 && repsOf('4ea').reps === 4 && repsOf('3 ea').reps === 3 && repsOf('6+').reps === 6 && repsOf('2+1').reps === 3, [r('5'), r('4ea'), r('6+'), r('2+1')].join());
check('timed: "20s", "30s ea", "1 x 10s"; a 20/15/15 plank', repsOf('20s').timed && repsOf('30s ea').timed && repsOf('1 x 10s').timed && repsOf('20/15/15', '3 Way Plank').timed, [r('20s'), r('1 x 10s')].join());
check('"10s + 12" is 12 reps (hold, then reps)', repsOf('10s + 12').reps === 12 && !repsOf('10s + 12').timed);
const B = (name, rx, sets = [], maxKey = '') => ({ name, rx, sets, maxKey });
check('text prescriptions: "3x 8 ea" = 3 sets of 8; "4x 3ea"; "5x2"; "3X 10"', prescribedSets(B('Lunge', '3x 8 ea')).length === 3 && prescribedSets(B('Lunge', '3x 8 ea'))[0].reps === 8 && prescribedSets(B('Toss', '4x 3ea')).reduce((a, s) => a + s.reps, 0) === 12 && prescribedSets(B('Throw', '5x2')).length === 5 && prescribedSets(B('Shrug', '3X 10')).length === 3);
check('"6x 4 · @ 95 lb · tempo 4XXX" = 6 sets of 4, no %', prescribedSets(B('RDL', '6x 4 · @ 95 lb · tempo 4XXX')).length === 6 && prescribedSets(B('RDL', '6x 4 · @ 95 lb · tempo 4XXX'))[0].pct === null);
check('"3x 20s ea" = 3 timed sets; "2 Rounds" / "BW" not counted', prescribedSets(B('Side Plank', '3x 20s ea')).every(s => s.timed) && prescribedSets(B('Core', '2 Rounds')).length === 0 && prescribedSets(B('X', 'BW')).length === 0);
check('set-by-set rows keep their %', JSON.stringify(prescribedSets(B('Back Squat', '', [{ reps: '5', pct: '70' }, { reps: '3', pct: '' }]))) === JSON.stringify([{ reps: 5, timed: false, pct: 70 }, { reps: 3, timed: false, pct: null }]));
check('main lift by name: front/back/box squat, bench, RDL, cleans, military/push press', ['FRONT SQUAT', 'Back Squat', 'BARBELL BOX SQUAT'].every(n => mainLiftOf({ name: n }) === 'squat') && mainLiftOf({ name: 'BARBELL BENCH PRESS' }) === 'bench' && mainLiftOf({ name: 'BARBELL RDL' }) === 'dl' && mainLiftOf({ name: 'Hang Clean High Pull + Hang Clean Catch' }) === 'clean' && mainLiftOf({ name: 'BB MILITARY PRESS' }) === 'ohp' && mainLiftOf({ name: 'BB PUSH PRESS' }) === 'ohp');
check('not a main lift: split squat (even at % of squat), DB bench, step-ups, SL squat to bench, kneeling press', mainLiftOf({ name: 'REAR FOOT ELEVATED SPLIT SQUAT', maxKey: 'squat' }) === '' && mainLiftOf({ name: 'DB BENCH', maxKey: 'bench' }) === '' && mainLiftOf({ name: 'HEAVY BENCH STEP UPS' }) === '' && mainLiftOf({ name: 'SL SQUAT TO BENCH' }) === '' && mainLiftOf({ name: 'TALL KNEELING OVERHEAD PRESS' }) === '');
check('a builder block named oddly still counts by its % lift ("BS" @ squat)', mainLiftOf({ name: 'BS', maxKey: 'squat' }) === 'squat');
const mv = (n) => movementOf(n);
check('movement groups', mv('MB DEAD BUG') === 'core' && mv('SIDE PLANK WITH ABDUCTION') === 'core' && mv('PURPLE BAND PALLOFF') === 'core' && mv('POWER CLEAN HIGH PULL') === 'power' && mv('DEPTH DROP + Vertical') === 'power' && mv('PARNER HIP TOSS') === 'power' && mv('MB SUPINE PASS') === 'power' && mv('FRONT SQUAT') === 'lower' && mv('HEAVY BENCH STEP UPS') === 'lower' && mv('SPRING ANKLE') === 'lower' && mv('SL CALF RAISE') === 'lower' && mv('CHIN UP') === 'pull' && mv('BARBELL INVERTED ROW') === 'pull' && mv('T-Raise') === 'pull' && mv('BENCH PRESS') === 'push' && mv('OFF SET PUSH UP') === 'push' && mv('DB LATERAL RAISE') === 'push', ['MB DEAD BUG', 'PARNER HIP TOSS', 'HEAVY BENCH STEP UPS', 'T-Raise', 'OFF SET PUSH UP'].map(n => `${n}=${mv(n)}`).join(' '));
check('sprints / stretches have no group', mv('FLY 10 + 10') === '' && mv('MOD BENCH PIGEON') === '' && mv('Wickets') === '');

const prog = { id: 'p1', name: 'T', sport: 'WSOC', days: [{ date: '2026-08-24', blocks: [
  { name: 'FRONT SQUAT', maxKey: '', rx: '', sets: [{ reps: '8' }, { reps: '6' }, { reps: '5' }, { reps: '10+' }] },
  { name: 'Back Squat', maxKey: 'squat', rx: '', sets: [{ reps: '4', pct: '60' }, { reps: '4', pct: '70' }] },
  { name: 'RFE Split Squat', maxKey: 'squat', rx: '', sets: [{ reps: '5', pct: '20' }] },
  { name: 'CLAM SHELLS', rx: '3x 8 ea', sets: [] },
  { name: 'SIDE PLANK', rx: '3x 20s ea', sets: [] },
] }] };
const [wk] = bucketize(sessionsFrom([prog]).sessions, 'week');
check('a week: 13 sets (3 timed), 66 reps; load 6.2 / avg 48% from the % sets only', wk.sets === 13 && wk.timed === 3 && wk.reps === 66 && wk.load === 6.2 && Math.round(wk.avg) === 48, JSON.stringify({ sets: wk.sets, timed: wk.timed, reps: wk.reps, load: wk.load, avg: wk.avg }));
const [sq] = bucketize(sessionsFrom([prog], { lift: 'squat' }).sessions, 'week');
check('Squat filter: front + back squat (37 reps), not the split squat; avg 65%', sq.reps === 37 && sq.sets === 6 && Math.round(sq.avg) === 65, JSON.stringify({ reps: sq.reps, sets: sq.sets, avg: sq.avg }));
const [lo] = bucketize(sessionsFrom([prog], { lift: 'm:lower' }).sessions, 'week');
const [co] = bucketize(sessionsFrom([prog], { lift: 'm:core' }).sessions, 'week');
check('Movement filter: Lower body 66 reps, Core 3 timed sets', lo.reps === 66 && co.sets === 3 && co.timed === 3 && co.reps === 0);

// --- Weekly cards ---------------------------------------------------------------
// Two days side by side (A.. and T..), as readXlsx returns them: dates as M/D/YYYY, % as "70%".
const row = (cells) => { const out = []; for (const [c, v] of Object.entries(cells)) out[c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1] = v; return Array.from(out, v => v ?? ''); };
const card = (opts = {}) => {
  const rows = [];
  rows[0] = row({ A: opts.athlete || 'Walker Gaines', AW: opts.teamCell ?? 'MBB' });
  rows[2] = row({ AW: "Fall 26'" });
  rows[4] = row({ A: 'Band Pull Apart (2x 10)\nPogo 10+5 (1x)', T: 'POGO SERIES' });
  rows[9] = row({ A: opts.d1 || '10/5/2026', H: 'Set/Reps', N: 'Wt', Q: 'Tempo', T: opts.d2 || '10/6/2026', AA: 'Set/Reps', AD: '%', AG: 'Wt', AJ: 'Tempo' });
  rows[10] = row({ A: '1A', B: 'BARBELL ROW', H: '4', N: '115', T: '1A', U: 'POWER CLEAN HIGH PULL\n+ POWER CLEAN', AA: '2+1', AG: '95' });
  rows[11] = row({ H: '4', N: '115', AA: '2+1' });
  rows[12] = row({ H: 'Rep Out (6)', N: '120', AA: '2+1' });
  rows[19] = row({ A: '1B', B: 'OFF SET PUSH UP', H: '3x 8 ea', T: '1B', U: 'MB DEAD BUG', AA: '3x 5' });
  rows[23] = row({ A: '1C', B: 'SIDE PLANK', H: '3x 20s ea', T: '1C', U: 'SL CALF RAISE' });
  rows[28] = row({ A: '2A', B: 'BENCH PRESS', H: '2', K: '70%', N: '90', T: '2A', U: 'FRONT SQUAT', AA: '2', AD: '75%', AG: '100' });
  rows[29] = row({ H: '2', K: '75%', N: '100', Q: 'Add 5 to 10', AA: '2', AD: '80%', AG: '110', AJ: 'X2XX' });
  rows[37] = row({ A: '2B', B: 'CHIN UP\n(ADD WT)', H: '4x 4', Q: '5XXX', T: '2B', U: 'CURTSY LUNGE', AA: '3x 6 ea', AG: '30 MIN' });
  rows[46] = row({ A: '3A', B: 'Group Core:\n1-3 Rounds (Depends On Time)\nFlutter Kicks: 30 sec\nHallow Holds: 30 sec', T: '3', U: 'FLY 10 + 10' });
  return Array.from(rows, x => x || []);
};
const c1 = card();
check('detected as a weekly card (not a weekly grid)', isWeekCard(c1) && !isGrid(c1));
const p1 = parseWeekCard(c1, { tab: 'SH_10.12.26', teams: ['Football', 'General', 'MBB', 'WSOC'] });
check('the tab name wins over the stale dates on the card (10/5 -> 10/12), with a note', p1.weekStart === '2026-10-12' && p1.days.map(d => d.date).join() === '2026-10-12,2026-10-13' && /week of 10\/5 - using the week in the tab name \(10\/12\)/.test(p1.warnings.map(w => w.message).join()), JSON.stringify([p1.weekStart, p1.days.map(d => d.date), p1.warnings]));
check('team from the card (MBB), season title "Fall 26", group prefix "SH"', p1.team === 'MBB' && p1.title === 'Fall 26' && p1.prefix === 'SH', JSON.stringify([p1.team, p1.title, p1.prefix]));
const d1 = p1.days[0], d2 = p1.days[1];
check('warm-up lines per day', d1.warm.join('|') === 'Band Pull Apart (2x 10)|Pogo 10+5 (1x)' && d2.warm.join() === 'POGO SERIES');
const row1 = d1.blocks.find(b => b.name === 'BARBELL ROW');
check('one row per set: 4 / 4 / Rep Out (6) -> "6+"; the athlete\'s weights are not copied', row1.sets.map(s => s.reps).join() === '4,4,6+' && !JSON.stringify(row1).includes('115'), JSON.stringify(row1));
const bench = d1.blocks.find(b => b.name === 'BENCH PRESS');
check('unlabelled % column read (70%, 75%) -> % of Bench; tempo-column note kept', bench.maxKey === 'bench' && bench.sets.map(s => s.pct).join() === '70,75' && bench.note === 'Add 5 to 10', JSON.stringify(bench));
check('"3x 8 ea" stays a text prescription; "(ADD WT)" becomes a note; tempo kept', d1.blocks.find(b => b.name === 'OFF SET PUSH UP').rx === '3x 8 ea' && d1.blocks.find(b => b.name === 'CHIN UP').note === 'ADD WT' && d1.blocks.find(b => b.name === 'CHIN UP').rx === '4x 4 · tempo 5XXX');
check('two-line names joined; complex reps "2+1" kept', d2.blocks[0].name === 'POWER CLEAN HIGH PULL + POWER CLEAN' && d2.blocks[0].sets.map(s => s.reps).join() === '2+1,2+1,2+1');
check('day 2: labelled % (75/80) -> % of squat; written weight "30 MIN" kept as a note', d2.blocks.find(b => b.name === 'FRONT SQUAT').sets.map(s => `${s.reps}@${s.pct}${s.tempo}`).join() === '2@75,2@80X2XX' && d2.blocks.find(b => b.name === 'CURTSY LUNGE').note === '30 MIN');
check('a written-out core circuit and a numbered sprint item go to the day\'s extra lines', d1.finTitle === 'Group Core' && d1.fin.length === 3 && d2.fin.join() === 'FLY 10 + 10' && !d1.blocks.some(b => /core/i.test(b.name)) && !d2.blocks.some(b => /fly/i.test(b.name)), JSON.stringify([d1.finTitle, d1.fin, d2.fin]));
const k1 = cardCounts(p1);
check('counts: 2 days, 10 exercises, 26 sets', k1.days === 2 && k1.ex === 10 && k1.sets === 26, JSON.stringify(k1));
const c2 = card({ d1: '10/19/2026', d2: '10/20/2026', teamCell: '' });
const p2 = parseWeekCard(c2, { tab: 'SH_10.19.26', teams: ['MBB', 'WSOC'] });
check('matching dates: no note; no team on this tab', p2.warnings.length === 0 && p2.team === '' && p2.weekStart === '2026-10-19');
const ws = parseWeekCard(card({ d1: '10/5/2026', d2: '10/7/2026', teamCell: '', athlete: 'Abby Tibbs' }), { tab: 'WSOC_10.5.260', teams: ['MBB', 'WSOC'] });
check('team from the tab name ("WSOC_10.5.260"); "260" read as 2026', ws.team === 'WSOC' && ws.weekStart === '2026-10-05', JSON.stringify([ws.team, ws.weekStart]));
const groups = cardGroups([p2, ws, p1]);
check('grouped by tab prefix; a group takes the team found on any of its tabs; weeks sorted', groups.length === 2 && groups[0].prefix === 'SH' && groups[0].team === 'MBB' && groups[0].name === 'MBB Fall 26' && groups[0].cards.map(c => c.weekStart).join() === '2026-10-12,2026-10-19' && groups[1].team === 'WSOC', JSON.stringify(groups.map(g => [g.prefix, g.team, g.name, g.cards.map(c => c.weekStart)])));
check('week numbers count from the first tab (a week off keeps its number)', weekNo('2026-08-17', '2026-09-28') === 7 && weekNo('2026-08-17', '2026-08-17') === 1);
const progs = weekCardPrograms(groups, { opts: { SH: { name: 'MBB FALL 26', team: 'MBB' } }, phases: { 'SH_10.19.26': 'Strength' }, archived: true, liftTypes: ['Bench', 'Squat', 'Hang Clean'], now: new Date('2026-10-28T12:00:00Z') });
const s19 = progs.find(p => p.week_label === 'Week 2' && p.sport === 'MBB');
check('programs: one per tab, named per group, week labels, phase, archived, max map', progs.length === 3 && s19 && s19.name === 'MBB FALL 26' && s19.phase === 'Strength' && s19.archived_at === '2026-10-28T12:00:00.000Z' && s19.max_map.bench === 'Bench' && progs.find(p => p.sport === 'WSOC').week_label === 'Week 1', JSON.stringify(progs.map(p => [p.name, p.week_label, p.sport, p.phase])));
check('each program gets its own ids (tabs built from the same card don\'t share)', new Set(progs.flatMap(p => p.days.map(d => d.id))).size === progs.reduce((n, p) => n + p.days.length, 0));
const only = weekCardPrograms(groups, { picked: new Set(['WSOC_10.5.260']) });
check('unticked tabs are left out', only.length === 1 && only[0].sport === 'WSOC');
const [w12] = bucketize(sessionsFrom(progs, { sport: 'MBB', from: '2026-10-12', to: '2026-10-18' }).sessions, 'week');
check('imported week in the overview: 26 sets, front squat + bench intensity', w12.sets === 26 && w12.sessions === 2 && Math.round(w12.avg) === 75, JSON.stringify({ sets: w12.sets, reps: w12.reps, avg: w12.avg }));
check('a sheet without Set/Reps day headers is not a weekly card', !isWeekCard([['Name', 'Front Squat'], ['Abby', '115']]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Run with:  node tests/program-grid.js   (no browser needed)
// v5.11.0 weekly-grid program sheets (Day sections down, weeks across) - modeled on the
// coach's WSOC FALL 26 sheet (Weeks 10-13, Days 1-3) as Google Sheets exports it to CSV.
import { register } from 'node:module';
register('./lib/src-resolve.mjs', import.meta.url);
const { toCsv, parseCsv } = await import('../src/features/programs/programCsv.js');
const { isGrid, parseGrid, buildGridPrograms, exerciseForWeek, weekDate, gridTemplateCsv, dayChoices } = await import('../src/features/programs/programGrid.js');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const W = (a, b, c, d) => [a, b, c, d].flatMap(x => x || ['', '', '', '']);
const blank = ['', '', ...W()];
const dayHead = (d) => [`Day ${d}`, '', 'Week 10 (10/26)', '', '', '', 'Week 11 (11/2)', '', '', '', 'Week 12 (11/9)', '', '', '', 'Week 13 (11/16)', '', '', ''];
const sub = ['', '', ...Array(4).fill(['Set/ Rep', '%', 'WT', 'Tempo']).flat()];
const ex = (code, name, weeks, writeIns = 1) => [[code, name, ...W(...weeks)], ...Array(writeIns).fill(blank)];
const rounds = [['2 Rounds', '', '', ''], ['2 Rounds', '', '', ''], ['3 Rounds', '', '', ''], ['3 Rounds', '', '', '']];
const rows = [
  ['Abby Tibbs', '', 'Exercise', 'Front Squat', 'Bench Press', 'Back Squat', 'PC', 'Fly 10', 'Vert', '', '', 'WSOC FALL 26'],
  ['', '', 'Personal Best', '115', '85', '140', '115', '1.35', '15.1'],
  [],
  dayHead(1), sub,
  ...ex('1a', 'Power Clean\nWk10: 3s @ Mid Shin\nWk11: 3s @ Mid Shin and Knee\nWk12: 1 Trace + 1 Pull + 1 Catch\nWk13: Full Clean', [['3x 4', '', '65-85', 'X3XX'], ['3x 3', '', '70-90', 'X3XX'], ['3x 2', '', '75-95', ''], ['4x 2', '', '80-105', '']], 3),
  ['1b', 'Dynamic Copenhagen', ...W(['2x 5 ea', '', 'BW', ''], ['2x 5 ea', '', 'BW', ''], ['2x 6 ea', '', 'BW', ''], ['2x 6 ea', '', 'BW', ''])],
  ['', '', ...W(null, ['', 'w', '', ''])],
  ...ex('1c', 'SL Glute Bridge', [['2x 10 ea', '', '', ''], ['2x 10 ea', '', '', ''], ['2x 10 ea', '', '', ''], ['2x 10 ea', '', '', '']]),
  ...ex('2a', 'RDL', [['6x 4', '', '95', '4XXX'], ['7x 3', 'add 10 from last week', '', '3XXX'], ['5x 4', 'add 10 from last week', '', '3XXX'], ['4x 4', 'add 10 from last week', '', '']], 3),
  ...ex('2b', 'Rear Foot Elevated Split Squat\n(Weight is each hand)', [['2x 10 ea', '20%', '30', ''], ['3x 5 ea', '35%', '50', ''], ['2x 12 ea', '25%', '35', ''], ['3x 4 ea', '40%', '55', '']]),
  ...ex('2c', 'Red Band A-Pos. Palloff', [['2x 15s ea', '', '', ''], ['2x 20s ea', '', '', ''], ['2x 25s ea', '', '', ''], ['2x 30s ea', '', '', '']]),
  ...ex('3', 'Week 1 and 2 (2 Rounds), 3&4 (3 Rounds)\n40 Flutter Kicks\n20 Toe Touches\n10 Superman', rounds, 2),
  [],
  dayHead(2), sub,
  ...ex('1a', 'Chin Up\nWk 10-12: ECC\nWk 13: 2 Pos. ISO (TOP and MID)', [['3x 3', '', '', '4XXX'], ['3x 3', '', '', '5XXX'], ['3x 3', '', '', '6XXX'], ['3x 3', '', '', 'X5XX']], 3),
  ...ex('1b', 'Wk10: Perfect Push Up\nWk 11: Deficeit Push Up\nWk 12-13: DB Bench', [['3x 3', '', '', ''], ['3x 4', '', '', ''], ['3x 5', '40%', '35', ''], ['3x 5', '50%', '45', '']]),
  ...ex('1c', 'Purple Band Face Pull', [null, null, null, null]),
  ...ex('2a', 'Military Press\n(Add 10 LBS from the final weight you hit the week before)', [['5x 5', '', '45.0', '5XXX'], ['5x 4', 'add 10 from last week', '', '5XXX'], ['5x 3', 'add 10 from last week', '', 'X3XX'], ['5x 2', 'add 10 from last week', '', 'X3XX']], 3),
  ...ex('2b', 'Ring Rows', [['3x 12', '', '', '2XXX'], ['3x 12', '', '', '2XXX'], ['3x 12', '', '', '2XXX'], ['3x 12', '', '', '2XXX']]),
  ...ex('2c', 'T-Raise', [['3x 5', '', '', ''], ['3x 5', '', '', ''], ['3x 5', '', '', ''], ['3x 5', '', '', '']]),
  ...ex('3', 'Week 1 and 2 (2 Rounds), 3&4 (3 Rounds)\n40 Russian Twist\n20 Shoulder Taps\n10 ea Side Plank with Twist', rounds, 2),
  [],
  dayHead(3), sub,
  ...ex('1a', 'Hang Clean\nWk10: Pause High Pull + Pause Clean\nWk11: High Pull + Pause Clean\nWk12: Pocket Clean\nWk13: Clean', [['3x 3', '', '65-80', ''], ['3x 3', '', '70-90', ''], ['3x 3', '', '75-95', ''], ['3x 3', '', '80-105', '']], 3),
  ...ex('1b', 'Wk10: Depth Drops\nWk11: Depth Drops + Vertical\nWk 12: Depth Drops + Cont. Hops\nWk 13: Depth Drop + Broad Jump', [['3x 3', '', '', ''], ['3x 3', '', '', ''], ['', '3x 4', '', ''], ['3x 2', '', '', '']], 3),
  ...ex('2a', 'Back Squat\n(Perfect Sets = add 5 or 10 lbs)', [['6x 4', '60%', '85', 'X4XX'], ['7x 3', '64%', '90', 'X4XX'], ['5x 4', '68%', '95', 'X3XX'], ['4x 4', '72%', '100', 'X3XX']], 3),
  ...ex('2b', 'Partner Nordic ISO', [['2x 15s', '', '', ''], ['2x 20s', '', '', ''], ['2x 25s', '', '', ''], ['2x 30s', '', '', '']]),
  ...ex('2c', 'Band Clamshells', [['2x 15 ea', '', '', ''], ['2x 15 ea', '', '', ''], ['2x 15 ea', '', '', ''], ['2x 15 ea', '', '', '']]),
  ...ex('3', 'Week 1 and 2 (2 Rounds), 3&4 (3 Rounds)\n40 Mountain Climbers\n20 Crunches\n10 Leg Raises', rounds, 2),
];
const csvRows = parseCsv(toCsv(rows)); // exactly what the upload reads
const today = new Date('2026-10-28T12:00:00');
const teams = ['Football', 'WSOC', 'Volleyball'];

check('helpers: per-week exercise cell', JSON.stringify(exerciseForWeek('Power Clean\nWk10: 3s @ Mid Shin\nWk11: Knee', 11)) === JSON.stringify({ name: 'Power Clean', note: 'Knee' }) && exerciseForWeek('Wk10: Perfect Push Up\nWk 12-13: DB Bench', 13).name === 'DB Bench' && exerciseForWeek('Military Press\n(Add 10 LBS)', 10).note === 'Add 10 LBS');
check('helpers: "10/26" -> nearest year; full dates as written', weekDate('10/26', today) === '2026-10-26' && weekDate('1/4', today) === '2027-01-04' && weekDate('10/26/2025', today) === '2025-10-26' && weekDate('', today) === '');
check('detects the weekly-grid layout (and not the row-per-set template)', isGrid(csvRows) && !isGrid(parseCsv('Program,Week,Exercise\nA,Week 1,Squat')));
const g = parseGrid(csvRows, { teams, today });
check('reads 4 weeks with dates and 3 days', g.weeks.map(w => `${w.label} ${w.date}`).join() === 'Week 10 2026-10-26,Week 11 2026-11-02,Week 12 2026-11-09,Week 13 2026-11-16' && g.days.length === 3 && g.days.map(d => d.exercises.length).join() === '7,7,6', JSON.stringify(g.days.map(d => d.exercises.length)));
check('guesses program name and team from the title', g.guess.name === 'WSOC FALL 26' && g.guess.team === 'WSOC', JSON.stringify(g.guess));
const { programs, warnings } = buildGridPrograms(g, { name: g.guess.name, team: g.guess.team, liftTypes: ['Bench', 'Squat', 'Hang Clean', 'Trap Bar Deadlift'] });
check('one program per week, team set, no warnings', programs.length === 4 && programs.every(p => p.name === 'WSOC FALL 26' && p.sport === 'WSOC') && programs.map(p => p.week_label).join() === 'Week 10,Week 11,Week 12,Week 13' && warnings.length === 0, JSON.stringify(warnings));
const [w10, w11, w12, w13] = programs;
check('days default to Mon / Wed / Fri of each week', w10.days.map(d => d.date).join() === '2026-10-26,2026-10-28,2026-10-30' && w13.days[2].date === '2026-11-20');
const b = (p, d, code) => p.days[d].blocks.find(x => x.code === code);
check('Power Clean: per-week cue as note, weights kept as written', b(w10, 0, '1a').name === 'Power Clean' && b(w10, 0, '1a').note === '3s @ Mid Shin' && b(w10, 0, '1a').rx === '3x 4 · @ 65-85 lb · tempo X3XX' && b(w12, 0, '1a').note === '1 Trace + 1 Pull + 1 Catch', `${b(w10, 0, '1a').note} | ${b(w10, 0, '1a').rx}`);
check('BW / each / seconds kept as text', b(w10, 0, '1b').rx === '2x 5 ea · @ BW' && b(w11, 0, '2c').rx === '2x 20s ea' && b(w10, 2, '2b').rx === '2x 15s');
check('stray write-in value ignored (Copenhagen week 11)', b(w11, 0, '1b').rx === '2x 5 ea · @ BW');
check('RDL: fixed weight, then "add 10 from last week"', b(w10, 0, '2a').rx === '6x 4 · @ 95 lb · tempo 4XXX' && b(w11, 0, '2a').rx === '7x 3 · add 10 from last week · tempo 3XXX');
const rfess = b(w10, 0, '2b');
check('% of a lift -> set-by-set with working weights (RFE split squat 20% of squat)', rfess.maxKey === 'squat' && rfess.sets.length === 2 && rfess.sets[0].reps === '10 ea' && rfess.sets[0].pct === '20' && rfess.note === 'Weight is each hand', JSON.stringify(rfess));
const bs = b(w10, 2, '2a');
check('Back Squat week 10: 6 sets × 4 @ 60%, tempo X4XX; week 13: 4 × 4 @ 72%', bs.maxKey === 'squat' && bs.sets.length === 6 && bs.sets.every(s => s.reps === '4' && s.pct === '60' && s.tempo === 'X4XX') && b(w13, 2, '2a').sets.length === 4 && b(w13, 2, '2a').sets[0].pct === '72');
check('week-specific exercise names (Push Up -> DB Bench with % of bench)', b(w10, 1, '1b').name === 'Perfect Push Up' && b(w11, 1, '1b').name === 'Deficeit Push Up' && b(w12, 1, '1b').name === 'DB Bench' && b(w12, 1, '1b').maxKey === 'bench' && b(w12, 1, '1b').sets[0].pct === '40');
check('Chin Up: note per week range; tempo kept', b(w10, 1, '1a').note === 'ECC' && b(w13, 1, '1a').note === '2 Pos. ISO (TOP and MID)' && b(w10, 1, '1a').rx === '3x 3 · tempo 4XXX');
check('Military Press: 45 lb week 10, progression text after', b(w10, 1, '2a').rx === '5x 5 · @ 45 lb · tempo 5XXX' && /add 10 from last week/.test(b(w12, 1, '2a').rx) && /final weight/.test(b(w10, 1, '2a').note));
check('exercise with nothing prescribed still listed (Face Pull)', b(w10, 1, '1c').name === 'Purple Band Face Pull' && b(w10, 1, '1c').rx === '');
check('set/rep typed in the % column is still read (Depth Drops week 12)', b(w12, 2, '1b').rx === '3x 4' && b(w12, 2, '1b').name === 'Depth Drops + Cont. Hops');
check('section 3 core circuit -> finisher lines with rounds per week', w10.days[0].finTitle === 'Finisher · 2 Rounds' && w12.days[0].finTitle === 'Finisher · 3 Rounds' && JSON.stringify(w10.days[0].fin) === JSON.stringify(['40 Flutter Kicks', '20 Toe Touches', '10 Superman']) && w10.days[0].blocks.every(x => x.code !== '3'));
const off = buildGridPrograms(g, { name: 'X', team: 'WSOC', dayOffsets: [1, 3, 4] });
check('training days can be changed (Tue / Thu / Fri)', off.programs[0].days.map(d => d.date).join() === '2026-10-27,2026-10-29,2026-10-30');
check('day choices are named from the first week\'s date', dayChoices('2026-10-26').slice(0, 3).map(x => x.label).join() === 'Mon,Tue,Wed');
const t = parseCsv(gridTemplateCsv());
const tg = parseGrid(t, { teams, today });
const tp = buildGridPrograms(tg, { name: tg.guess.name, team: tg.guess.team, phase: tg.guess.phase });
check('grid template reads back: 4 weeks, 2 days, name/phase rows, circuit title', isGrid(t) && tp.programs.length === 4 && tp.programs[0].days.length === 2 && tg.guess.name === 'Fall Block' && tg.guess.phase === 'Strength' && tp.programs[0].days[0].finTitle === 'Core · 2 Rounds' && tp.programs[2].days[0].blocks[0].sets.length === 4 && tp.programs[2].days[0].blocks[0].note === 'Full', JSON.stringify([tg.guess, tp.programs[0].days[0].finTitle, tp.warnings]));
check('no-date week headers are flagged', parseGrid(parseCsv('Day 1,,Week 1,,\n,,Set/Rep,%\n1a,Squat,3x 5,70%'), {}).warnings.some(w => /no date/.test(w.message)));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

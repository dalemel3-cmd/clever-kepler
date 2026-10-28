// Run with:  node tests/program-csv.js   (no browser needed)
// v5.11.0 program template / import / export (docs/HANDOFF.md §137).
import { register } from 'node:module';
register('./lib/src-resolve.mjs', import.meta.url);
const { parseCsv, toCsv, rowsToPrograms, programsToRows, templateCsv, parseDate, maxKeyFor } = await import('../src/features/programs/programCsv.js');
const { sampleProgram } = await import('../src/features/programs/programData.js');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const lifts = ['Bench', 'Squat', 'Hang Clean', 'Trap Bar Deadlift'];

// CSV basics
const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""",3\n"multi\nline",,\n');
check('CSV: BOM, quotes, commas, doubled quotes, line breaks in quotes', JSON.stringify(rows) === JSON.stringify([['a', 'b', 'c'], ['x, y', 'say "hi"', '3'], ['multi\nline', '', '']]), JSON.stringify(rows));
check('CSV: semicolon files (European Excel)', JSON.stringify(parseCsv('Program;Exercise\nA;Squat')) === JSON.stringify([['Program', 'Exercise'], ['A', 'Squat']]));
check('CSV round trip', JSON.stringify(parseCsv(toCsv(rows))) === JSON.stringify(rows));
check('dates: ISO, M/D/YYYY, M/D/YY, bad', parseDate('2026-9-1') === '2026-09-01' && parseDate('9/1/2026') === '2026-09-01' && parseDate('9/1/26') === '2026-09-01' && parseDate('Sept 1') === null && parseDate('') === '');
check('"% of": keys, labels, lift names, unknown', maxKeyFor('squat') === 'squat' && maxKeyFor('TBDL') === 'dl' && maxKeyFor('Hang Clean') === 'clean' && maxKeyFor('Bench Press') === 'bench' && maxKeyFor('Push Press') === 'ohp' && maxKeyFor('') === '' && maxKeyFor('Curl') === null);

// Template -> import gives back the sample
const sample = sampleProgram(lifts);
sample.days[0].date = '2026-09-01'; sample.days[1].date = '2026-09-03'; sample.week_label = 'Week 1';
const t = templateCsv(sample);
const back = rowsToPrograms(parseCsv(t), { liftTypes: lifts, teams: ['Football'] });
check('template imports cleanly (comment lines skipped, no warnings)', back.programs.length === 1 && back.warnings.length === 0, JSON.stringify(back.warnings));
const p = back.programs[0];
const blocks = (d) => d.blocks.map(b => `${b.code} ${b.name} ${b.maxKey} ${b.sets.map(s => `${s.reps}@${s.pct}${s.tempo ? ':' + s.tempo : ''}`).join(',')}${b.rx ? ' rx:' + b.rx : ''}`);
check('round trip keeps days, dates, focus', p.days.length === 2 && p.days[0].date === '2026-09-01' && p.days[1].focus === 'Upper + Total' && p.name === sample.name && p.week_label === 'Week 1');
check('round trip keeps every block, set, %, tempo and text prescription', JSON.stringify(blocks(p.days[0])) === JSON.stringify(blocks(sample.days[0])) && JSON.stringify(blocks(p.days[1])) === JSON.stringify(blocks(sample.days[1])), JSON.stringify(blocks(p.days[0])));
check('round trip keeps warm-up / finisher titles and lines', p.days[0].warmTitle === 'Warm-Up (2 Rounds)' && p.days[0].warm.length === 4 && p.days[1].finTitle === 'Finisher (4 Minutes)' && p.days[1].fin.length === 3);
check('round trip keeps notes and velocity', p.days[0].blocks[0].note === 'Above knee' && p.days[0].blocks[0].velocity === '1.9–2.1');
check('imported programs map maxes to Lift Tracker lifts', p.max_map.squat === 'Squat' && p.max_map.clean === 'Hang Clean' && p.max_map.window === 'all');
check('new ids (never overwrites an existing program)', p.id !== sample.id && p.days[0].id !== sample.days[0].id);

// Coach-style sheet: blanks under the first cell, two weeks, Day numbers without dates
const csv = [
  'Program,Week,Phase,Team,Date,Day,Focus,Section,Code,Exercise,Note,% of,Set,Reps,%,Tempo,Prescription,Velocity',
  'Fall Block,Week 1,Accumulation,Football,9/7/2026,1,Lower,Warm-up,,Pogos x 10,,,,,,,,',
  ',,,,,,,,1a,Back Squat,,Squat,1,5,70,,,',
  ',,,,,,,,,,,,2,5,75,,,',
  ',,,,,,,,1b,Box Jump,,,,,,,3x 3,',
  ',,,,9/9/2026,2,Upper,,1a,Bench,,Bench,1,5,72,,,',
  ',,,,,,,Core,,Plank x 30s,,,,,,,,',
  'Fall Block,Week 2,Intensification,Football,,1,Lower,,1a,Back Squat,,Squat,1,3,82,,,',
  ',,,,,2,Upper,,1a,Bench,,Bench,1,3,85,,,',
  'Fall Block,Week 2,,Hockey,,3,,,1a,Curl,,Biceps,1,10,60,,,',
].join('\n');
const r2 = rowsToPrograms(parseCsv(csv), { liftTypes: lifts, teams: ['Football', 'Volleyball'] });
check('two weeks -> two programs', r2.programs.length === 2 && r2.programs.map(x => x.week_label).join() === 'Week 1,Week 2');
const w1 = r2.programs[0], w2 = r2.programs[1];
check('blank cells carry down within a program; sets join their exercise', w1.days.length === 2 && w1.days[0].blocks[0].sets.length === 2 && w1.days[0].blocks[0].sets[1].pct === '75' && w1.days[0].blocks[1].rx === '3x 3' && w1.days[0].warm[0] === 'Pogos x 10', JSON.stringify(w1.days[0].blocks));
check('day 2 focus and finisher', w1.days[1].focus === 'Upper' && w1.days[1].finTitle === 'Core' && w1.days[1].fin[0] === 'Plank x 30s' && w1.days[1].date === '2026-09-09');
check('week 2: Day numbers without dates make separate days; date not carried from week 1', w2.days.length === 3 && w2.days.every(d => d.date === '') && w2.days[0].blocks[0].sets[0].pct === '82' && w2.phase === 'Intensification', JSON.stringify(w2.days.map(d => [d.date, d.focus])));
check('warnings name the row: other team in the same program, unknown "% of", % with no lift', r2.warnings.some(w => w.row === 10 && /Hockey/.test(w.message)) && r2.warnings.some(w => w.row === 10 && /Biceps/.test(w.message)) && r2.warnings.some(w => w.row === 10 && /no "% of" lift/.test(w.message)), JSON.stringify(r2.warnings));
const r3 = rowsToPrograms(parseCsv('Program,Week,Team,Exercise,Set,Reps\nSpring,Week 1,Hockey,Squat,1,5'), { teams: ['Football'] });
check('a team that isn\'t in the app is flagged', r3.warnings.some(w => w.row === 2 && /isn't a team in the app/.test(w.message)), JSON.stringify(r3.warnings));
check('missing columns -> clear message', /Missing the Program or Exercise column/.test(rowsToPrograms(parseCsv('A,B\n1,2')).warnings[0]?.message || ''));
check('export -> import round trip of the coach sheet', JSON.stringify(rowsToPrograms(programsToRows(r2.programs), { liftTypes: lifts }).programs.map(x => x.days.map(blocks))) === JSON.stringify(r2.programs.map(x => x.days.map(blocks))));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

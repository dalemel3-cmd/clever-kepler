// Run with:  node tests/plyomat-import.js
// No browser and no server needed - plyomatImport.js is pure, so it is tested directly.
//
// These probes exist because every one of them corresponds to something that was
// actually wrong in the real Plyomat export, or to a bug this module already shipped
// once. Each case is annotated with which.
import {
  parseCsv, parseMetric, parseGroups, similarity, matchAthlete,
  buildImportPlan, extractSessionIds, sessionNote,
  FUZZY_THRESHOLD, REVIEW_THRESHOLD,
} from '../src/features/analytics/plyomatImport.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};
const eq = (name, actual, expected) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);

console.log('\n[A] CSV parsing survives what Plyomat actually emits');
{
  // Real shape: UTF-8 BOM on the first header, and a quoted local timestamp whose
  // comma would split the row in the wrong place under a naive split(',').
  const csv = '﻿Captured At (ISO),Captured At (Local),Athlete First Name\n'
            + '2026-09-01T20:25:32.797+00:00,"9/1/26, 3:25 PM",Calloway\n';
  const rows = parseCsv(csv);
  check('BOM stripped from the first header', Object.keys(rows[0])[0] === 'Captured At (ISO)', Object.keys(rows[0])[0]);
  eq('quoted comma does not split the row', rows[0]['Captured At (Local)'], '9/1/26, 3:25 PM');
  eq('field after the quoted one still aligns', rows[0]['Athlete First Name'], 'Calloway');

  const esc = parseCsv('a,b\n"say ""hi""",2\n');
  eq('escaped double-quotes decode', esc[0].a, 'say "hi"');
  eq('blank lines are dropped', parseCsv('a,b\n1,2\n\n').length, 1);
}

console.log('\n[B] Values carry their units inline');
{
  eq('inches', parseMetric('25.31 in'), { value: 25.31, unit: 'in' });
  eq('unitless RSI', parseMetric('2.34'), { value: 2.34, unit: '' });
  eq('ft-lb with a middot', parseMetric('127.7 ft·lb'), { value: 127.7, unit: 'ft·lb' });
  eq('blank is null, not 0', parseMetric(''), null);
  // parseFloat('-') is NaN but parseFloat('-5abc') is -5; a bare dash must not become a number.
  eq('a lone dash is null', parseMetric('-'), null);
  eq('non-numeric text is null', parseMetric('n/a'), null);
}

console.log('\n[C] Athlete Groups carry sport AND graduating class, mixed together');
{
  eq('simple sport with the SH suffix', parseGroups('Football SH').sport, 'Football');
  eq('BASE means Baseball', parseGroups('BASE').sport, 'Baseball');
  const j = parseGroups('Junior / WSOC');
  eq('grade parsed out of a mixed group', j.grade, '11th');
  eq('sport parsed out of the same group', j.sport, 'WSOC');
  // Plyomat spells it "Sophmore". Match the file, not the dictionary.
  eq("Plyomat's own spelling of Sophmore", parseGroups('Sophmore / WSOC').grade, '10th');
  // athletes.sport is single-valued, so a multi-sport group takes the first listed.
  eq('multi-sport takes the first sport', parseGroups('Freshmen / Volleyball SH / WSOC').sport, 'Volleyball');
  eq('...and still finds the grade', parseGroups('Freshmen / Volleyball SH / WSOC').grade, '9th');
  check('Coaches flagged as not-an-athlete', parseGroups('Coaches').isNonAthlete);
  check('a real sport is not flagged as non-athlete', !parseGroups('Football SH').isNonAthlete);
}

console.log('\n[D] Name similarity - the bug that would have duplicated real athletes');
{
  // This is the case that shipped broken: a greedy subsequence ratio scored the
  // roster's "Charlorte" against Plyomat's "Charlotte" below 0.8, which would have
  // created a second athlete record for a person already on the roster.
  const s = similarity('charlotte velazquez', 'charlorte velazquez');
  check(`transposed pair scores >= ${FUZZY_THRESHOLD} (got ${s.toFixed(3)})`, s >= FUZZY_THRESHOLD, String(s));
  check('one dropped letter scores high', similarity('olivia wilson', 'oliva wilson') >= FUZZY_THRESHOLD);
  check('genuinely different names score low', similarity('connor clark', 'clark mcdonnel') < REVIEW_THRESHOLD + 0.05);
}

console.log('\n[E] Matching: link the certain, hold the ambiguous, never guess');
{
  const roster = [
    { id: 'r1', name: 'Charlorte Velazquez', sport: 'WSOC' },
    { id: 'r2', name: 'Sarah Copp', sport: 'WSOC' },
    { id: 'r3', name: 'JAKE BODENSTEIN', sport: 'Football' },
    { id: 'r4', name: 'ALEKSANDR KELLEY', sport: 'Football' },
  ];
  eq('exact match ignores case', matchAthlete('aleksandr kelley', roster).confidence, 'exact');
  // Plyomat has First/Last transposed for a handful of people.
  eq('reversed columns still match', matchAthlete('Copp Sarah', roster).confidence, 'reversed');
  eq('one-typo name auto-links', matchAthlete('Charlotte Velazquez', roster).confidence, 'fuzzy');

  // Rylee and Katy Bodenstein are real people in the export and are NOT Jake. Auto-
  // linking on surname alone would file a sibling's jumps under the wrong athlete.
  const sib = matchAthlete('Rylee Bodenstein', roster);
  eq('a sibling surname is held for review, not linked', sib.confidence, 'review');
  check('...and an unrelated name matches nothing at all', matchAthlete('Zzz Qqq', roster) === null);
}

console.log('\n[F] The plan: nothing is silently dropped');
{
  const hdr = 'Captured At (ISO),Athlete First Name,Athlete Last Name,Athlete Groups,Protocol,Primary Metric,Best,Best of Kept,Session ID';
  const csv = [hdr,
    // on the roster, clean
    '2026-09-01T20:00:00Z,ALEKSANDR,KELLEY,Football SH,Standing Vertical Jump,Jump Height,25.31 in,25.31 in,s1',
    // not on the roster -> becomes a create, with sport+grade from the group
    '2026-09-01T20:01:00Z,Brand,New,Junior / WSOC,Standing Vertical Jump,Jump Height,20.00 in,20.00 in,s2',
    // a coach, not an athlete
    '2026-09-01T20:02:00Z,Mason,Melancon,Coaches,Standing Vertical Jump,Jump Height,30.00 in,30.00 in,s3',
    // a metric with no home in performance_tests - reported, not coerced
    '2026-09-01T20:03:00Z,Power,Guy,Football SH,Load Power Profile,PPS,127.7 ft·lb,127.7 ft·lb,s4',
    // no usable number
    '2026-09-01T20:04:00Z,Blank,Value,Football SH,Standing Vertical Jump,Jump Height,,,s5',
    // ambiguous against the roster
    '2026-09-01T20:05:00Z,Rylee,Bodenstein,Football SH,Standing Vertical Jump,Jump Height,22.00 in,22.00 in,s6',
  ].join('\n');
  const roster = [
    { id: 'r4', name: 'ALEKSANDR KELLEY', sport: 'Football' },
    { id: 'r3', name: 'JAKE BODENSTEIN', sport: 'Football' },
  ];
  const p = buildImportPlan(csv, roster, {});

  eq('every row is accounted for somewhere',
    p.tests.length + p.newAthletes.reduce(() => 0, 0) + p.skipped.length + p.unsupported.length + p.summary.rowsAwaitingReview,
    6 - 0);
  eq('two rows import (roster hit + new athlete)', p.tests.length, 2);
  eq('one athlete gets created', p.newAthletes.length, 1);
  eq('the created athlete carries the sport from its group', p.newAthletes[0].sport, 'WSOC');
  eq('...and the grade too', p.newAthletes[0].grade, '11th');
  eq('the coach row is skipped', p.skipped.filter(s => /not a roster group/.test(s.reason)).length, 1);
  eq('PPS is reported unsupported, not imported', p.unsupported.length, 1);
  eq('...and it names the metric it could not place', p.unsupported[0].metric, 'PPS');
  eq('the valueless row is skipped', p.skipped.filter(s => /no usable value/.test(s.reason)).length, 1);
  eq('the ambiguous name awaits review', p.needsReview.length, 1);
  check('nothing ambiguous leaked into the import', !p.tests.some(t => /bodenstein/i.test(t.athlete_name)));

  // A review item has to carry its rows, or answering "same person" in the UI would
  // resolve the question and still import nothing - the decision would have no rows
  // left to apply to. This shipped broken once.
  eq('review item carries its rows, not just a count', p.needsReview[0].rows.length, p.needsReview[0].rowCount);
  check('...and those rows are complete enough to write',
    p.needsReview[0].rows.every(r => r.test_type && r.metric > 0 && r.created_at),
    JSON.stringify(p.needsReview[0].rows[0]));

  console.log('\n[G] Re-importing the same file is a no-op, not a doubling');
  const already = p.tests.map(t => ({ notes: t.notes }));
  const second = buildImportPlan(csv, roster, { existingTests: already });
  eq('previously imported rows become duplicates', second.summary.duplicates, 2);
  eq('...and none of them import again', second.tests.length, 0);
  eq('session id round-trips through notes', [...extractSessionIds([{ notes: sessionNote('abc') }])], ['abc']);
}

console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);

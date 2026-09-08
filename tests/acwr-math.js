// Run with:  node tests/acwr-math.js
// Pure unit test - no browser, no server, no database.
//
// The acute:chronic workload ratio decides whether an athlete gets a load-spike alert,
// and it used to be implemented twice (Alerts in App.jsx, and the athlete profile card)
// with the two copies disagreeing. These probes pin the arithmetic itself so a future
// edit to one screen can't silently re-fork it.
import { computeAcuteChronicLoad } from '../src/utils/athleteData.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};
const near = (a, b, eps = 0.001) => a != null && Math.abs(a - b) < eps;

const NOW = new Date('2026-09-08T12:00:00Z').getTime();
const daysAgo = (d) => new Date(NOW - d * 864e5).toISOString();
// One session per day for `days` days back, constant RPE and duration.
const sessions = (days, rpe, minutes) =>
  Array.from({ length: days }, (_, i) => ({ rpe, session_minutes: minutes, created_at: daysAgo(i) }));

console.log('\n[A] Steady load over a full chronic window reads as ~1.0, not a spike');
{
  // 28 days of identical sessions: last 7 days vs the weekly average of 28 days.
  const r = computeAcuteChronicLoad(sessions(28, 5, 60), { chronicWeeks: 4, trackDuration: true, now: NOW });
  check('acute load is 7 sessions x 300', r.acuteLoad === 7 * 300, String(r.acuteLoad));
  check('chronic weekly average is also 7 x 300', near(r.chronicAvgWeeklyLoad, 2100, 1), String(r.chronicAvgWeeklyLoad));
  check('ratio is ~1.0 (steady training is not a spike)', near(r.ratio, 1.0, 0.05), String(r.ratio));
}

console.log('\n[B] A real doubling of load reads as ~2.0');
{
  // 21 days at RPE 4, then the last 7 days at RPE 8 - exactly double.
  const older = Array.from({ length: 21 }, (_, i) => ({ rpe: 4, session_minutes: 60, created_at: daysAgo(i + 7) }));
  const recent = Array.from({ length: 7 }, (_, i) => ({ rpe: 8, session_minutes: 60, created_at: daysAgo(i) }));
  const r = computeAcuteChronicLoad([...older, ...recent], { chronicWeeks: 4, trackDuration: true, now: NOW });
  check('ratio flags the doubling (>1.3 spike threshold)', r.ratio > 1.3, String(r.ratio));
  check('ratio is ~1.6, not an inflated 6x', near(r.ratio, 1.6, 0.1), String(r.ratio));
}

console.log('\n[C] A short history is divided by the weeks actually trained, not the full window');
{
  // Exactly 2 weeks of history. Dividing by the configured 4 weeks (the bug the profile
  // card had) halves the chronic average and doubles the ratio to a false ~2.0 spike.
  const r = computeAcuteChronicLoad(sessions(14, 5, 60), { chronicWeeks: 4, trackDuration: true, now: NOW });
  check('ratio stays ~1.0 for steady training in week 2', near(r.ratio, 1.0, 0.1), String(r.ratio));
  check('ratio is NOT the ~2.0 a full-window divisor would produce', r.ratio < 1.3, String(r.ratio));
  check('weeksOfHistory reflects the real 2 weeks', near(r.weeksOfHistory, 2, 0.1), String(r.weeksOfHistory));
}

console.log('\n[D] Under two weeks of history there is no chronic baseline, so no ratio');
{
  const r = computeAcuteChronicLoad(sessions(5, 9, 90), { chronicWeeks: 4, trackDuration: true, now: NOW });
  check('ratio is null, not a fabricated number', r.ratio === null, String(r.ratio));
  check('acute load is still reported', r.acuteLoad > 0, String(r.acuteLoad));
}

console.log('\n[E] With duration tracking OFF the ratio still works (RPE alone, never 0)');
{
  // session_minutes is null when the program does not track duration. Multiplying by it
  // zeroed every load and made the profile card show "--" while Alerts showed a spike.
  const logs = sessions(28, 5, null);
  const off = computeAcuteChronicLoad(logs, { chronicWeeks: 4, trackDuration: false, now: NOW });
  check('acute load is non-zero without minutes', off.acuteLoad === 35, String(off.acuteLoad));
  check('ratio is a real number, not null/NaN', near(off.ratio, 1.0, 0.05), String(off.ratio));

  const on = computeAcuteChronicLoad(logs, { chronicWeeks: 4, trackDuration: true, now: NOW });
  check('with duration ON and no minutes recorded, load is honestly 0', on.acuteLoad === 0, String(on.acuteLoad));
  check('...and no ratio is claimed', on.ratio === null, String(on.ratio));
}

console.log('\n[F] Degenerate inputs do not produce NaN or throw');
{
  const empty = computeAcuteChronicLoad([], { chronicWeeks: 4, now: NOW });
  check('no logs -> null ratio', empty.ratio === null);
  check('no logs -> 0 acute load, not NaN', empty.acuteLoad === 0);

  const junk = computeAcuteChronicLoad(
    [{ rpe: null, session_minutes: 'abc', created_at: 'not-a-date' }, { rpe: 7, session_minutes: 60, created_at: daysAgo(1) }],
    { chronicWeeks: 4, trackDuration: true, now: NOW }
  );
  check('unparsable rows are skipped rather than poisoning the sum', Number.isFinite(junk.acuteLoad), String(junk.acuteLoad));
  check('acute load counts only the valid row', junk.acuteLoad === 420, String(junk.acuteLoad));
}

console.log('\n[G] Chronic window setting is honoured');
{
  const wide = computeAcuteChronicLoad(sessions(56, 5, 60), { chronicWeeks: 8, trackDuration: true, now: NOW });
  check('an 8-week window averages over 8 weeks', near(wide.chronicAvgWeeklyLoad, 2100, 1), String(wide.chronicAvgWeeklyLoad));
  check('steady load over 8 weeks still reads ~1.0', near(wide.ratio, 1.0, 0.05), String(wide.ratio));
}

console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);

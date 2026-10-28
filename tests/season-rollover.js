// Run with:  node tests/season-rollover.js   (no browser needed)
// v5.10.1: the season start rolls forward a year at a time on the same month/day, so
// "This season" stays right every year without anyone editing Settings.
import { rollSeasonStart, normalizeSettings } from '../src/settings.js';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const r = (d, t) => rollSeasonStart(d, t);
check('this season: left as entered', r('2026-08-03', '2026-10-28') === '2026-08-03', r('2026-08-03', '2026-10-28'));
check('the day before a year is up: unchanged', r('2026-08-03', '2027-08-02') === '2026-08-03');
check('a year later: rolls to 2027-08-03', r('2026-08-03', '2027-08-03') === '2027-08-03');
check('several years later: the latest one', r('2026-08-03', '2030-01-15') === '2029-08-03', r('2026-08-03', '2030-01-15'));
check('a future date is left alone', r('2027-08-03', '2026-10-28') === '2027-08-03');
check('bad values pass through', r('', '2027-09-01') === '' && r('Aug 3', '2027-09-01') === 'Aug 3' && r(undefined) === undefined);
check('normalizeSettings applies it', /^\d{4}-08-03$/.test(normalizeSettings({ seasonStartDate: '2020-08-03' }).seasonStartDate) && normalizeSettings({ seasonStartDate: '2020-08-03' }).seasonStartDate !== '2020-08-03');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

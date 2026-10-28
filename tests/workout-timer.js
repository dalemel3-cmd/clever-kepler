// Run with:  node tests/workout-timer.js   (no browser needed)
// v5.11.1: the rack tablet's workout timer stops at a cap (60 min by default, Settings >
// Lift Tracker > Workout Timer Stops At) so a workout nobody finished doesn't keep counting.
import { register } from 'node:module';
register('./lib/src-resolve.mjs', import.meta.url);
const { elapsedMinutes, timerCapped, capOf } = await import('../src/features/programs/workoutSession.js');
const { normalizeSettings, DEFAULT_SETTINGS } = await import('../src/settings.js');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const NOW = Date.UTC(2026, 9, 28, 15, 0);
const ago = (min) => NOW - min * 60000;

check('default cap is 60 min', DEFAULT_SETTINGS.workoutTimerCapMin === 60 && capOf(undefined) === 60);
check('40 min in: 40', elapsedMinutes(ago(40), NOW) === 40);
check('3 hours in: stops at 60', elapsedMinutes(ago(180), NOW) === 60, String(elapsedMinutes(ago(180), NOW)));
check('just opened: 1, not 0', elapsedMinutes(ago(0), NOW) === 1);
check('a 90 min cap: 75 stays 75, 3 hours stops at 90', elapsedMinutes(ago(75), NOW, 90) === 75 && elapsedMinutes(ago(180), NOW, 90) === 90);
check('capped flag: off before the cap, on at it', !timerCapped(ago(59), NOW) && timerCapped(ago(60), NOW) && timerCapped(ago(500), NOW));
check('a bad cap falls back to 60', elapsedMinutes(ago(180), NOW, 0) === 60 && elapsedMinutes(ago(180), NOW, 'x') === 60);
check('Settings keeps the cap between 10 and 240', normalizeSettings({ workoutTimerCapMin: 5 }).workoutTimerCapMin === 10 && normalizeSettings({ workoutTimerCapMin: 999 }).workoutTimerCapMin === 240 && normalizeSettings({ workoutTimerCapMin: 'abc' }).workoutTimerCapMin === 60 && normalizeSettings({ workoutTimerCapMin: 90 }).workoutTimerCapMin === 90);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

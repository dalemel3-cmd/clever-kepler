// Run with:  node tests/rpe-dashboard.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// The dashboard's Session Load panel shows every team at once as a grid of cards
// (v4.37.0 - previously one team at a time via a dropdown, and before that one card
// per sport all visible - this restores the all-visible layout with a coach-facing
// reskin, on top of the same underlying per-team math). These probes cover each
// team's own card and the response-rate arithmetic: rate counts athletes who
// reported, not rows filed, so an athlete rating both a lift and a run in one day
// must not push a sport past 100%.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const nowIso = () => new Date().toISOString();

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

// Two sports. Football: 2 athletes, one of whom logs TWICE today (lift + run).
// Volleyball: 2 athletes, neither logs. Wrestling: 1 athlete, logs one hard session.
const athletes = [
  { id: uuid(1), name: 'Fb One', sport: 'Football', team: 'Varsity', grade: '11th', position: 'QB' },
  { id: uuid(2), name: 'Fb Two', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' },
  { id: uuid(3), name: 'Vb One', sport: 'Volleyball', team: 'Varsity', grade: '10th', position: 'OH' },
  { id: uuid(4), name: 'Vb Two', sport: 'Volleyball', team: 'Varsity', grade: '10th', position: 'MB' },
  { id: uuid(5), name: 'Wr One', sport: 'Wrestling', team: 'Varsity', grade: '12th', position: '145' },
];
const rpe = (id, ath, name, sport, val, label) => ({
  id: uuid(id), athlete_id: ath, athlete_name: name, sport, weight_lbs: 0, sleep_hrs: 0,
  rpe: val, session_minutes: 60, session_label: label, session_type: 'rpe',
  created_at: nowIso(), is_baseline: false,
});
const logs = [
  rpe(101, uuid(1), 'Fb One', 'Football', 4, 'Lift'),
  rpe(102, uuid(1), 'Fb One', 'Football', 6, 'Run'),   // same athlete, second session today
  rpe(103, uuid(5), 'Wr One', 'Wrestling', 9, 'Combined'), // hard session
];

const SEED = { enableRpe: true, rpeTrackDuration: true, rpeScaleMax: 10, rpeHighThreshold: 8 };

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), SEED);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2200);

  // Internal Load Metrics is always expanded (v4.38.4) - no click needed before
  // these probes look for its contents.
  const cardFor = (sport) => page.locator(`[data-testid="rpe-sport-card"][data-sport="${sport}"]`);

  console.log('\n[A] Session Load shows every team at once as a grid, not one at a time');
  check('exactly 3 team cards rendered (Football, Volleyball, Wrestling)', (await page.locator('[data-testid="rpe-sport-card"]').count()) === 3);
  check('Football card is present', (await cardFor('Football').count()) === 1);
  check('Volleyball card is present (a sport with no logs still gets a card)', (await cardFor('Volleyball').count()) === 1);
  check('Wrestling card is present', (await cardFor('Wrestling').count()) === 1);

  console.log('\n[B] Per-sport numbers are right, read straight off each team\'s own card');
  const football = await cardFor('Football').innerText();
  check('card carries a TEAM AVG RPE label', /TEAM AVG RPE/i.test(football));
  check('card carries a LOG RESPONSE RATE label', /LOG RESPONSE RATE/i.test(football));
  // Football: 2 logs from 1 of 2 athletes -> 50%, avg (4+6)/2 = 5.0
  check('Football avg is 5.0 / 10', /5\.0\s*\/\s*10/.test(football), football.replace(/\n/g, ' | '));
  check('Football response rate is 50%', /50%/.test(football));
  check('Football counts 2 sessions logged', /2 Sessions Logged/i.test(football));

  const volleyball = await cardFor('Volleyball').innerText();
  // Volleyball logged nothing: an em dash rather than a fake 0.0 average.
  check('Volleyball avg reads as no data, not 0.0', /—\s*\/\s*10/.test(volleyball), volleyball.replace(/\n/g, ' | '));
  check('Volleyball response rate is 0%', /0%/.test(volleyball));
  check('Volleyball reports 0/2 athletes', /0\/2 athletes/i.test(volleyball));
  check('Volleyball shows "No Data" instead of a fabricated load label', /No Data/i.test(volleyball), volleyball.replace(/\n/g, ' | '));

  const wrestling = await cardFor('Wrestling').innerText();
  check('Wrestling flagged as hard', /1 HARD/i.test(wrestling), wrestling.replace(/\n/g, ' | '));
  check('Wrestling avg is 9.0', /9\.0\s*\/\s*10/.test(wrestling));
  check('Wrestling correctly reads 100% (1 of 1)', /100%/.test(wrestling));

  console.log('\n[C] Response rate counts athletes, not rows (panel-wide roll-up)');
  const text = await page.locator('body').innerText();
  const loadPanel = text.slice(
    text.indexOf('TODAY\'S INTERNAL TRAINING LOAD'),
    text.indexOf('SESSION ACCOUNTABILITY TRACKER') > 0 ? text.indexOf('SESSION ACCOUNTABILITY TRACKER') : undefined
  );
  // 2 of 5 athletes reported = 40%. Counting the 3 log rows would give 60%.
  check('header roll-up reports 2 of 5', /2 of 5 REPORTED/i.test(loadPanel),
    (loadPanel.match(/TODAY'S INTERNAL TRAINING LOAD[\s\S]{0,120}/) || [''])[0].replace(/\n/g, ' | '));
  check('header roll-up rate is 40%, not 60%', /40%/.test(loadPanel) && !/60%/.test(loadPanel));

  console.log('\n[D] Clicking a team\'s card navigates to that team\'s roster');
  await cardFor('Football').click();
  await page.waitForTimeout(600);
  // innerText() reflects the roster card's CSS text-transform: uppercase, so "Fb One"
  // reads back as "FB ONE" even though the DOM/data still has it mixed-case - match
  // case-insensitively rather than the literal casing.
  const afterClick = await page.locator('body').innerText();
  check('roster is filtered to Football', /Fb One/i.test(afterClick) && !/Vb One/i.test(afterClick),
    'expected only Football athletes visible after the sport filter was applied');

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

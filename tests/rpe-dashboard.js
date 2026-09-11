// Run with:  node tests/rpe-dashboard.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// The dashboard's Session Load panel shows one team at a time, picked from a dropdown
// (v4.22.0 - previously one card per sport, all visible at once). These probes cover
// the dropdown switching between teams and the response-rate arithmetic: rate counts
// athletes who reported, not rows filed, so an athlete rating both a lift and a run in
// one day must not push a sport past 100%.
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

  // Internal Load Metrics is collapsed by default (v4.28.0) to save dashboard space -
  // open it before any of these probes look for its contents.
  await page.getByText('INTERNAL LOAD METRICS').click();
  await page.waitForTimeout(400);

  const teamPicker = page.getByLabel('Team', { exact: true });
  const readCard = async () => page.locator('[data-testid="rpe-sport-card"]').innerText();

  console.log('\n[A] Session Load shows one team at a time, picked from a dropdown');
  check('a Team dropdown exists', (await teamPicker.count()) > 0);
  const options = await teamPicker.locator('option').allTextContents();
  check('Football is an option', options.includes('Football'), options.join(', '));
  check('Volleyball is an option', options.includes('Volleyball'), options.join(', '));
  check('Wrestling is an option (a sport with no logs still gets an entry)', options.includes('Wrestling'), options.join(', '));
  check('exactly one team card rendered at a time', (await page.locator('[data-testid="rpe-sport-card"]').count()) === 1);

  console.log('\n[B] Per-sport numbers are right');
  await teamPicker.selectOption('Football');
  await page.waitForTimeout(300);
  const football = await readCard();
  check('card carries a TEAM AVG RPE label', /TEAM AVG RPE/i.test(football));
  check('card carries a LOG RESPONSE RATE label', /LOG RESPONSE RATE/i.test(football));
  // Football: 2 logs from 1 of 2 athletes -> 50%, avg (4+6)/2 = 5.0
  check('Football avg is 5.0 / 10', /5\.0\s*\/\s*10/.test(football), football.replace(/\n/g, ' | '));
  check('Football response rate is 50%', /50%/.test(football));
  check('Football counts 2 sessions logged', /2 Sessions Logged/i.test(football));

  await teamPicker.selectOption('Volleyball');
  await page.waitForTimeout(300);
  const volleyball = await readCard();
  // Volleyball logged nothing: an em dash rather than a fake 0.0 average.
  check('Volleyball avg reads as no data, not 0.0', /—\s*\/\s*10/.test(volleyball), volleyball.replace(/\n/g, ' | '));
  check('Volleyball response rate is 0%', /0%/.test(volleyball));
  check('Volleyball reports 0/2 athletes', /0\/2 athletes/i.test(volleyball));

  await teamPicker.selectOption('Wrestling');
  await page.waitForTimeout(300);
  const wrestling = await readCard();
  check('Wrestling flagged as hard', /1 HARD/i.test(wrestling), wrestling.replace(/\n/g, ' | '));
  check('Wrestling avg is 9.0', /9\.0\s*\/\s*10/.test(wrestling));
  check('Wrestling correctly reads 100% (1 of 1)', /100%/.test(wrestling));

  console.log('\n[C] Response rate counts athletes, not rows (panel-wide roll-up)');
  const text = await page.locator('body').innerText();
  const loadPanel = text.slice(
    text.indexOf('TODAY\'S SESSION LOAD'),
    text.indexOf('SESSION ACCOUNTABILITY TRACKER') > 0 ? text.indexOf('SESSION ACCOUNTABILITY TRACKER') : undefined
  );
  // 2 of 5 athletes reported = 40%. Counting the 3 log rows would give 60%.
  check('header roll-up reports 2 of 5', /2 of 5 REPORTED/i.test(loadPanel),
    (loadPanel.match(/TODAY'S SESSION LOAD[\s\S]{0,120}/) || [''])[0].replace(/\n/g, ' | '));
  check('header roll-up rate is 40%, not 60%', /40%/.test(loadPanel) && !/60%/.test(loadPanel));

  console.log('\n[D] Clicking the team card navigates to that team\'s roster');
  await teamPicker.selectOption('Football');
  await page.waitForTimeout(300);
  await page.locator('[data-testid="rpe-sport-card"]').click();
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

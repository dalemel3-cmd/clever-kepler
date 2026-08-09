// Run with:  node tests/rpe-dashboard.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// The dashboard's Session Load panel is broken out per sport so each program can be
// read on its own. These probes cover that split and the response-rate arithmetic:
// rate counts athletes who reported, not rows filed, so an athlete rating both a lift
// and a run in one day must not push a sport past 100%.
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
  const text = await page.locator('body').innerText();

  // Isolate the Session Load panel from the weigh-in tracker below it, which uses the
  // same card shape and would otherwise satisfy these matches.
  const loadPanel = text.slice(
    text.indexOf('TODAY\'S SESSION LOAD'),
    text.indexOf('SESSION ACCOUNTABILITY TRACKER') > 0 ? text.indexOf('SESSION ACCOUNTABILITY TRACKER') : undefined
  );

  console.log('\n[A] Session Load is broken out per sport');
  check('Football card present', /Football/.test(loadPanel));
  check('Volleyball card present', /Volleyball/.test(loadPanel));
  check('Wrestling card present', /Wrestling/.test(loadPanel));
  check('a sport with no logs still gets a card', /NO LOGS/.test(loadPanel),
    'sports without activity vanished instead of showing 0%');

  console.log('\n[B] Per-sport numbers are right');
  // Football: 2 logs from 1 of 2 athletes -> 50%, avg (4+6)/2 = 5.0
  check('Football shows 50% (1 of 2 reported)', /50%\s*\(1\/2\)/.test(loadPanel),
    (loadPanel.match(/Football[\s\S]{0,220}/) || [''])[0].replace(/\n/g, ' | '));
  check('Football averages its two sessions to 5.0', /AVG 5\.0/.test(loadPanel));
  check('Football counts 2 sessions logged', /2 Sessions Logged/.test(loadPanel));
  check('Volleyball shows 0% (0/2)', /0%\s*\(0\/2\)/.test(loadPanel));
  check('Wrestling flagged as hard', /1 hard/.test(loadPanel),
    'an RPE at/above the high threshold was not surfaced on the sport card');

  console.log('\n[C] Response rate counts athletes, not rows');
  // 2 of 5 athletes reported = 40%. Counting the 3 log rows would give 60%.
  const headerRate = (loadPanel.match(/LOG RESPONSE RATE\s*\n?\s*(\d+)%/) || [])[1];
  check('team response rate is 40%, not 60%', headerRate === '40', `got ${headerRate}%`);
  // 100% is legitimate (Wrestling: its one athlete reported). Only above 100 is a bug -
  // which is exactly what dividing rows by athletes used to produce.
  const rates = [...loadPanel.matchAll(/(\d+)%/g)].map(m => Number(m[1]));
  check('no rate exceeds 100%', rates.every(r => r <= 100), `rates seen: ${rates.join(', ')}`);
  check('Wrestling correctly reads 100% (1 of 1)', rates.includes(100));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

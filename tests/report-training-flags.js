// Run with:  node tests/report-training-flags.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.3: Print Report gets a Training Flags section - the RPE / Strength / Jumps &
// Sprints warnings in one list for coaches, scoped by the report's sport and athlete
// filters, with the same numbers the deep-dive tabs show.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = 86400000;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  { id: uuid(1), name: 'Spike Guy', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'Weak Bench', sport: 'Football', team: 'Varsity' },
  { id: uuid(3), name: 'Slow Fly', sport: 'Volleyball', team: 'Varsity' },
  { id: uuid(4), name: 'All Good', sport: 'Football', team: 'Varsity' },
];
let n = 100;
const ago = (d) => new Date(Date.now() - d * DAY - 3600000).toISOString();
const weighIns = [];
for (let d = 8; d < 30; d += 3) weighIns.push({ id: uuid(n++), athlete_id: uuid(1), session_type: 'rpe', rpe: 4, session_minutes: 40, created_at: ago(d) });
for (let d = 0; d < 6; d++) weighIns.push({ id: uuid(n++), athlete_id: uuid(1), session_type: 'rpe', rpe: 9, session_minutes: 90, created_at: ago(d) });
const lifts = [
  { id: uuid(n++), athlete_id: uuid(2), lift_type: 'Bench', weight_lbs: 275, reps: 3, created_at: ago(60) },
  { id: uuid(n++), athlete_id: uuid(2), lift_type: 'Bench', weight_lbs: 205, reps: 3, created_at: ago(3) },
  { id: uuid(n++), athlete_id: uuid(4), lift_type: 'Bench', weight_lbs: 225, reps: 1, created_at: ago(3) },
];
const tests = [
  { id: uuid(n++), athlete_id: uuid(3), test_type: '10yd_fly', test_variant: 'build10_fly10', metric: 1.20, created_at: ago(90) },
  { id: uuid(n++), athlete_id: uuid(3), test_type: '10yd_fly', test_variant: 'build10_fly10', metric: 1.32, created_at: ago(5) },
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  await stubAuth(page);
  await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableRpe: true, enableLiftTracker: true, enableSpeedPower: true })));
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(weighIns) });
    if (url.includes('/rest/v1/lift_logs') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(lifts) });
    if (url.includes('/rest/v1/performance_tests') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(tests) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  console.log('\n[A] Training Flags on the report');
  await page.goto(`${APP}/#reports`); await page.waitForTimeout(3000);
  const sec = page.getByTestId('training-flags');
  check('section present', await sec.count() === 1);
  const txt = await sec.innerText();
  check('RPE load spike listed', /Spike Guy[\s\S]*RPE[\s\S]*Load spike[\s\S]*A:C/.test(txt), txt.replace(/\n/g, ' | '));
  check('lift below PR listed (205x3 = est 226 vs PR 303 = 75%)', /Weak Bench[\s\S]*Bench[\s\S]*75% of PR[\s\S]*Recent best est\. 226 vs PR 303 \(275×3\)/.test(txt), txt.replace(/\n/g, ' | '));
  check('sprint off PB listed (1.32 vs 1.20)', /Slow Fly[\s\S]*10yd Fly[\s\S]*10% off PB[\s\S]*1\.32 sec vs PB 1\.20 sec/.test(txt), txt.replace(/\n/g, ' | '));
  check('athlete with no problems not listed', !/All Good/.test(txt.split('New PRs')[0]));
  check('red flags first', /Load spike|% of PR|off PB/.test(await sec.getByTestId('training-flag-row').first().innerText()));
  check('new PR mentioned as a win', /New PRs \/ PBs[^\n]*All Good Bench 225/.test(txt), txt.slice(-200));

  console.log('\n[B] Follows the report filters');
  await page.locator('select').first().selectOption('Volleyball'); await page.waitForTimeout(500);
  const vb = await page.getByTestId('training-flags').innerText();
  check('sport filter narrows to Volleyball', /Slow Fly/.test(vb) && !/Spike Guy|Weak Bench/.test(vb), vb);

  console.log('\n[C] Custom report can turn it off');
  const custom = page.getByRole('button', { name: /custom/i }).first();
  if (await custom.count()) {
    await custom.click(); await page.waitForTimeout(400);
    const toggle = page.getByText('Training Flags', { exact: true }).first();
    await toggle.click(); await page.waitForTimeout(400);
    check('toggle removes the section', await page.getByTestId('training-flags').count() === 0);
  } else check('custom mode button found', false);

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

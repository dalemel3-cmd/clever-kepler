// Run with:  node tests/analytics-jump-trends.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.21.0: Daily Logging Compliance was removed from Analytics (chart + top tile);
// Recovery (average sleep) took the top tile's place; and a new Team Trend chart
// averages Speed & Power results across the roster per test day, with a technique
// picker for jump types.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  { id: uuid(1), name: 'Athlete One', sport: 'Football', team: 'Varsity', grade: '11th', position: 'WR' },
  { id: uuid(2), name: 'Athlete Two', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' },
];

// Two nights of sleep, 8 and 6 hours -> average 7.0, so the Recovery tile has a real
// number to show rather than the empty-state dash.
const weighIns = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Athlete One', sport: 'Football', weight_lbs: 0, sleep_hrs: 8, rpe: null, session_minutes: null, session_type: null, is_baseline: false, created_at: ago(2) },
  { id: uuid(51), athlete_id: uuid(2), athlete_name: 'Athlete Two', sport: 'Football', weight_lbs: 0, sleep_hrs: 6, rpe: null, session_minutes: null, session_type: null, is_baseline: false, created_at: ago(1) },
];

// Vertical jump under two techniques, so the team trend needs a technique pick before it
// can plot anything - same "don't silently mix two protocols" rule as the leaderboard.
const perfTests = [
  { id: uuid(90), athlete_id: uuid(1), athlete_name: 'Athlete One', sport: 'Football', test_type: 'vertical_jump', test_variant: 'hands_on_hips', metric: 24.0, unit: 'in', source: 'manual', created_at: ago(2) },
  { id: uuid(91), athlete_id: uuid(2), athlete_name: 'Athlete Two', sport: 'Football', test_type: 'vertical_jump', test_variant: 'hands_on_hips', metric: 28.0, unit: 'in', source: 'manual', created_at: ago(2) },
  { id: uuid(92), athlete_id: uuid(1), athlete_name: 'Athlete One', sport: 'Football', test_type: '10yd_fly', test_variant: 'build10_fly10', metric: 1.60, unit: 'sec', source: 'manual', created_at: ago(1) },
];

const newPage = async (browser, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 180)));
  page.errors = errors;
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), { enableSpeedPower: opts.enableSpeedPower !== false });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(opts.weighIns !== undefined ? opts.weighIns : weighIns) });
    if (url.includes('/rest/v1/performance_tests') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(opts.perfTests !== undefined ? opts.perfTests : perfTests) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Daily Logging Compliance is gone; Recovery replaces it as a top tile');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    const body = await page.locator('body').innerText();
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
    check('"Daily Logging Compliance" does not appear anywhere', !/DAILY LOGGING COMPLIANCE/i.test(body));
    check('"Logging Compliance" tile is gone', !/LOGGING COMPLIANCE/i.test(body));
    check('a Recovery tile shows the average sleep', /RECOVERY \(AVG SLEEP\)/i.test(body) && /7\.0 hrs/.test(body),
      body.match(/RECOVERY[\s\S]{0,40}/i)?.[0] || '');
  }

  console.log('\n[B] Off: Speed & Power disabled means no Team Trend chart, but Recovery tile still works');
  {
    const page = await newPage(browser, { enableSpeedPower: false });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    const body = await page.locator('body').innerText();
    check('no Team Trend jump chart when Speed & Power is off', !/AVERAGE VERTICAL JUMP/i.test(body) && !/AVERAGE 10YD FLY/i.test(body));
    check('Recovery tile is unaffected by the Speed & Power flag', /7\.0 hrs/.test(body));
  }

  console.log('\n[C] Team Trend defaults to Fly 10, a single-variant type - plots immediately');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    const body = await page.locator('body').innerText();
    check('defaults to 10yd Fly', /AVERAGE 10YD FLY/i.test(body), body.match(/AVERAGE [A-Z0-9 ]+/i)?.[0] || '');
    check('no technique picker for a single-variant type', (await page.getByLabel('Technique', { exact: true }).count()) === 0);
    const svgs = await page.locator('.recharts-surface').count();
    check('a chart is drawn without picking anything', svgs >= 1, `found ${svgs}`);
  }

  console.log('\n[D] Switching to Vertical Jump requires a technique pick before plotting');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    await page.getByRole('button', { name: 'Vertical Jump' }).first().click();
    await page.waitForTimeout(300);
    let body = await page.locator('body').innerText();
    check('prompts for a technique before plotting anything', /Pick a technique above/i.test(body), body.slice(0, 400));
    await page.getByLabel('Technique', { exact: true }).selectOption('hands_on_hips');
    await page.waitForTimeout(300);
    body = await page.locator('body').innerText();
    check('no longer prompting once a technique is picked', !/Pick a technique above/i.test(body));
    const svgs = await page.locator('.recharts-surface').count();
    check('chart renders after picking the technique', svgs >= 1, `found ${svgs}`);
  }

  console.log('\n[E] An empty technique reads as "no results", not broken');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    await page.getByRole('button', { name: 'Vertical Jump' }).first().click();
    await page.waitForTimeout(300);
    await page.getByLabel('Technique', { exact: true }).selectOption('arm_swing'); // nobody logged this
    await page.waitForTimeout(300);
    const body = await page.locator('body').innerText();
    check('empty-state message, not a crash', /No Vertical Jump results logged in this window/i.test(body), body.slice(0, 400));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

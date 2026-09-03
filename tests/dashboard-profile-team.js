// Run with:  node tests/dashboard-profile-team.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Covers three coach-requested changes in one suite since they share a fixture:
//  1. Dashboard's Session Accountability Tracker is now collapsible, closed by default.
//  2. Profiles roster cards show current weight (+ trend) and best Speed & Power
//     results (Vertical, Fly 10 + trend, Board Jump) instead of "Current Mass" /
//     "Total Records".
//  3. Teams & Rosters (Sport Groups) cards add Avg RPE and Avg Sleep alongside the
//     existing Athletes / Avg Lb tiles.
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
  { id: uuid(1), name: 'Trend Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'WR' },
  { id: uuid(2), name: 'No Weight Athlete', sport: 'Wrestling', team: 'Varsity', grade: '11th', position: 'W' },
];

let li = 100;
const weighIns = [
  // Trend Athlete: 205 -> 200, a 5lb drop that should show as a downward trend.
  { id: uuid(++li), athlete_id: uuid(1), athlete_name: 'Trend Athlete', sport: 'Football', weight_lbs: 205, sleep_hrs: 8, rpe: null, created_at: ago(3), is_baseline: true },
  { id: uuid(++li), athlete_id: uuid(1), athlete_name: 'Trend Athlete', sport: 'Football', weight_lbs: 200, sleep_hrs: 7.5, rpe: null, created_at: ago(1) },
  // Wrestling team: RPE and sleep only, no weight - the case the coach called out.
  { id: uuid(++li), athlete_id: uuid(2), athlete_name: 'No Weight Athlete', sport: 'Wrestling', weight_lbs: 0, sleep_hrs: 6, rpe: 7, session_type: 'rpe', session_minutes: 45, session_label: 'Lift', created_at: ago(1) },
  { id: uuid(++li), athlete_id: uuid(2), athlete_name: 'No Weight Athlete', sport: 'Wrestling', weight_lbs: 0, sleep_hrs: 8, rpe: 9, session_type: 'rpe', session_minutes: 30, session_label: 'Run', created_at: ago(2) },
];

const perfTests = [
  // 10yd fly getting slower (1.60 -> 1.70): trend should read as a decline (up/red).
  { id: uuid(++li), athlete_id: uuid(1), athlete_name: 'Trend Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.60, unit: 'sec', source: 'manual', created_at: ago(5) },
  { id: uuid(++li), athlete_id: uuid(1), athlete_name: 'Trend Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.70, unit: 'sec', source: 'manual', created_at: ago(1) },
  { id: uuid(++li), athlete_id: uuid(1), athlete_name: 'Trend Athlete', sport: 'Football', test_type: 'vertical_jump', metric: 26.5, unit: 'in', source: 'manual', created_at: ago(2) },
  { id: uuid(++li), athlete_id: uuid(1), athlete_name: 'Trend Athlete', sport: 'Football', test_type: 'board_jump', metric: 90, unit: 'in', source: 'manual', created_at: ago(2) },
];

const SEED = { enableRpe: true, enableSpeedPower: true, rpeHighThreshold: 8 };

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 180)));
  page.errors = errors;
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
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(weighIns) });
    if (url.includes('/rest/v1/performance_tests') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(perfTests) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Dashboard: Session Accountability Tracker is collapsed by default and expands');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2200);
    check('header visible', (await page.getByText('SESSION ACCOUNTABILITY TRACKER').count()) > 0);
    // "Daily Compliance" only appears inside this card's per-sport grid - unlike
    // "Athletes Listed", which a different always-visible dashboard panel also uses,
    // so it doesn't give a false pass/fail regardless of collapse state.
    let body = await page.locator('body').innerText();
    check('per-sport detail hidden before expanding', !/Daily Compliance/.test(body), body.match(/.{0,60}Daily Compliance/)?.[0] || '');
    await page.getByText('SESSION ACCOUNTABILITY TRACKER').click();
    await page.waitForTimeout(400);
    body = await page.locator('body').innerText();
    check('per-sport detail visible after expanding', /Daily Compliance/.test(body));
    await page.getByText('SESSION ACCOUNTABILITY TRACKER').click();
    await page.waitForTimeout(400);
    body = await page.locator('body').innerText();
    check('collapses again on second click', !/Daily Compliance/.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Profiles: roster card shows weight trend + best Speed & Power results');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#profiles`); await page.waitForTimeout(2200);
    const body = await page.locator('body').innerText();
    check('current weight shown', /200 lb/.test(body), body.match(/\d+ lb/)?.[0] || '');
    check('weight down-trend shown (205 -> 200, a 5lb drop)', /5\.0/.test(body) && /Current Weight/i.test(body));
    check('Best Vertical tile present with value', /Best Vertical/i.test(body) && /26\.5 in/.test(body));
    check('Best Broad Jump tile present with value', /Best Broad Jump/i.test(body) && /90\.0 in/.test(body));
    check('Best Fly 10 tile present with value', /Best Fly 10/i.test(body) && /1\.60 sec/.test(body));
    // Fly times got slower (1.60 -> 1.70): a 6.25% decline should read as an increase.
    check('Fly 10 trend shows a decline (%), not silently omitted', /6%/.test(body), body.match(/Best Fly 10[\s\S]{0,40}/)?.[0] || '');
    check('"Current Mass" / "Total Records" labels are gone', !/Current Mass/.test(body) && !/Total Records/.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Teams & Rosters: RPE and Sleep shown alongside Athletes/Avg Lb');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#groups`); await page.waitForTimeout(2200);
    const body = await page.locator('body').innerText();
    check('AVG LB metric still present', /AVG LB/.test(body));
    check('AVG RPE metric present (RPE enabled)', /AVG RPE/.test(body));
    check('AVG SLEEP metric present', /AVG SLEEP/.test(body));
    // Wrestling never logs weight, only RPE/sleep - it must not show a permanent "--"
    // on every metric, which is exactly the case the coach flagged.
    const wrestlingCardText = (body.match(/WRESTLING[\s\S]{0,400}/) || [''])[0];
    check('Wrestling (no weight) still shows a real Avg RPE / Avg Sleep value', /8\.0|7\.0|8|7/.test(wrestlingCardText) && !/AVG RPE\s*\n?\s*--\s*\n?\s*AVG RPE/.test(wrestlingCardText),
      wrestlingCardText.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

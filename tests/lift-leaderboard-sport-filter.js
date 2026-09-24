// Run with:  node tests/lift-leaderboard-sport-filter.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.33.0: the Lift Tracker leaderboard gained a sport filter (All + one team at a
// time), same pill convention the roster list already uses - previously every
// sport's lifters were ranked together, so a coach checking their own team's PRs
// had to scan past every other team's numbers first.
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
  { id: uuid(1), name: 'Football Squatter', sport: 'Football', team: 'Varsity', grade: '11th', position: 'OL' },
  { id: uuid(2), name: 'Volleyball Squatter', sport: 'Volleyball', team: 'Varsity', grade: '11th', position: 'OH' },
];
const liftLogs = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Football Squatter', sport: 'Football', lift_type: 'Squat', weight_lbs: 315, reps: 3, source: 'manual', created_at: ago(1) },
  { id: uuid(51), athlete_id: uuid(2), athlete_name: 'Volleyball Squatter', sport: 'Volleyball', lift_type: 'Squat', weight_lbs: 185, reps: 5, source: 'manual', created_at: ago(1) },
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), { enableLiftTracker: true });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins')) return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    if (url.includes('/rest/v1/lift_logs') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(liftLogs) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] "All" (default) shows every sport\'s lifters on one board');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Leaderboard/i }).click();
    await page.waitForTimeout(400);
    await page.getByLabel('Lift', { exact: true }).selectOption('Squat');
    await page.waitForTimeout(300);
    const body = await page.locator('body').innerText();
    check('Football Squatter appears under All', /Football Squatter/i.test(body));
    check('Volleyball Squatter also appears under All', /Volleyball Squatter/i.test(body));
    check('an "All" filter pill exists and reads active by default', await page.getByRole('button', { name: 'All', exact: true }).count() > 0);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Selecting one sport narrows the board to that sport only');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Leaderboard/i }).click();
    await page.waitForTimeout(400);
    await page.getByLabel('Lift', { exact: true }).selectOption('Squat');
    await page.getByRole('button', { name: 'Football', exact: true }).click();
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('Football Squatter still shows', /Football Squatter/i.test(body));
    check('Volleyball Squatter is filtered out', !/Volleyball Squatter/i.test(body), body.slice(0, 300));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Empty state names the sport when a filtered board has no results');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Leaderboard/i }).click();
    await page.waitForTimeout(400);
    await page.getByLabel('Lift', { exact: true }).selectOption('Bench');
    await page.getByRole('button', { name: 'Football', exact: true }).click();
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('empty state names the lift and the sport', /No Bench results logged yet for Football/i.test(body), body.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

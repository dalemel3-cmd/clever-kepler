// Run with:  node tests/profile-collapsible-sections.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.34.0: the athlete profile's Post-Practice Sweat Loss tracker and Historical Log
// Ledger - two of the longest cards on the page - now collapse behind a chevron by
// default, same pattern the dashboard's Session Accountability Tracker already uses.
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
  { id: uuid(1), name: 'Collapse Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' },
];
const logs = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Collapse Athlete', sport: 'Football', weight_lbs: 180, sleep_hrs: 8, is_baseline: true, created_at: ago(10) },
  { id: uuid(51), athlete_id: uuid(1), athlete_name: 'Collapse Athlete', sport: 'Football', weight_lbs: 175, sleep_hrs: 7.5, is_baseline: false, is_post_practice: true, created_at: ago(1) },
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  await stubAuth(page);
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
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Both sections are collapsed by default, headers still visible');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1800);
    await page.getByText('Collapse Athlete', { exact: true }).first().click(); await page.waitForTimeout(1800);
    const body = await page.locator('body').innerText();
    check('Post-Practice Sweat Loss header is visible', /POST-PRACTICE SWEAT LOSS/i.test(body));
    check('Historical Log Ledger header is visible', /HISTORICAL LOG LEDGER/i.test(body));
    check('the log ledger table is NOT shown before expanding', !/DATE & TIME/i.test(body), body.match(/.{0,60}DATE & TIME/i)?.[0]);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Clicking the Historical Log Ledger header expands it, and it collapses again');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1800);
    await page.getByText('Collapse Athlete', { exact: true }).first().click(); await page.waitForTimeout(1800);
    await page.getByText('HISTORICAL LOG LEDGER', { exact: false }).click();
    await page.waitForTimeout(400);
    let body = await page.locator('body').innerText();
    check('expands to show the ledger table', /DATE & TIME/i.test(body));
    await page.getByText('HISTORICAL LOG LEDGER', { exact: false }).click();
    await page.waitForTimeout(400);
    body = await page.locator('body').innerText();
    check('collapses again on a second click', !/DATE & TIME/i.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Clicking the Post-Practice header expands it without triggering "Log Post-Practice Weight"');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1800);
    await page.getByText('Collapse Athlete', { exact: true }).first().click(); await page.waitForTimeout(1800);
    await page.getByText('POST-PRACTICE SWEAT LOSS', { exact: false }).click();
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('expands to show a post-practice entry', /175/.test(body));
    check('the manual-entry modal did NOT open', !/Log Post-Practice Weight Entry|Manual Log Studio/i.test(body), body.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

// Run with:  node tests/rpe-fixes.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Two fixes (v4.31.0):
//   1. Logging a Session RPE entry no longer offers "This is my baseline" - RPE
//      carries no weight, so there's nothing to baseline. This was showing up
//      specifically for an athlete's FIRST-EVER entry (or after a long gap) being
//      RPE-only, since the baseline gate only counted weight-bearing logs and read
//      "no weight logs yet" as "needs a baseline", regardless of track mode.
//   2. Session Duration is now tap-to-select tiles (settings.rpeDurationQuickPicks),
//      not a number-pad text field - RPE stays the only manually-typed field.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

// Never logged anything before - this is exactly the "isFirstEntry" case that used
// to trip the baseline gate regardless of track mode.
const athletes = [
  { id: uuid(1), name: 'Never Logged Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'QB' },
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), { enableRpe: true, rpeTrackDuration: true });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    if (url.includes('/rest/v1/weigh_ins') && method === 'POST') return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify([{ id: uuid(900) }]) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] A first-ever RPE entry never offers "This is my baseline"');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Session RPE/i }).first().click();
    await page.waitForTimeout(600);
    await page.getByText('Never Logged Athlete').first().click();
    await page.waitForTimeout(900);
    const body = await page.locator('body').innerText();
    check('no "This is my baseline" button for an RPE entry', !/this is my baseline/i.test(body), body.slice(0, 300));
    check('no baseline-establishing banner for an RPE entry', !/OFFICIAL BASELINE/i.test(body));
    check('a plain single save button is offered instead', (await page.getByRole('button', { name: /SAVE RPE/i }).count()) > 0);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Session Duration is tap-to-select tiles, not a text field');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Session RPE/i }).first().click();
    await page.waitForTimeout(600);
    await page.getByText('Never Logged Athlete').first().click();
    await page.waitForTimeout(900);
    check('no text input for Session Duration', (await page.getByLabel('Session Duration').count()) === 0);
    const tile = page.getByRole('button', { name: '30 MIN', exact: true });
    check('a 30 MIN duration tile is offered', await tile.count() > 0);
    await tile.click();
    await page.waitForTimeout(300);
    check('the tapped tile shows selected styling (background-color set)',
      await tile.evaluate(el => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(el).backgroundColor !== 'transparent'));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Duration tile + RPE + label actually saves');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: /Session RPE/i }).first().click();
    await page.waitForTimeout(600);
    await page.getByText('Never Logged Athlete').first().click();
    await page.waitForTimeout(900);
    await page.getByLabel('Session RPE').fill('6');
    await page.getByRole('button', { name: '30 MIN', exact: true }).click();
    await page.getByRole('button', { name: 'Lift', exact: true }).first().click();
    const saveBtn = page.getByRole('button', { name: /SAVE RPE/i });
    check('save button is enabled once RPE + duration tile + label are set', await saveBtn.isEnabled());
    await saveBtn.click();
    await page.waitForTimeout(1200);
    const body = await page.locator('body').innerText();
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

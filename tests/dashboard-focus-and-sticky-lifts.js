// Run with:  node tests/dashboard-focus-and-sticky-lifts.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Covers three v4.28.0 changes:
//   1. The Pre-Session Action Banner no longer has a "Start today's session" heading
//      or subtext ahead of its buttons - a coach glances at the banner to tap a
//      button, and the old copy pushed the buttons down and competed with them.
//   2. Internal Load Metrics collapses behind a chevron (closed by default), the
//      same pattern the Session Accountability Tracker already used.
//   3. The Lift Tracker's search bar and sport filters are pinned with
//      position: sticky so a coach scrolling a long roster on an iPad doesn't have
//      to scroll back to the top to search again or switch tabs.
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

// Enough athletes to make the Lift Tracker roster grid taller than the viewport,
// so a sticky check actually has something to scroll past.
const athletes = Array.from({ length: 24 }, (_, i) => ({
  id: uuid(i + 1), name: `Roster Athlete ${i + 1}`, sport: 'Football', team: 'Varsity', grade: '11th', position: 'WR',
}));

const newPage = async (browser, viewport) => {
  const ctx = await browser.newContext(viewport ? { viewport } : {});
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
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    if (url.includes('/rest/v1/lift_logs') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Pre-Session Action Banner drops the heading/subtext, keeps the buttons');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    check('"Start today\'s session" heading is gone', !/Start today's session/i.test(body));
    check('"Not Yet Weighed In" subtext line is gone', !/Athlete\(s\) Not Yet Weighed In/i.test(body));
    check('a compact status marker still names the pending count', /NOT YET WEIGHED IN/i.test(body));
    check('Start Weigh-Ins button is still present', await page.getByRole('button', { name: /Start Weigh-Ins/i }).count() > 0);
    check('Session RPE button is still present', await page.getByRole('button', { name: /^Session RPE$/i }).count() > 0);
    check('Post-Practice button is still present', await page.getByRole('button', { name: /Post-Practice/i }).count() > 0);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Internal Load Metrics is collapsed by default and expands on click');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2000);
    check('header visible', (await page.getByText('INTERNAL LOAD METRICS').count()) > 0);
    let body = await page.locator('body').innerText();
    check('team cards hidden before expanding', !(await page.locator('[data-testid="rpe-sport-card"]').count()));
    await page.getByText('INTERNAL LOAD METRICS').click();
    await page.waitForTimeout(400);
    check('team cards visible after expanding', (await page.locator('[data-testid="rpe-sport-card"]').count()) > 0);
    await page.getByText('INTERNAL LOAD METRICS').click();
    await page.waitForTimeout(400);
    check('collapses again on a second click', !(await page.locator('[data-testid="rpe-sport-card"]').count()));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Lift Tracker: search bar stays pinned while the roster scrolls (iPad viewport)');
  {
    const page = await newPage(browser, { width: 1024, height: 700 });
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(2000);
    const search = page.getByPlaceholder('Search athlete by name...');
    check('search box is present', await search.count() > 0);
    const before = await search.boundingBox();
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(300);
    const after = await search.boundingBox();
    check('search box is still visible on screen after scrolling', after !== null && after.y >= 0 && after.y < 700, `before y=${before?.y}, after y=${after?.y}`);
    check('search box stayed in the same place while the page scrolled', before !== null && after !== null && Math.abs(before.y - after.y) < 2,
      `before y=${before?.y}, after y=${after?.y}`);
    // A search typed after scrolling should still work without scrolling back up.
    await search.fill('Roster Athlete 20');
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('typing still filters the roster after scrolling', /Roster Athlete 20/.test(body) && !/Roster Athlete 1$/m.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

// Run with:  node tests/entry-perf.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Guards the iPad responsiveness work on the Quick Entry screen. The roster grid is the
// heaviest thing the kiosk renders; before this, every tile was rebuilt on each keystroke,
// lastLoggedWeight rescanned the whole weigh-in table per character, and two full-viewport
// backdrop-filter blurs were recomputed on every modal repaint.
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

// A roster the size of a full athletic department, with real weigh-in history behind it.
const SPORTS = ['Football', 'Volleyball', 'Wrestling', 'Baseball', 'Track & Field'];
const athletes = Array.from({ length: 250 }, (_, i) => ({
  id: uuid(i + 1),
  name: `Athlete${i + 1} Test${i + 1}`,
  sport: SPORTS[i % SPORTS.length],
  team: 'Varsity',
  grade: '11th',
  position: 'ATH',
}));
const logs = [];
let li = 1000;
for (const a of athletes) {
  for (let d = 1; d <= 8; d++) {
    logs.push({
      id: uuid(++li), athlete_id: a.id, athlete_name: a.name, sport: a.sport,
      weight_lbs: 180 + (d % 5), sleep_hrs: 8, rpe: null, session_minutes: null,
      session_label: null, session_type: null, is_baseline: d === 1,
      created_at: new Date(Date.now() - d * 864e5).toISOString(),
    });
  }
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage();
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

  await page.goto(`${APP}/#entry`);
  await page.waitForTimeout(2500);
  console.log(`\n(fixture: ${athletes.length} athletes, ${logs.length} weigh-ins)`);

  console.log('\n[A] Roster grid renders and stays interactive');
  const cardCount = await page.locator('text=TAP TO LOG').count();
  check('roster tiles rendered', cardCount > 0, `found ${cardCount}`);

  // Typing in the search box re-filters the grid. This is the interaction that used to
  // rebuild every tile per character.
  const search = page.getByPlaceholder(/Search athletes/i);
  const t0 = Date.now();
  await search.type('Athlete1', { delay: 0 });
  await page.waitForTimeout(400);
  const searchMs = Date.now() - t0 - 400;
  console.log(`  search typing (8 chars): ~${searchMs}ms`);
  check('search typing stays responsive (<1500ms for 8 chars)', searchMs < 1500, `${searchMs}ms`);
  await search.fill('');
  await page.waitForTimeout(600);

  console.log('\n[B] Weigh-in modal: no live backdrop blur');
  await page.locator('text=TAP TO LOG').first().click();
  await page.waitForTimeout(900);
  // Count every live backdrop-filter, not just full-viewport ones. The overlay is
  // `position: fixed; inset: 0` but sizes to the nearest transformed ancestor
  // (`animate-slide-up`), so a viewport-size threshold silently matched nothing and the
  // check passed against a build that still had the blur.
  const blurs = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => {
    const cs = getComputedStyle(el);
    const bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
    if (!bf || bf === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 200 && r.height > 200; // a real surface, not an icon chip
  }).map(el => `${el.tagName}:${getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter}`));
  check('no backdrop-filter surface behind the weigh-in modal', blurs.length === 0, blurs.join(', '));

  console.log('\n[C] Typing in the modal does not rescan the weigh-in table');
  const weight = page.getByLabel('Body weight (lbs)');
  const t1 = Date.now();
  await weight.type('185.5', { delay: 0 });
  await page.waitForTimeout(300);
  const typeMs = Date.now() - t1 - 300;
  console.log(`  weight typing (5 chars): ~${typeMs}ms`);
  check('weight typing stays responsive (<800ms for 5 chars)', typeMs < 800, `${typeMs}ms`);
  check('typed value landed intact', (await weight.inputValue()) === '185.5', await weight.inputValue());

  // The ghost placeholder is what lastLoggedWeight feeds; prove memoizing kept it correct.
  const ph = await weight.getAttribute('placeholder');
  check('ghost placeholder still shows the last recorded weight', /^\d+(\.\d+)?$/.test(ph || ''), `placeholder="${ph}"`);

  console.log('\n[D] Add-athlete modal: no live backdrop blur either');
  // Reload rather than pressing Escape: the weigh-in modal has no Escape handler, so it
  // stays open and covers the ADD ATHLETE button.
  await page.reload();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: /ADD ATHLETE/i }).first().click();
  await page.waitForTimeout(1000);
  const addOpen = await page.getByText(/NEW ATHLETE PROFILE/i).count();
  check('add-athlete modal opened', addOpen > 0);
  const blurs2 = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => {
    const cs = getComputedStyle(el);
    const bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
    if (!bf || bf === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 200 && r.height > 200;
  }).length);
  check('no backdrop-filter surface behind the add-athlete modal', blurs2 === 0, `${blurs2} blurred surface(s)`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);

  console.log('\n[F] Coach manual-entry modal: no live backdrop blur');
  // This is the one full-screen overlay left in App.jsx that holds text inputs, so it
  // is the one that repaints per keystroke the way the two entry modals did.
  await page.reload();
  await page.waitForTimeout(2000);
  await page.goto(`${APP}/#dashboard`);
  await page.waitForTimeout(1600);
  const manualBtn = page.getByRole('button', { name: /Post-Practice|Manual Log/i }).first();
  if (await manualBtn.count()) {
    await manualBtn.click();
    await page.waitForTimeout(900);
    const blurs3 = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => {
      const cs = getComputedStyle(el);
      const bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
      if (!bf || bf === 'none') return false;
      const r = el.getBoundingClientRect();
      // Threshold on HEIGHT only. Width is unreliable: these overlays are
      // `position: fixed` but size to the nearest transformed ancestor, so a
      // full-screen scrim measured 582px wide behind the sidebar layout and slipped
      // under a 600px width test. Overlays are ~820px tall; the toast chips and
      // pull-to-refresh pill, which keep their blur on purpose, are under 60px.
      return r.height > 300;
    }).length);
    check('no large backdrop-filter surface behind the manual-entry modal', blurs3 === 0, `${blurs3} blurred surface(s)`);
  } else {
    check('manual-entry modal reachable from the dashboard', false, 'button not found');
  }

  console.log('\n[E] No render errors under load');
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.reload();
  await page.waitForTimeout(2000);
  for (let i = 0; i < 5; i++) {
    await page.locator('text=TAP TO LOG').first().click().catch(() => {});
    await page.waitForTimeout(300);
    // Click the overlay itself to dismiss - that is the app's own close affordance.
    await page.mouse.click(8, 8).catch(() => {});
    await page.waitForTimeout(300);
  }
  check('no page errors opening/closing the modal repeatedly', errs.length === 0, errs.join(' | '));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

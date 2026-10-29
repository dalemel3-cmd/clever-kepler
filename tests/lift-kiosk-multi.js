// Run with:  node tests/lift-kiosk-multi.js   (preview on :4173; Supabase stubbed)
// v5.10.2 Lift Kiosk "Select multiple": tap several names to fill the rack in one pass;
// the roster stays open until "Done adding". Remembered. v5.13.0: Done adding doesn't open
// anyone - each athlete opens their own workout by tapping their name in Your Rack.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const athletes = ['Ava Able', 'Ben Baker', 'Cal Cole', 'Dee Dunn', 'Eli Egan'].map((name, i) => ({ id: uuid(i + 1), name, sport: 'Football' }));

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1024, height: 1300 }, serviceWorkers: 'block' })).newPage();
  await stubAuth(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true, liftTypes: ['Bench', 'Squat'] })); } });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins')) return route.fulfill({ status: 200, headers: { ...h, 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: '[]' });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  const kiosk = async () => { await page.goto(`${APP}/#lifts`); await page.waitForTimeout(2000); await page.getByRole('button', { name: 'Activate Lift Kiosk Mode' }).click(); await page.waitForTimeout(1000); };
  const tile = (name) => page.getByTestId('lk-tile').filter({ hasText: name });
  const rackNames = async () => page.getByRole('button', { name: /^Remove .* from your rack$/ }).evaluateAll(bs => bs.map(b => b.getAttribute('aria-label').replace(/^Remove | from your rack$/g, '')));
  const toggle = page.getByTestId('lk-multi-toggle');

  await kiosk();
  check('toggle shows in Lift Kiosk Mode, off by default', await toggle.count() === 1 && (await toggle.getAttribute('aria-checked')) === 'false');
  // Off: one tap opens that athlete and hides the roster (unchanged behaviour).
  await tile('Ava Able').click(); await page.waitForTimeout(400);
  check('off: tapping a name opens them and hides the roster', await page.getByTestId('lk-tile').count() === 0 && JSON.stringify(await rackNames()) === '["Ava Able"]');
  await page.getByRole('button', { name: /Add Another Athlete/ }).click(); await page.waitForTimeout(300);
  check('names already in the rack are marked', (await tile('Ava Able').getAttribute('aria-pressed')) === 'true' && (await tile('Ben Baker').getAttribute('aria-pressed')) === 'false');

  // On: several taps, roster stays open.
  await toggle.click(); await page.waitForTimeout(200);
  check('toggle turns on', (await toggle.getAttribute('aria-checked')) === 'true');
  for (const n of ['Ben Baker', 'Cal Cole', 'Dee Dunn']) { await tile(n).click(); await page.waitForTimeout(150); }
  check('on: each tap adds to the rack and the roster stays open', JSON.stringify(await rackNames()) === '["Ava Able","Ben Baker","Cal Cole","Dee Dunn"]' && await page.getByTestId('lk-tile').count() === 5, JSON.stringify(await rackNames()));
  await tile('Cal Cole').click(); await page.waitForTimeout(150);
  check('tapping a selected name takes it off the rack', JSON.stringify(await rackNames()) === '["Ava Able","Ben Baker","Dee Dunn"]', JSON.stringify(await rackNames()));
  check('Done adding shows the count', /Done adding \(3\)/i.test(await page.getByTestId('lk-done-adding').innerText()));
  await page.getByTestId('lk-done-adding').click(); await page.waitForTimeout(400);
  check('Done adding hides the roster; Ava\'s card stays open', await page.getByTestId('lk-tile').count() === 0 && /AVA ABLE/i.test(await page.locator('.sticky').first().innerText()));

  // Fresh start with the toggle remembered: Done keeps everyone collapsed until they tap their name.
  await page.reload(); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Activate Lift Kiosk Mode' }).click(); await page.waitForTimeout(1000);
  check('toggle remembered on the tablet', (await page.getByTestId('lk-multi-toggle').getAttribute('aria-checked')) === 'true');
  await tile('Eli Egan').click(); await tile('Ben Baker').click(); await page.waitForTimeout(200);
  check('no card opens while selecting', await page.getByRole('button', { name: /Done$/ }).count() === 0);
  await page.getByTestId('lk-done-adding').click(); await page.waitForTimeout(400);
  check('Done adding: the rack shows both names, nobody\'s card opens, "Tap your name"', JSON.stringify(await rackNames()) === '["Eli Egan","Ben Baker"]' && await page.getByRole('button', { name: /Done$/ }).count() === 0 && /Tap your name/i.test(await page.getByTestId('rack-hint').innerText()), JSON.stringify(await rackNames()));
  await page.getByRole('button', { name: /^EE Eli Egan/ }).first().click(); await page.waitForTimeout(400);
  check('tapping a name in Your Rack opens that athlete', /ELI EGAN/i.test(await page.locator('.sticky').first().innerText()) && await page.getByTestId('rack-hint').count() === 0);
  const small = await page.locator('[data-testid="lk-multi-toggle"], [data-testid="lk-done-adding"]').evaluateAll(bs => bs.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).length);
  await page.getByRole('button', { name: /Add Another Athlete/ }).click(); await page.waitForTimeout(300);
  const small2 = await page.locator('[data-testid="lk-multi-toggle"], [data-testid="lk-done-adding"]').evaluateAll(bs => bs.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).length);
  check('toggle and Done are at least 44×44', small === 0 && small2 === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

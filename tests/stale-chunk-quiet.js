// Run with:  node tests/stale-chunk-quiet.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.7: (1) every screen is fetched in the background once the app is idle, so a
// tab open across a deploy already holds them; (2) a "Failed to fetch dynamically
// imported module" the app recovers from by reloading is not written to app_errors -
// (3) but one the reload does NOT fix (a genuinely broken deploy) still is.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const reported = [];
  const newPage = async () => {
    const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
    await stubAuth(page);
    await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true, enableRpe: true, enableSpeedPower: true })));
    await page.route(SUPA, async (route) => {
      const req = route.request(); const url = req.url(); const m = req.method();
      const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
      if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (url.includes('/realtime/')) return route.abort();
      if (isAuthRoute(url)) return fulfillAuth(route, url, h);
      if (url.includes('/rest/v1/app_errors') && m === 'POST') { reported.push(req.postDataJSON()); return route.fulfill({ status: 201, headers: h, body: '[]' }); }
      if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
      return route.fulfill({ status: 200, headers: h, body: '[]' });
    });
    return page;
  };
  const messages = () => reported.map(r => (Array.isArray(r) ? r[0] : r)?.message || '');

  console.log('\n[A] Screens are preloaded in the background');
  let page = await newPage();
  const fetched = new Set();
  page.on('request', r => { const m = r.url().match(/\/assets\/(\w+Screen)-/); if (m) fetched.add(m[1]); });
  await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(9000);
  for (const s of ['SettingsScreen', 'ReportsScreen', 'StrengthScreen', 'PowerScreen', 'RpeScreen', 'EntryScreen', 'ProfilesScreen']) check(`${s} fetched without being opened`, fetched.has(s), [...fetched].join(','));

  console.log('\n[B] A stale screen the reload fixes is not logged');
  page = await newPage();
  // Old deploy's file is gone: the first request for the Settings chunk 404s,
  // the retry after the automatic reload succeeds.
  let settingsHits = 0;
  await page.route(/\/assets\/SettingsScreen-[^/]+\.js$/, r => (settingsHits++ === 0 ? r.fulfill({ status: 404, body: '' }) : r.continue()));
  await page.goto(`${APP}/#settings`); await page.waitForTimeout(4000);
  check('app recovered onto Settings', /SETTINGS/i.test(await page.locator('body').innerText()));
  check('recovered stale-chunk error NOT reported', !messages().some(m => /dynamically imported module/i.test(m)), JSON.stringify(messages()));

  console.log('\n[C] A stale screen the reload does NOT fix is still logged');
  reported.length = 0;
  page = await newPage();
  await page.route(/\/assets\/SettingsScreen-[^/]+\.js$/, r => r.fulfill({ status: 404, body: '' }));
  await page.goto(`${APP}/#settings`); await page.waitForTimeout(5000);
  check('broken deploy reported to app_errors', messages().some(m => /dynamically imported module/i.test(m)), JSON.stringify(messages()));
  check('coach sees the error screen, not a reload loop', /Something went wrong/i.test(await page.locator('body').innerText()));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

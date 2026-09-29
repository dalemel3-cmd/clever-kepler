// Run with:  node tests/boot-fallback.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.2.7: the index.html startup safety net. A normal start must never show the
// fallback; a start whose main script fails must show "didn't finish loading" with a
// Reload button instead of a blank screen, and the failure must be reported to
// app_errors on the next good launch.
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
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await stubAuth(page);
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

  console.log('\n[A] Normal start never shows the fallback');
  let page = await newPage();
  await page.goto(`${APP}/#dashboard`);
  await page.waitForTimeout(11000);
  let body = await page.locator('body').innerText();
  check('app is running (dashboard visible)', /OVERVIEW/i.test(body));
  check('no "didn\'t finish loading" fallback', !/finish loading/i.test(body));

  console.log('\n[B] A failed main script shows a way out, not a blank page');
  page = await newPage();
  await page.route(/\/assets\/index-[^/]+\.js$/, r => r.abort());
  await page.goto(`${APP}/#dashboard`);
  await page.waitForTimeout(600);
  check('shows a loading placeholder immediately, not white', /Loading HPD/i.test(await page.locator('body').innerText()));
  await page.waitForTimeout(10500);
  body = await page.locator('body').innerText();
  check('fallback message appears', /didn.t finish loading/i.test(body), body.slice(0, 120));
  check('Reload button offered', await page.getByRole('button', { name: 'Reload' }).count() === 1);
  const saved = await page.evaluate(() => localStorage.getItem('hpd_boot_errors'));
  check('startup failure remembered for reporting', /Failed to load|did not start/i.test(saved || ''), saved);

  console.log('\n[C] Next good launch reports it, then clears it');
  await page.unroute(/\/assets\/index-[^/]+\.js$/);
  await page.getByRole('button', { name: 'Reload' }).click();
  await page.waitForTimeout(3500);
  check('app recovered after Reload', /OVERVIEW/i.test(await page.locator('body').innerText()));
  check('boot failure reported to app_errors', reported.some(r => (Array.isArray(r) ? r[0] : r)?.source === 'boot'), JSON.stringify(reported).slice(0, 200));
  check('stored boot errors cleared', !(await page.evaluate(() => localStorage.getItem('hpd_boot_errors'))));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

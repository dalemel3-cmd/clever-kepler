// Run with:  node tests/clock-skew-retry.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.4.2: a "JWT issued at future" 401 (device clock slightly behind right after a token
// refresh) is retried instead of leaving the roster empty; any other 401 is not.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const athletes = [{ id: '00000001-0000-4000-8000-000000000001', name: 'Skew Tester', sport: 'Football', team: 'Varsity' }];

async function run(browser, errorBody) {
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  page.athleteHits = 0; page.reported = [];
  await stubAuth(page);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/app_errors') && m === 'POST') { page.reported.push(req.postData()); return route.fulfill({ status: 201, headers: h, body: '[]' }); }
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') {
      if (page.athleteHits++ === 0) return route.fulfill({ status: 401, headers: h, body: JSON.stringify(errorBody) });
      return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  await page.goto(`${APP}/#athletes`); await page.waitForTimeout(5000);
  return page;
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Clock-skew 401 is retried');
  let page = await run(browser, { code: 'PGRST301', message: 'JWT issued at future' });
  check('athletes request retried', page.athleteHits >= 2, String(page.athleteHits));
  check('roster loads (no manual refresh)', /Skew Tester/.test(await page.locator('main').innerText()));
  check('nothing reported to app_errors', !page.reported.some(r => /issued at future/.test(r)), page.reported.join(' | ').slice(0, 200));

  console.log('\n[B] Other 401s are not retried');
  page = await run(browser, { code: 'PGRST301', message: 'JWT expired' });
  const hitsSoonAfterLoad = page.athleteHits;
  check('a non-skew 401 is not retried by the skew guard (1 request at load)', hitsSoonAfterLoad === 1, String(hitsSoonAfterLoad));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

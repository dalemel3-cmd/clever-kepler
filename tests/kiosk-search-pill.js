// Run with:  node tests/kiosk-search-pill.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Typing a name in the kiosk's search used to still render every match as a full-size
// AthleteCard - on an iPad's kiosk viewport a single match looked like its own
// oversized floating box, and often pushed the entry modal's action buttons below the
// fold. A search now collapses matches into compact pills instead (v4.27.0); the full
// card grid is unchanged when the search box is empty.
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

const athletes = [
  { id: uuid(1), name: 'Pill Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'WR' },
  { id: uuid(2), name: 'Other Athlete', sport: 'Baseball', team: 'Varsity', grade: '11th', position: '1B' },
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 } });
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
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Empty search still shows the full card grid');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    const body = await page.locator('body').innerText();
    check('cards show their "TAP TO LOG" affordance', /TAP TO LOG/.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Typing a search collapses matches into pills, not full cards');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await page.getByPlaceholder('Search athletes by name...').fill('Pill');
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('the match appears', /Pill Athlete/.test(body));
    check('the non-matching athlete is filtered out', !/Other Athlete/.test(body));
    check('full-card chrome ("TAP TO LOG") is gone while searching', !/TAP TO LOG/.test(body));
    const pillBtn = page.getByRole('button', { name: /Pill Athlete/i });
    check('the match renders as a single pill button', await pillBtn.count() === 1, `count=${await pillBtn.count()}`);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Clicking a pill opens the entry modal, same as a card');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await page.getByPlaceholder('Search athletes by name...').fill('Pill');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Pill Athlete/i }).click();
    await page.waitForTimeout(700);
    const body = await page.locator('body').innerText();
    check('the entry modal opened for the right athlete', /Pill Athlete/.test(body) && /BODY WEIGHT/i.test(body), body.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[D] No matches still offers the "add athlete" fallback while searching');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await page.getByPlaceholder('Search athletes by name...').fill('Nobody Here');
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('offers to add the searched name', /Add "Nobody Here" & Log Weight/i.test(body), body.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

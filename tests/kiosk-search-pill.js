// Run with:  node tests/kiosk-search-pill.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.35.0: Quick Entry's roster is now grouped by sport and rendered as one consistent
// card grid at all times - search (now behind an icon button that opens an overlay,
// instead of a persistent bar) and the new sport-filter pill row both just narrow that
// same grid, rather than search switching to a separate compact pill-button rendering
// the way it used to (v4.27.0-v4.34.x). AthleteCard also dropped its "TAP TO LOG" text
// pill in favor of a small checkmark badge shown only when an athlete is done.
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

const openSearch = async (page) => {
  await page.locator('[title="Search athletes"]').click();
  await page.waitForTimeout(200);
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Empty search shows the full sport-grouped card grid');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    const body = await page.locator('body').innerText();
    check('Football section header is visible', /FOOTBALL/.test(body));
    check('Baseball section header is visible', /BASEBALL/.test(body));
    check('both athletes appear as cards', /Pill Athlete/.test(body) && /Other Athlete/.test(body));
    check('nobody is logged yet (0 of 2 today)', /0.{0,2}of.{0,2}2.{0,2}today/i.test(body), body.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Typing in the search overlay narrows the same card grid, not a different pill list');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await openSearch(page);
    await page.getByPlaceholder('Search athletes by name...').fill('Pill');
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('the match appears', /Pill Athlete/.test(body));
    check('the non-matching athlete is filtered out', !/Other Athlete/.test(body));
    check('its sport section header is still shown (still a grouped grid, not a pill list)', /FOOTBALL/.test(body));
    const card = page.locator('[data-testid="athlete-card"]');
    check('exactly one card remains', await card.count() === 1, `count=${await card.count()}`);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Clicking a card while searching still opens the entry modal');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await openSearch(page);
    await page.getByPlaceholder('Search athletes by name...').fill('Pill');
    await page.waitForTimeout(400);
    await page.locator('[data-testid="athlete-card"]').first().click();
    await page.waitForTimeout(700);
    const body = await page.locator('body').innerText();
    check('the entry modal opened for the right athlete', /Pill Athlete/.test(body) && /BODY WEIGHT/i.test(body), body.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[D] No matches still offers the "add athlete" fallback while searching');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await openSearch(page);
    await page.getByPlaceholder('Search athletes by name...').fill('Nobody Here');
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('offers to add the searched name', /Add "Nobody Here" & Log Weight/i.test(body), body.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[E] The sport pill row filters the grid independently of search');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: 'Football', exact: true }).click();
    await page.waitForTimeout(400);
    let body = await page.locator('body').innerText();
    check('Football athlete still shows', /Pill Athlete/.test(body));
    check('Baseball athlete is filtered out', !/Other Athlete/.test(body), body.slice(0, 200));
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.waitForTimeout(400);
    body = await page.locator('body').innerText();
    check('"All" restores both athletes', /Pill Athlete/.test(body) && /Other Athlete/.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[F] Closing the search overlay clears the filter');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
    await openSearch(page);
    await page.getByPlaceholder('Search athletes by name...').fill('Pill');
    await page.waitForTimeout(400);
    let body = await page.locator('body').innerText();
    check('narrowed to one match while typing', /Pill Athlete/.test(body) && !/Other Athlete/.test(body));
    // The X button inside the overlay both clears the query and closes the overlay.
    await page.locator('input[placeholder="Search athletes by name..."]').locator('xpath=following-sibling::button').click();
    await page.waitForTimeout(400);
    body = await page.locator('body').innerText();
    check('closing restores the full grid', /Pill Athlete/.test(body) && /Other Athlete/.test(body), body.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

// Run with:  node tests/batch-writes.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.2: team-sized saves go out as ONE request (Speed & Power Team Entry, Lift Team
// Log) instead of one per athlete, and every optimistic row in the batch shows up
// (unique temp ids - they used to collide within one millisecond).
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = 86400000;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  { id: uuid(1), name: 'Ann Adams', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'Ben Brown', sport: 'Football', team: 'Varsity' },
  { id: uuid(3), name: 'Cal Cole', sport: 'Football', team: 'Varsity' },
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const posts = [];
  let hold = null; // lets the test look at the screen before the server answers
  await stubAuth(page);
  await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableSpeedPower: true })));
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/performance_tests') && m === 'POST') {
      const rows = req.postDataJSON(); posts.push(rows);
      if (hold) await hold;
      return route.fulfill({ status: 201, headers: h, body: JSON.stringify(rows.map((r, i) => ({ ...r, id: uuid(700 + i) }))) });
    }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  console.log('\n[A] Speed & Power Team Entry: 3 results, one request');
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'TEAM ENTRY' }).click(); await page.waitForTimeout(300);
  await page.locator('#sp-team-type').selectOption('10yd_fly');
  await page.getByLabel('Ann Adams result in seconds').fill('1.21');
  await page.getByLabel('Ben Brown result in seconds').fill('1.33');
  await page.getByLabel('Cal Cole result in seconds').fill('1.40');
  let release; hold = new Promise(r => { release = r; });
  await page.getByRole('button', { name: /SAVE ALL \(3\)/ }).click(); await page.waitForTimeout(600);
  check('one POST for the whole roster', posts.length === 1 && posts[0].length === 3, JSON.stringify(posts.map(p => p.length)));
  const board = await page.locator('main').innerText();
  check('all 3 shown before the server answers (no temp-id collision)', /1\.21/.test(board) && /1\.33/.test(board) && /1\.40/.test(board), board.slice(0, 300));
  release(); hold = null; await page.waitForTimeout(800);
  check('saved message', /Saved 3 results/.test(await page.locator('main').innerText()));
  const after = await page.locator('main').innerText();
  check('still 3 after server rows replace temp rows', /1\.21/.test(after) && /1\.33/.test(after) && /1\.40/.test(after));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

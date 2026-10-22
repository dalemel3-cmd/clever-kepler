// Run with:  node tests/save-no-refetch.js   (preview on :4173; Supabase stubbed)
// v5.8.1: a kiosk check-in puts its own saved row in place (replacing the optimistic copy)
// instead of re-downloading the whole 30-day window after every save. On 10/19 a busy
// check-in on #entry tripped the weigh-in fetch brake (7 full downloads in a minute).
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const athletes = [1, 2, 3].map(n => ({ id: uuid(n), name: `Saver ${n}`, sport: 'Football', team: 'Varsity' }));

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  const posts = []; const gets = [];
  await stubAuth(page);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (m === 'GET') gets.push(decodeURIComponent(url));
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && m === 'POST') { const b = req.postDataJSON(); const rows = Array.isArray(b) ? b : [b]; posts.push(...rows); return route.fulfill({ status: 201, headers: h, body: JSON.stringify(rows.map((r, i) => ({ ...r, id: uuid(800 + posts.length + i) }))) }); }
    // Row count like PostgREST sends it, so the change probe sees "no change".
    if (url.includes('/rest/v1/weigh_ins')) return route.fulfill({ status: 200, headers: { ...h, 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: '[]' });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  await page.goto(`${APP}/#entry`); await page.waitForTimeout(2000);
  const fullWeighIns = () => gets.filter(u => u.includes('/rest/v1/weigh_ins?') && /select=id,created_at,athlete_id/.test(u)).length;
  const before = fullWeighIns();

  for (const a of athletes) {
    await page.getByText(a.name, { exact: true }).first().click(); await page.waitForTimeout(700);
    await page.getByLabel('Body weight (lbs)').fill('190');
    await page.getByRole('button', { name: /CONFIRM & SYNC ATHLETE/i }).first().click();
    await page.waitForTimeout(2500);
  }

  check('three check-ins saved', posts.length === 3, String(posts.length));
  check('no full 30-day re-download after the saves', fullWeighIns() === before, `before=${before} after=${fullWeighIns()}`);
  const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_reports') || '[]'));
  const mine = rows.filter(r => /^Saver /.test(r.athlete_name || ''));
  check('each check-in shows once', mine.length === 3, JSON.stringify(mine.map(r => r.id)));
  check('optimistic copies replaced by the saved rows (real ids)', mine.every(r => /^0{5}8\d\d-/.test(r.id)), JSON.stringify(mine.map(r => r.id)));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

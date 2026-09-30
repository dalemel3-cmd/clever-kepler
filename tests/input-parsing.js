// Run with:  node tests/input-parsing.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.4 (Postel's law): typed numbers accept how coaches actually type - units,
// spaces, a decimal comma - but never guess: "20O", "1.2.3", "185 kg", "1,850" stay
// invalid. Fixes "1,62" in Team Entry silently saving as 162.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
import { parseDecimalInput, cleanDecimalTyping } from '../src/utils/athleteData.js';

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
];

(async () => {
  console.log('\n[A] Parser');
  const ok = { '185': 185, '185 lbs': 185, '185lb': 185, ' 185.5 ': 185.5, '185,5': 185.5, '1.62s': 1.62, '1.62 sec': 1.62, '24.5 in': 24.5, '24.5"': 24.5, '5 reps': 5, '185#': 185 };
  for (const [k, v] of Object.entries(ok)) check(`"${k}" -> ${v}`, parseDecimalInput(k) === v, String(parseDecimalInput(k)));
  for (const k of ['20O', '1.2.3', '185 kg', '1,850', '', 'lbs', '-5', '1..2']) check(`"${k}" rejected`, Number.isNaN(parseDecimalInput(k)), String(parseDecimalInput(k)));
  check('typing "1,62" keeps the decimal (was 162)', cleanDecimalTyping('1,62') === '1.62');
  check('typing "185 lbs" keeps 185', cleanDecimalTyping('185 lbs') === '185');

  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  const posts = [];
  const existing = [{ id: uuid(80), athlete_id: uuid(1), test_type: '10yd_fly', test_variant: 'build10_fly10', metric: 1.70, created_at: new Date(Date.now() - 20 * 86400000).toISOString() }];
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
    if (url.includes('/rest/v1/performance_tests') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(existing) });
    if (url.includes('/rest/v1/performance_tests') && m === 'POST') { const rows = req.postDataJSON(); posts.push(...rows); return route.fulfill({ status: 201, headers: h, body: JSON.stringify(rows) }); }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  console.log('\n[B] Speed & Power Team Entry with a decimal comma');
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'TEAM ENTRY' }).click(); await page.waitForTimeout(300);
  await page.locator('#sp-team-type').selectOption('10yd_fly');
  await page.getByLabel('Ann Adams result in seconds').pressSequentially('1,62');
  check('field shows 1.62', await page.getByLabel('Ann Adams result in seconds').inputValue() === '1.62');
  await page.getByRole('button', { name: /SAVE ALL \(1\)/ }).click(); await page.waitForTimeout(1000);
  check('peak-end: faster than the 1.70 PB is called out', /1 new PB: Ann\./.test(await page.locator('main').innerText()));
  check('saved 1.62, not 162', posts.length === 1 && posts[0].metric === 1.62, JSON.stringify(posts));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

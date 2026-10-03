// Run with:  node tests/sleep-not-prefilled.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.4.3: the weigh-in kiosk no longer pre-fills 8.0h sleep. Every weigh-in Aug-Oct 2026
// recorded exactly 8.0 because nobody changed the default, so low-sleep alerts could
// never fire. A weigh-in with sleep left blank saves sleep 0 ("not recorded"); one with
// a sleep pick saves that value.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const athletes = [{ id: uuid(1), name: 'Sleep Tester', sport: 'Football', team: 'Varsity' }, { id: uuid(2), name: 'Picker Kid', sport: 'Football', team: 'Varsity' }];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  const posts = [];
  await stubAuth(page);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && m === 'POST') { const b = req.postDataJSON(); const rows = Array.isArray(b) ? b : [b]; posts.push(...rows); return route.fulfill({ status: 201, headers: h, body: JSON.stringify(rows.map((r, i) => ({ ...r, id: uuid(800 + posts.length + i) }))) }); }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  await page.goto(`${APP}/#entry`); await page.waitForTimeout(2000);

  const weighIn = async (name, weight, sleepPick) => {
    await page.getByText(name, { exact: true }).first().click(); await page.waitForTimeout(800);
    await page.getByLabel('Body weight (lbs)').fill(String(weight));
    if (sleepPick) await page.getByRole('button', { name: `${sleepPick}h`, exact: true }).click();
    await page.getByRole('button', { name: /CONFIRM & SYNC ATHLETE/i }).first().click();
    await page.waitForTimeout(3200);
  };

  console.log('\n[A] Sleep is not pre-picked');
  await page.getByText('Sleep Tester', { exact: true }).first().click(); await page.waitForTimeout(800);
  const picked = await page.locator('button.bg-\\[\\#b89c5b\\]').filter({ hasText: /^\d+\.\dh$/ }).count();
  check('no sleep quick-pick selected when the weigh-in opens', picked === 0, String(picked));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  console.log('\n[B] Blank sleep saves as "not recorded"');
  await weighIn('Sleep Tester', 185);
  const a = posts.find(p => p.athlete_name === 'Sleep Tester');
  check('weigh-in saved', a && Number(a.weight_lbs) === 185, JSON.stringify(a));
  check('sleep saved as 0 (not recorded), not 8', a && Number(a.sleep_hrs) === 0, a && String(a.sleep_hrs));

  console.log('\n[C] A picked sleep value is saved');
  await weighIn('Picker Kid', 210, '6.0');
  const b = posts.find(p => p.athlete_name === 'Picker Kid');
  check('sleep 6.0 saved', b && Number(b.sleep_hrs) === 6, b && String(b.sleep_hrs));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

// Run with:  node tests/kiosk-pad-focus.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.4.3: the kiosk number pad no longer jumps to a hidden field when a tile is tapped.
//  [A] Session RPE: tap "45 MIN", then pad "5" -> RPE 5, minutes 45 (it used to type
//      into minutes: 45 -> 455, RPE left empty).
//  [B] Minutes above the "Longest Session" limit are refused.
//  [C] Weight + Sleep: tap a sleep tile, then type the weight on the pad -> the weight
//      lands in weight (it used to append to sleep: 7.0 -> 7.0185, clamped to 24h).
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const athletes = [{ id: uuid(1), name: 'Pad Tester', sport: 'Football', team: 'Varsity' }, { id: uuid(2), name: 'Weigh Tester', sport: 'Football', team: 'Varsity' }];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  const posts = [];
  await stubAuth(page);
  await page.addInitScript(() => sessionStorage.getItem('keep') || localStorage.setItem('hpd_settings', JSON.stringify({ enableRpe: true, rpeTrackDuration: true, rpeSessionLabels: ['Lift', 'Run'], rpeDurationQuickPicks: [30, 45, 60] })));
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
  const pad = (k) => page.locator('button.btn-primary.no-print').filter({ hasText: new RegExp(`^${k.replace('.', '\\.')}$`) }).first().click();
  const save = page.getByRole('button', { name: /CONFIRM & SYNC ATHLETE/i }).first();

  console.log('\n[A] Session RPE: tile then pad');
  await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /Session RPE/i }).first().click(); await page.waitForTimeout(500);
  await page.getByText('Pad Tester', { exact: true }).first().click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name: '45 MIN', exact: true }).click();
  await pad('5');
  check('pad digit went into RPE', await page.getByLabel('Session RPE').inputValue() === '5', await page.getByLabel('Session RPE').inputValue());
  check('45 MIN tile still selected (minutes not changed to 455)', await page.getByRole('button', { name: '45 MIN', exact: true }).evaluate(b => b.className.includes('bg-[#b89c5b]')));
  await page.getByRole('button', { name: 'Lift', exact: true }).first().click();
  await save.click(); await page.waitForTimeout(3200);
  const a = posts[0] || {};
  check('saved RPE 5 x 45 min', a.rpe === 5 && a.session_minutes === 45, JSON.stringify({ rpe: a.rpe, min: a.session_minutes }));

  console.log('\n[B] Minutes over the limit are refused');
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('hpd_settings')); s.rpeDurationQuickPicks = [45, 455]; localStorage.setItem('hpd_settings', JSON.stringify(s)); sessionStorage.setItem('keep', '1'); });
  await page.reload(); await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /Session RPE/i }).first().click(); await page.waitForTimeout(500);
  await page.getByText('Pad Tester', { exact: true }).first().click(); await page.waitForTimeout(800);
  await page.getByLabel('Session RPE').fill('6');
  await page.getByRole('button', { name: '455 MIN', exact: true }).click();
  await page.getByRole('button', { name: 'Run', exact: true }).first().click();
  check('save disabled for 455 minutes (limit 240)', await save.isDisabled());
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  console.log('\n[C] Weight + Sleep: sleep tile then pad');
  await page.getByRole('button', { name: /WEIGHT \+ SLEEP/i }).first().click(); await page.waitForTimeout(500);
  await page.getByText('Weigh Tester', { exact: true }).first().click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name: '7.0h', exact: true }).click();
  for (const k of ['1', '8', '5']) await pad(k);
  check('pad digits went into weight', await page.getByLabel('Body weight (lbs)').inputValue() === '185', await page.getByLabel('Body weight (lbs)').inputValue());
  await save.click(); await page.waitForTimeout(3200);
  const w = posts.find(p => p.athlete_name === 'Weigh Tester') || {};
  check('saved 185 lb with 7h sleep', Number(w.weight_lbs) === 185 && Number(w.sleep_hrs) === 7, JSON.stringify({ w: w.weight_lbs, s: w.sleep_hrs }));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

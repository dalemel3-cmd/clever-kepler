// Run with:  node tests/audit-fixes.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.9 audit fixes:
//  [A] Merging duplicate athletes moves weigh-ins, lifts, test results and alert
//      status, and only deletes the duplicate once every move succeeded.
//  [B] A failed step stops the merge - no delete, an honest error.
//  [C] One dehydration card per athlete, from their latest weigh-in in the window.
//  [D] Editing a result's value keeps its real time; the date box shows the Central
//      day (an evening Plyomat capture is not "tomorrow").
//  [E] Team baselines group by Central day and skip post-practice sweat checks.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const H = 3600000, DAY = 24 * H;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

async function newPage(browser, { athletes, weighIns = [], tests = [], failTable = null }) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  page.log = [];
  await stubAuth(page);
  await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableSpeedPower: true, enableLiftTracker: true, dehydrationThreshold: 2 })));
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    const table = (url.match(/\/rest\/v1\/(\w+)/) || [])[1];
    if (m !== 'GET') page.log.push({ m, table, url, body: req.postData() });
    if (table === 'coaches') return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (m === 'PATCH' && table === failTable) return route.fulfill({ status: 400, headers: h, body: JSON.stringify({ message: 'simulated failure' }) });
    if (m === 'PATCH' || m === 'DELETE') return route.fulfill({ status: 204, headers: h, body: '' });
    if (table === 'athletes') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (table === 'weigh_ins') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(weighIns) });
    if (table === 'performance_tests') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(tests) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  return page;
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const two = [{ id: uuid(1), name: 'Ann Adams', sport: 'Football' }, { id: uuid(2), name: 'Ann Adams Dup', sport: 'Football' }];
  const runMerge = async (page) => {
    await page.goto(`${APP}/#settings`); await page.waitForTimeout(2000);
    await page.getByRole('button', { name: /Open merge tool/i }).click(); await page.waitForTimeout(300);
    const source = page.locator('select').filter({ has: page.locator('option', { hasText: 'Choose Duplicate Profile' }) });
    await source.selectOption(uuid(2));
    const target = page.locator('select').filter({ has: page.locator(`option[value="${uuid(1)}"]`) }).filter({ hasNot: page.locator('option', { hasText: 'Choose Duplicate Profile' }) });
    await target.selectOption(uuid(1));
    await page.getByRole('button', { name: /MERGE AND DELETE DUPLICATE/i }).click(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Execute Merge/i }).click(); await page.waitForTimeout(1500);
  };

  console.log('\n[A] Merge moves every record type, then deletes');
  let page = await newPage(browser, { athletes: two });
  await runMerge(page);
  const moved = page.log.filter(l => l.m === 'PATCH' && /athlete_id=eq\./.test(l.url)).map(l => l.table);
  check('weigh-ins, lifts, test results and alert status all moved', JSON.stringify(moved) === JSON.stringify(['weigh_ins', 'lift_logs', 'performance_tests', 'alert_status']), JSON.stringify(moved));
  const delIdx = page.log.findIndex(l => l.m === 'DELETE' && l.table === 'athletes');
  const lastMove = page.log.map(l => l.table).lastIndexOf('alert_status');
  check('duplicate deleted only after every move', delIdx > lastMove && lastMove >= 0, `${delIdx} vs ${lastMove}`);
  check('success is announced', /Merged into Ann Adams/.test(await page.locator('body').innerText()));

  console.log('\n[B] A failed move stops the merge');
  page = await newPage(browser, { athletes: two, failTable: 'lift_logs' });
  await runMerge(page);
  check('duplicate NOT deleted', !page.log.some(l => l.m === 'DELETE' && l.table === 'athletes'));
  check('honest error shown', /Merge didn.t finish \(moving lift logs/.test(await page.locator('body').innerText()));

  console.log('\n[C] One dehydration card per athlete');
  const now = Date.now();
  page = await newPage(browser, {
    athletes: [{ id: uuid(3), name: 'Drop Guy', sport: 'Football' }],
    weighIns: [
      { id: uuid(30), athlete_id: uuid(3), athlete_name: 'Drop Guy', sport: 'Football', weight_lbs: 200, sleep_hrs: 8, is_baseline: true, created_at: new Date(now - 10 * DAY).toISOString() },
      { id: uuid(31), athlete_id: uuid(3), athlete_name: 'Drop Guy', sport: 'Football', weight_lbs: 196, sleep_hrs: 8, created_at: new Date(now - 20 * H).toISOString() },
      { id: uuid(32), athlete_id: uuid(3), athlete_name: 'Drop Guy', sport: 'Football', weight_lbs: 195, sleep_hrs: 8, created_at: new Date(now - 1 * H).toISOString() },
    ],
  });
  await page.goto(`${APP}/#alerts`); await page.waitForTimeout(2500);
  const body = await page.locator('main').innerText();
  const cards = (body.match(/DEHYDRATION RISK/g) || []).length;
  check('exactly one dehydration card (was two)', cards === 1, String(cards));
  check('it uses the latest weigh-in (-5.0 lbs)', /-5\.0 lbs drop/.test(body), (body.match(/-[\d.]+ lbs drop/g) || []).join(','));

  console.log('\n[D] Editing a result value keeps its real time');
  const evening = '2026-09-16T01:30:00.000Z'; // 8:30pm Central on Sep 15
  page = await newPage(browser, {
    athletes: [{ id: uuid(4), name: 'Fly Kid', sport: 'Football' }],
    tests: [{ id: uuid(40), athlete_id: uuid(4), athlete_name: 'Fly Kid', test_type: '10yd_fly', test_variant: 'build10_fly10', metric: 1.5, unit: 'sec', source: 'plyomat', created_at: evening }],
  });
  await page.goto(`${APP}/#profiles`); await page.waitForTimeout(2200);
  await page.getByText('Fly Kid', { exact: true }).first().click(); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /History \(1\)/ }).first().click(); await page.waitForTimeout(300);
  check('history row shows the Central day (Sep 15)', /2026-09-15/.test(await page.locator('main').innerText()));
  await page.getByRole('button', { name: 'Edit result' }).first().click(); await page.waitForTimeout(300);
  check('date box pre-fills Sep 15, not UTC Sep 16', await page.getByLabel('Result date').inputValue() === '2026-09-15', await page.getByLabel('Result date').inputValue());
  await page.getByLabel('Result value').fill('1.45');
  await page.getByRole('button', { name: 'SAVE', exact: true }).click(); await page.waitForTimeout(1200);
  const patch = page.log.find(l => l.m === 'PATCH' && l.table === 'performance_tests');
  check('value saved', patch && /1\.45/.test(patch.body || ''), patch?.body);
  check('created_at NOT rewritten when only the value changed', patch && !/created_at/.test(patch.body || ''), patch?.body);

  console.log('\n[E] Team baselines: Central day, no sweat checks');
  const t = (iso) => new Date(iso).toISOString();
  page = await newPage(browser, {
    athletes: [{ id: uuid(5), name: 'Base One', sport: 'Football' }, { id: uuid(6), name: 'Base Two', sport: 'Football' }],
    weighIns: [
      // Monday Sep 14, 7:30pm Central = Tuesday 00:30 UTC
      { id: uuid(50), athlete_id: uuid(5), athlete_name: 'Base One', sport: 'Football', weight_lbs: 180, created_at: t('2026-09-15T00:30:00Z') },
      { id: uuid(51), athlete_id: uuid(6), athlete_name: 'Base Two', sport: 'Football', weight_lbs: 210, created_at: t('2026-09-14T20:00:00Z') },
      // Base Two's post-practice sweat check the same evening - must not be offered
      { id: uuid(52), athlete_id: uuid(6), athlete_name: 'Base Two', sport: 'Football', weight_lbs: 204, session_type: 'post_practice', created_at: t('2026-09-14T23:30:00Z') },
    ],
  });
  await page.goto(`${APP}/#groups`); await page.waitForTimeout(2200);
  const studio = page.getByRole('button', { name: /SET TEAM BASELINES/i }).first();
  if (await studio.count()) { await studio.click(); await page.waitForTimeout(600); }
  const opts = await page.locator('select option').allInnerTexts();
  const dayOpts = opts.filter(o => /2026|Sep/.test(o));
  check('both weigh-ins grouped under Mon Sep 14 (one date, not two)', dayOpts.length === 1 && /Mon, Sep 14/.test(dayOpts[0]), JSON.stringify(dayOpts));
  check('athlete count is 2 (sweat check not counted)', /\b2\b/.test(dayOpts[0] || ''), JSON.stringify(dayOpts));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

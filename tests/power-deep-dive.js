// Run with:  node tests/power-deep-dive.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.3.0: Performance > Jumps & Sprints deep-dive tab. Per-athlete PB / latest / off-PB
// table per test and technique; sprints rank lowest-time-first; techniques never mix.
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
  { id: uuid(1), name: 'Hops Guy', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'Off Day', sport: 'Football', team: 'Varsity' },
  { id: uuid(3), name: 'Swing Only', sport: 'WSOC', team: 'Varsity' },
  { id: uuid(4), name: 'Fast Feet', sport: 'Football', team: 'Varsity' },
];
let n = 100;
const res = (aid, daysAgo, type, metric, variant) => ({ id: uuid(n++), athlete_id: aid, test_type: type, test_variant: variant, metric, source: 'manual',
  created_at: new Date(Date.now() - daysAgo * DAY - 3600000).toISOString() });
const tests = [
  res(uuid(1), 60, 'vertical_jump', 26, 'hands_on_hips'), res(uuid(1), 30, 'vertical_jump', 27.5, 'hands_on_hips'), res(uuid(1), 3, 'vertical_jump', 29, 'hands_on_hips'),
  res(uuid(2), 80, 'vertical_jump', 30, 'hands_on_hips'), res(uuid(2), 5, 'vertical_jump', 26, 'hands_on_hips'),
  res(uuid(3), 10, 'vertical_jump', 33, 'arm_swing'),
  res(uuid(1), 20, '10yd_fly', 1.25, 'build10_fly10'), res(uuid(4), 20, '10yd_fly', 1.10, 'build10_fly10'), res(uuid(4), 4, '10yd_fly', 1.08, 'build10_fly10'),
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
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
    if (url.includes('/rest/v1/performance_tests') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(tests) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  console.log('\n[A] Performance has a Jumps & Sprints sub-tab');
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);
  const perf = page.getByRole('tablist', { name: 'Performance' });
  await perf.getByRole('tab', { name: /Jumps & Sprints/ }).click(); await page.waitForTimeout(1200);
  check('heading', /PERFORMANCE · JUMPS & SPRINTS/.test(await page.locator('main').innerText()));
  check('page title', /Jumps & Sprints · Performance/.test(await page.title()), await page.title());

  console.log('\n[B] Vertical, default technique = most results (hands on hips)');
  const rows = page.getByTestId('power-row');
  const heads = async () => (await page.locator('main table thead').first().innerText()).toUpperCase();
  check('opens on core columns (Improved hidden)', !(await heads()).includes('IMPROVED'));
  await page.getByRole('button', { name: 'More columns' }).click(); await page.waitForTimeout(300);
  check('More columns shows Improved', (await heads()).includes('IMPROVED'));
  await page.reload(); await page.waitForTimeout(2000);
  check('More columns choice remembered after reload', (await heads()).includes('IMPROVED'));
  check('2 hands-on-hips athletes (arm swing not mixed in)', await rows.count() === 2, String(await rows.count()));
  const r0 = await rows.nth(0).innerText(), r1 = await rows.nth(1).innerText();
  check('ranked by PB: Off Day (30) #1, Hops Guy (29) #2', /Off Day/.test(r0) && /30\.0 in/.test(r0) && /Hops Guy/.test(r1), r0 + ' | ' + r1);
  check('Off Day flagged off PB (26 vs 30 = 13%)', /13% off PB/.test(r0), r0);
  check('Hops Guy new PB + improvement', /New PB/.test(r1) && /\+12%/.test(r1), r1);
  await page.getByLabel('Technique').selectOption('arm_swing'); await page.waitForTimeout(400);
  check('arm swing technique shows only arm-swing athlete', await rows.count() === 1 && /Swing Only/.test(await rows.first().innerText()));

  console.log('\n[C] Sprint: lower is better');
  await page.getByLabel('Test').selectOption('10yd_fly'); await page.waitForTimeout(400);
  check('no technique picker for a single-variant test', await page.getByLabel('Technique').count() === 0);
  const s0 = await rows.nth(0).innerText();
  check('fastest time ranked #1', /Fast Feet/.test(s0) && /#1/.test(s0) && /1\.08 sec/.test(s0), s0);

  console.log('\n[D] Detail panel');
  await page.getByLabel('Test').selectOption('vertical_jump'); await page.waitForTimeout(400);
  await rows.nth(1).click(); await page.waitForTimeout(800);
  const t = await page.locator('main').innerText();
  check('every-result chart label', /every result \(PB 29\.0 in\)/i.test(t));
  check('all-tests PBs include 10yd Fly', /All tests[\s\S]*10yd Fly/i.test(t));
  await page.getByRole('button', { name: /Open full profile/i }).click(); await page.waitForTimeout(1200);
  check('opens profile', /Hops Guy/.test(await page.locator('main').innerText()));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

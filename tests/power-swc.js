// Run with:  node tests/power-swc.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright. Supabase is stubbed.
//
// v5.17.1: Jumps & Sprints "Vs usual": the latest result against the athlete's previous results,
// counted only past the larger of SWC (0.2 x their SD) and the coach's SESOI.
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
  { id: uuid(1), name: 'Jumps Higher', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'Same As Ever', sport: 'Football', team: 'Varsity' },
  { id: uuid(3), name: 'New Guy', sport: 'Football', team: 'Varsity' },
  { id: uuid(4), name: 'Slower Today', sport: 'Football', team: 'Varsity' },
];
let n = 100;
const res = (aid, daysAgo, type, metric, variant) => ({ id: uuid(n++), athlete_id: aid, test_type: type, test_variant: variant, metric, source: 'manual', created_at: new Date(Date.now() - daysAgo * DAY - 3600000).toISOString() });
const V = 'hands_on_hips', F = 'build10_fly10';
const tests = [
  // usual 24.5 (SD 0.5, SWC 0.1); latest 27 -> real gain
  res(uuid(1), 40, 'vertical_jump', 24, V), res(uuid(1), 30, 'vertical_jump', 24.5, V), res(uuid(1), 20, 'vertical_jump', 25, V), res(uuid(1), 2, 'vertical_jump', 27, V),
  // usual 25 (SD 0.2); latest 25.02 -> within noise
  res(uuid(2), 40, 'vertical_jump', 24.8, V), res(uuid(2), 30, 'vertical_jump', 25, V), res(uuid(2), 20, 'vertical_jump', 25.2, V), res(uuid(2), 2, 'vertical_jump', 25.02, V),
  // two results only -> no baseline
  res(uuid(3), 20, 'vertical_jump', 22, V), res(uuid(3), 2, 'vertical_jump', 23, V),
  // sprint: usual 1.21; latest 1.30 (slower) -> real drop
  res(uuid(4), 40, '10yd_fly', 1.20, F), res(uuid(4), 30, '10yd_fly', 1.22, F), res(uuid(4), 20, '10yd_fly', 1.21, F), res(uuid(4), 2, '10yd_fly', 1.30, F),
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  let sesoi = {};
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
    if (url.includes('/rest/v1/shared_settings')) { if (m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify({ value: sesoi }) }); sesoi = req.postDataJSON().value; return route.fulfill({ status: 201, headers: h, body: '' }); }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);
  await page.getByRole('tablist', { name: 'Performance' }).getByRole('tab', { name: /Jumps & Sprints/ }).click(); await page.waitForTimeout(1200);
  await page.getByLabel('Test').selectOption('vertical_jump'); await page.waitForTimeout(500);
  const chip = async (name) => (await page.getByTestId('power-row').filter({ hasText: name }).getByTestId('power-vs-usual').innerText()).trim();

  console.log('\n[A] Vs usual on Jumps & Sprints');
  check('a clear jump up is a real gain', await chip('Jumps Higher') === 'Real gain', await chip('Jumps Higher'));
  check('a result inside the usual spread is within noise', await chip('Same As Ever') === 'Within noise', await chip('Same As Ever'));
  check('under 3 earlier results: a dash', await chip('New Guy') === '—');
  await page.getByLabel('Test').selectOption('10yd_fly'); await page.waitForTimeout(500);
  check('a slower sprint is a real drop (lower is better)', await chip('Slower Today') === 'Real drop', await chip('Slower Today'));

  console.log('\n[B] The coach\'s SESOI raises the bar');
  await page.getByLabel('Test').selectOption('vertical_jump'); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'SWC / SESOI' }).click(); await page.waitForTimeout(200);
  await page.getByLabel('SESOI for Vertical Jump').fill('3');
  await page.getByTestId('sesoi-panel').getByRole('button', { name: 'Save' }).click(); await page.waitForTimeout(600);
  check('with a 3 in SESOI, a 2.5 in gain is no longer a real change', sesoi.vertical_jump === 3 && await chip('Jumps Higher') === 'Within noise', `${JSON.stringify(sesoi)} ${await chip('Jumps Higher')}`);
  await page.getByTestId('power-row').filter({ hasText: 'Same As Ever' }).click(); await page.waitForTimeout(600);
  check('the detail explains the grey band', /Grey band: the usual/.test(await page.locator('main').innerText()));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

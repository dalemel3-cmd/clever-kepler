// Run with:  node tests/readiness-report.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright. Supabase is stubbed.
// v5.4.5 Readiness Report (docs/HANDOFF.md §107).
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const daysAgo = (d) => new Date(Date.now() - d * 86400000 - 3600000).toISOString();
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const athletes = [
  { id: uuid(1), name: 'SPIKE GUY', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'Steady Guy', sport: 'Football', team: 'Varsity' },
  { id: uuid(3), name: 'Stale Guy', sport: 'Football', team: 'Varsity' },
  { id: uuid(4), name: 'Vb Never', sport: 'Volleyball', team: 'Varsity' },
  { id: uuid(5), name: 'Dry Girl', sport: 'Volleyball', team: 'Varsity' },
];
let n = 100;
const rpe = (ath, d, val, mins) => ({ id: uuid(n++), athlete_id: ath, sport: 'Football', weight_lbs: 0, sleep_hrs: 0, rpe: val, session_minutes: mins, session_type: 'rpe', created_at: daysAgo(d), is_baseline: false });
const wi = (ath, d, w, extra = {}) => ({ id: uuid(n++), athlete_id: ath, sport: 'Volleyball', weight_lbs: w, sleep_hrs: 8, created_at: daysAgo(d), is_baseline: false, ...extra });
const logs = [];
for (let d = 0; d < 28; d += 2) logs.push(rpe(uuid(2), d, 5, 60));
for (let d = 8; d < 28; d += 3) logs.push(rpe(uuid(1), d, 3, 30));
for (let d = 0; d < 7; d += 1) logs.push(rpe(uuid(1), d, 9, 90));
logs.push(wi(uuid(3), 40, 200, { is_baseline: true, sport: 'Football' }));
logs.push(wi(uuid(5), 10, 150, { is_baseline: true }));
logs.push(wi(uuid(5), 1, 145, { sleep_hrs: 5 }));
const tests = [
  { id: uuid(900), athlete_id: uuid(2), test_type: 'vertical_jump', metric: 30, created_at: daysAgo(20) },
  { id: uuid(901), athlete_id: uuid(2), test_type: 'vertical_jump', metric: 25, created_at: daysAgo(2) },
  { id: uuid(902), athlete_id: uuid(5), test_type: 'vertical_jump', metric: 20, created_at: daysAgo(20) },
  { id: uuid(903), athlete_id: uuid(5), test_type: 'vertical_jump', metric: 22, created_at: daysAgo(3) },
];
const SEED = { enableRpe: true, enableSpeedPower: true, rpeTrackDuration: true, rpeScaleMax: 10, rpeLoadSpikeRatio: 1.3, rpeChronicWeeks: 4, dehydrationThreshold: 2, sleepThreshold: 6.5, dataWindowDays: 60 };

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), SEED);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
    if (url.includes('/rest/v1/performance_tests') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(tests) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  await page.goto(`${APP}/#reports`); await page.waitForTimeout(2500);
  const rr = page.getByTestId('readiness-report').first();
  check('document renders', await rr.count() === 1);
  const txt = await rr.innerText();
  check('header + kicker', /READINESS REPORT/i.test(txt) && /HUMAN PERFORMANCE · ALL SPORTS/i.test(txt));
  check('six tiles', await page.getByTestId('rr-tile').count() === 6);
  check('running footer', /Confidential · coaching and medical staff only/.test(txt));
  check('ALL-CAPS name title-cased', /Spike Guy/.test(txt) && !/SPIKE GUY/.test(txt));
  check('mass drop lists Dry Girl', /Dry Girl[\s\S]*5\.0 lb/.test(await page.getByTestId('rr-section-mass').first().innerText()));
  const load = await page.getByTestId('rr-section-load').first().innerText();
  check('Spike Guy flagged spike, listed before Steady Guy', /Spike/i.test(load) && load.indexOf('Spike Guy') < load.indexOf('Steady Guy'), load.slice(0, 300));
  check('performance flag for Steady Guy', /Steady Guy[\s\S]*−17%/.test(await page.getByTestId('rr-section-flags').first().innerText()));
  check('new PR for Dry Girl', /Dry Girl/.test(await page.getByTestId('rr-section-prs').first().innerText()));
  check('sleep section lists Dry Girl', /Dry Girl/.test(await page.getByTestId('rr-section-sleep').first().innerText()));
  check('sweat clear line', /Post-Practice Sweat Loss[\s\S]*No athletes in negative/i.test(txt));
  const wtxt = await page.getByTestId('rr-section-weighin').first().innerText();
  check('weigh-in: stale shows days, never shows bare name', /Stale Guy · 40d/.test(wtxt) && /Vb Never/.test(wtxt), wtxt);
  await page.getByTestId('rr-weighin-toggle').uncheck();
  check('toggle hides weigh-in section', await page.getByTestId('rr-section-weighin').count() === 0);
  await page.getByTestId('rr-sport').selectOption('Volleyball');
  const vtxt = await page.getByTestId('readiness-report').first().innerText();
  check('sport filter: kicker + rows', /HUMAN PERFORMANCE · VOLLEYBALL/i.test(vtxt) && !/Spike Guy/.test(vtxt));
  await page.getByTestId('rr-print').click(); await page.waitForTimeout(150);
  await page.emulateMedia({ media: 'print' });
  check('print shows only the portal', await page.locator('.rr-print-root').isVisible() && !(await page.locator('#root').isVisible()));
  const pdf = await page.pdf({ format: 'Letter', preferCSSPageSize: true });
  check('pdf produced', pdf.length > 5000);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

// Run with:  node tests/analytics-rechecks.js   (preview on :4173; Supabase stubbed)
// v5.13.1 Performance > Analytics > Average Body Weight: "Full-team days only" leaves out
// recheck days (a Thursday re-weigh of the few who were light on Monday), which average a
// different group and show as spikes. On by default, remembered; the Avg Body Weight tile
// follows it.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Noon Central-ish (17:00 UTC) N days ago, so every weigh-in lands on its own day.
const at = (d) => { const t = new Date(Date.now() - d * 864e5); t.setUTCHours(17, 0, 0, 0); return t.toISOString(); };
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

// 20 football players weigh in on 3 "Mondays" (all 180 lb); on 2 "Thursdays" only the 3
// heaviest recheck (250 lb). Full days average 180; with the rechecks the window reads
// (180 * 3 + 250 * 2) / 5 = 208.
const athletes = Array.from({ length: 20 }, (_, i) => ({ id: uuid(i + 1), name: `Player ${i + 1}`, sport: 'Football', position: 'OL' }));
let li = 500;
const row = (a, lbs, d) => ({ id: uuid(++li), athlete_id: a.id, athlete_name: a.name, sport: 'Football', weight_lbs: lbs, sleep_hrs: 8, rpe: null, session_minutes: null, session_label: null, session_type: null, is_baseline: false, created_at: at(d) });
const logs = [];
for (const d of [14, 7, 0]) for (const a of athletes) logs.push(row(a, 180, d));
for (const d of [11, 4]) for (const a of athletes.slice(0, 3)) logs.push(row(a, 250, d));

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: 'block' })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 180)));
  await stubAuth(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('hpd_settings', JSON.stringify({ enableSpeedPower: false })); } });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && m === 'GET') return route.fulfill({ status: 200, headers: { ...h, 'content-range': `0-${logs.length - 1}/${logs.length}`, 'access-control-expose-headers': 'content-range' }, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);
  const tile = async () => (await page.locator('.card-glass').filter({ hasText: 'Avg Body Weight' }).first().innerText()).replace(/\s+/g, ' ');
  const btn = page.getByTestId('bw-full-days');

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('"Full-team days only" is on by default', await btn.count() === 1 && (await btn.getAttribute('aria-pressed')) === 'true');
  check('the note says 2 recheck days are left out and why', /Leaving out 2 recheck days \(fewer than 10 athletes weighed in; a full day here is about 20\)/.test(await page.getByTestId('bw-recheck-note').innerText()), await page.getByTestId('bw-recheck-note').innerText().catch(() => ''));
  check('Avg Body Weight tile: 180 lbs (full days only)', /180\.0 lbs/.test(await tile()), await tile());

  await btn.click(); await page.waitForTimeout(300);
  check('off: rechecks included - tile reads 208 lbs, the note says how to leave them out', (await btn.getAttribute('aria-pressed')) === 'false' && /208\.0 lbs/.test(await tile()) && /2 days with fewer than 10 athletes weighed in are included/.test(await page.getByTestId('bw-recheck-note').innerText()), `${await tile()} | ${await page.getByTestId('bw-recheck-note').innerText().catch(() => '')}`);
  check('the choice is remembered on the device', (await page.evaluate(() => localStorage.getItem('hpd_analytics_full_days'))) === '0');
  await page.reload(); await page.waitForTimeout(2500);
  check('still off after a reload', (await page.getByTestId('bw-full-days').getAttribute('aria-pressed')) === 'false');
  await page.getByTestId('bw-full-days').click(); await page.waitForTimeout(300);

  // 60-day view: same days, same result.
  await page.getByRole('button', { name: '60 Days', exact: true }).click(); await page.waitForTimeout(400);
  check('60-day view: the same 2 recheck days left out, tile 180 lbs', /Leaving out 2 recheck days/.test(await page.getByTestId('bw-recheck-note').innerText().catch(() => '')) && /180\.0 lbs/.test(await tile()), await tile());

  const small = await btn.evaluate(b => { const r = b.getBoundingClientRect(); return r.height >= 44; });
  check('toggle is at least 44 px tall', small);
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

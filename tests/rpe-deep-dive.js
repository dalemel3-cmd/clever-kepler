// Run with:  node tests/rpe-deep-dive.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.2.8: Performance > RPE deep-dive tab. Per-athlete load table with A:C, monotony,
// flags and an expandable detail panel; Analytics keeps its quick RPE chart.
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
  { id: uuid(1), name: 'Spike Guy', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'Steady Gal', sport: 'Volleyball', team: 'Varsity' },
  { id: uuid(3), name: 'No Rpe Kid', sport: 'Football', team: 'Varsity' },
];
let n = 100;
const rpe = (aid, daysAgo, r, min, label = 'Practice') => ({ id: uuid(n++), athlete_id: aid, session_type: 'rpe', rpe: r, session_minutes: min, session_label: label,
  created_at: new Date(Date.now() - daysAgo * DAY - 3600000).toISOString() });
const logs = [];
// Spike Guy: light 4 weeks, then a heavy last 7 days -> A:C well above 1.3.
for (let d = 8; d < 35; d += 3) logs.push(rpe(uuid(1), d, 4, 40));
for (let d = 0; d < 6; d++) logs.push(rpe(uuid(1), d, 9, 90, d % 2 ? 'Lift' : 'Practice'));
// Steady Gal: consistent 5 weeks.
for (let d = 0; d < 35; d += 2) logs.push(rpe(uuid(2), d, 6, 60));

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await stubAuth(page);
  await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableRpe: true })));
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  console.log('\n[A] Performance has an RPE sub-tab; Analytics keeps its chart');
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);
  const perf = page.getByRole('tablist', { name: 'Performance' });
  check('RPE tab present', await perf.getByRole('tab', { name: /^RPE$/ }).count() === 1);
  check('Analytics still shows RPE content', /RPE|LOAD/i.test(await page.locator('main').innerText()));
  await perf.getByRole('tab', { name: /^RPE$/ }).click(); await page.waitForTimeout(1200);
  const body = await page.locator('body').innerText();
  check('RPE screen heading', /SESSION RPE/.test(body));
  check('page title', /RPE · Performance/.test(await page.title()), await page.title());

  console.log('\n[B] Table rows and flags');
  const rows = page.getByTestId('rpe-row');
  check('two athletes with RPE listed (no-RPE athlete omitted)', await rows.count() === 2, String(await rows.count()));
  check('sorted by A:C: spike athlete first', /Spike Guy/.test(await rows.first().innerText()));
  check('spike athlete flagged', /Load spike/.test(await rows.first().innerText()), await rows.first().innerText());
  check('steady athlete not flagged as spike', !/Load spike/.test(await rows.nth(1).innerText()));

  console.log('\n[C] Filters');
  await page.getByLabel('Sport filter').selectOption('Volleyball'); await page.waitForTimeout(400);
  check('sport filter narrows', await rows.count() === 1 && /Steady Gal/.test(await rows.first().innerText()));
  await page.getByLabel('Sport filter').selectOption('ALL');
  await page.getByLabel('Search athletes').fill('spike'); await page.waitForTimeout(400);
  check('search narrows', await rows.count() === 1);
  await page.getByLabel('Search athletes').fill('');

  console.log('\n[D] Detail panel');
  await rows.first().click(); await page.waitForTimeout(800);
  const t = await page.locator('main').innerText();
  check('weekly chart label', /Weekly load vs chronic/i.test(t));
  check('session-type breakdown shows Lift', /By session type[\s\S]*Lift/i.test(t));
  check('recent sessions table', /Recent sessions/i.test(t));
  await page.getByRole('button', { name: /Open full profile/i }).click(); await page.waitForTimeout(1200);
  check('opens profile', /Spike Guy/.test(await page.locator('main').innerText()));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

// Run with:  node tests/strength-deep-dive.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.2.9: Performance > Strength deep-dive tab. Per-athlete PR / trend / plateau table
// for a chosen lift with an expandable detail panel; Lift Tracker keeps its leaderboard.
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
  { id: uuid(1), name: 'Rising Star', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'Flat Line', sport: 'Football', team: 'Varsity' },
  { id: uuid(3), name: 'Vb Lifter', sport: 'Volleyball', team: 'Varsity' },
  { id: uuid(4), name: 'Never Benched', sport: 'Football', team: 'Varsity' },
];
let n = 100;
const set = (aid, daysAgo, lift, w, reps) => ({ id: uuid(n++), athlete_id: aid, lift_type: lift, weight_lbs: w, reps,
  created_at: new Date(Date.now() - daysAgo * DAY - 3600000).toISOString() });
const lifts = [];
// Rising Star: bench climbs every week -> PR 2 days ago, positive trend.
for (let wk = 8; wk >= 0; wk--) lifts.push(set(uuid(1), wk * 7 + 2, 'Bench', 185 + (8 - wk) * 10, 5));
lifts.push(set(uuid(1), 3, 'Squat', 315, 3));
// Flat Line: PR 100 days ago, still logging lighter now -> plateau/down.
lifts.push(set(uuid(2), 100, 'Bench', 275, 3));
for (let d = 1; d < 50; d += 7) lifts.push(set(uuid(2), d, 'Bench', 225, 3));
lifts.push(set(uuid(3), 5, 'Bench', 135, 5));
lifts.push(set(uuid(4), 5, 'Squat', 225, 5));
const weighIns = [{ id: uuid(900), athlete_id: uuid(1), weight_lbs: 200, sleep_hrs: 8, created_at: new Date().toISOString(), is_baseline: true }];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await stubAuth(page);
  await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true, enableRpe: true })));
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(weighIns) });
    if (url.includes('/rest/v1/lift_logs') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(lifts) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  console.log('\n[A] Performance has a Strength sub-tab');
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);
  const perf = page.getByRole('tablist', { name: 'Performance' });
  check('Analytics / RPE / Strength / Jumps & Sprints / Print Report tabs', await perf.getByRole('tab').count() === 5, String(await perf.getByRole('tab').count()));
  await perf.getByRole('tab', { name: /^Strength$/ }).click(); await page.waitForTimeout(1200);
  check('heading', /PERFORMANCE · STRENGTH/.test(await page.locator('main').innerText()));
  check('page title', /Strength · Performance/.test(await page.title()), await page.title());

  console.log('\n[B] Table for Bench');
  const rows = page.getByTestId('strength-row');
  check('3 bench athletes (non-bencher omitted)', await rows.count() === 3, String(await rows.count()));
  const rising = await rows.nth(0).innerText();
  const flat = await rows.nth(1).innerText();
  check('sorted by PR: Rising Star (265x5 = 309) above Flat Line (275x3 = 303)', /Rising Star/.test(rising) && /309/.test(rising) && /Flat Line/.test(flat) && /303/.test(flat), rising + ' | ' + flat);
  check('Flat Line flagged below PR', /82% of PR/.test(flat), flat);
  check('Rising Star: New PR flag', /Rising Star/.test(rising) && /New PR/.test(rising), rising);
  check('Rising Star: relative strength from weigh-in', /1\.5\d×/.test(rising), rising);
  check('Rising Star: positive trend', /\+\d+%/.test(rising), rising);

  console.log('\n[C] Filters');
  await page.getByLabel('Lift').selectOption('Squat'); await page.waitForTimeout(400);
  check('lift switch -> 2 squatters', await rows.count() === 2);
  await page.getByLabel('Lift').selectOption('Bench');
  await page.getByLabel('Sport filter').selectOption('Volleyball'); await page.waitForTimeout(400);
  check('sport filter', await rows.count() === 1 && /Vb Lifter/.test(await rows.first().innerText()));
  await page.getByLabel('Sport filter').selectOption('ALL');
  await page.getByLabel('Sort').selectOption('change'); await page.waitForTimeout(400);
  await page.getByLabel('Sort').selectOption('pctpr'); await page.waitForTimeout(300);
  check('sort by lowest % of PR puts Flat Line first', /Flat Line/.test(await rows.first().innerText()));
  await page.getByLabel('Sort').selectOption('change'); await page.waitForTimeout(300);
  check('sort by trend puts Rising Star first', /Rising Star/.test(await rows.first().innerText()));

  console.log('\n[D] Detail panel');
  await rows.first().click(); await page.waitForTimeout(800);
  const t = await page.locator('main').innerText();
  check('weekly chart label', /best est\. 1RM by week/i.test(t));
  check('PR history listed', /PR history \(9\)/i.test(t), t.match(/PR history[^\n]*/)?.[0]);
  check('all-lifts PRs include Squat', /All lifts[\s\S]*Squat/i.test(t));
  await page.getByRole('button', { name: /Open full profile/i }).click(); await page.waitForTimeout(1200);
  check('opens profile', /Rising Star/.test(await page.locator('main').innerText()));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

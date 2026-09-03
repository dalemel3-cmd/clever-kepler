// Run with:  node tests/analytics.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// The Analytics screen is a new consumer of reportData, which is exactly the situation
// that has produced the same bug three times: RPE rows carry no weight, post-practice
// rows are sweat checks rather than weigh-ins, and treating either as a morning weigh-in
// corrupts the averages and leaderboards. The fixture deliberately contains both.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  { id: uuid(1), name: 'Gainer One', sport: 'Football', team: 'Varsity', grade: '11th', position: 'OL' },
  { id: uuid(2), name: 'Loser Two', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' },
  { id: uuid(3), name: 'Rpe Only', sport: 'Volleyball', team: 'Varsity', grade: '10th', position: 'OH' },
];

let li = 100;
const w = (ath, name, sport, lbs, day, extra = {}) => ({
  id: uuid(++li), athlete_id: ath, athlete_name: name, sport,
  weight_lbs: lbs, sleep_hrs: 8, rpe: null, session_minutes: null, session_label: null,
  session_type: null, is_baseline: false, created_at: ago(day), ...extra,
});

const logs = [
  // Gainer One: baseline 200 -> 210 (+10)
  w(uuid(1), 'Gainer One', 'Football', 200, 20, { is_baseline: true }),
  w(uuid(1), 'Gainer One', 'Football', 210, 1),
  // Loser Two: baseline 180 -> 174 (-6)
  w(uuid(2), 'Loser Two', 'Football', 180, 20, { is_baseline: true }),
  w(uuid(2), 'Loser Two', 'Football', 174, 1),
  // A post-practice sweat check for Loser Two, much lighter. If Analytics counts this as
  // a weigh-in the drop reads -24 instead of -6 and the team average is dragged down.
  w(uuid(2), 'Loser Two', 'Football', 156, 1, { session_type: 'post_practice' }),
  // Rpe Only: never weighs in. Two RPE rows, weight 0, as the cloud payload writes them.
  { id: uuid(++li), athlete_id: uuid(3), athlete_name: 'Rpe Only', sport: 'Volleyball', weight_lbs: 0, sleep_hrs: 0, rpe: 8, session_minutes: 60, session_label: 'Lift', session_type: 'rpe', is_baseline: false, created_at: ago(2) },
  { id: uuid(++li), athlete_id: uuid(3), athlete_name: 'Rpe Only', sport: 'Volleyball', weight_lbs: 0, sleep_hrs: 0, rpe: 7, session_minutes: 30, session_label: 'Run', session_type: 'rpe', is_baseline: false, created_at: ago(2) },
];

const SEED = { enableRpe: true, rpeTrackDuration: true, rpeScaleMax: 10, rpeHighThreshold: 8, sleepChartTargetHours: 8 };

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 180)));
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
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  console.log('\n[A] The screen exists and renders');
  await page.goto(`${APP}/#analytics`);
  await page.waitForTimeout(2500);
  check('no crash', (await page.getByText('Something went wrong.').count()) === 0, errors[0] || '');
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('reachable from the sidebar', (await page.getByText('ANALYTICS', { exact: false }).count()) > 0);
  const body = await page.locator('body').innerText();
  check('renders the analytics heading', /PERFORMANCE ANALYTICS/i.test(body));

  console.log('\n[B] Charts are actually drawn');
  const svgs = await page.locator('.recharts-surface').count();
  check('recharts surfaces rendered', svgs >= 3, `found ${svgs}`);

  console.log('\n[C] Null-weight rows do not corrupt the numbers');
  // Gainer +10, Loser -6. If the post-practice row counted, Loser would read -24.
  check('gain of +10 lbs shown', /\+10 lbs/.test(body), body.match(/.{0,40}lbs.{0,20}/)?.[0] || '');
  check('drop reads -6, not -24 (post-practice excluded)', /-6 lbs/.test(body) && !/-24 lbs/.test(body),
    'a post-practice sweat check was counted as a weigh-in');
  // Rpe Only has weight 0 and never weighs in - it must not appear on a weight board.
  // Read each board from the DOM. Slicing the page text overshot into the training-load
  // board, where an RPE-only athlete legitimately belongs - the same false positive this
  // suite's sibling probes hit twice by thresholding on text position or element size.
  const boards = {};
  for (const el of await page.locator('[data-testid="leaderboard"]').all()) {
    boards[await el.getAttribute('data-board')] = await el.innerText();
  }
  check('RPE-only athlete absent from the weight leaderboards',
    !/Rpe Only/.test(boards['TOP WEIGHT GAINS'] || '') && !/Rpe Only/.test(boards['LARGEST DROPS'] || ''),
    'an athlete with no weigh-ins appeared on a weight board');
  check('RPE-only athlete IS on the training-load board', /Rpe Only/.test(boards['HIGHEST TRAINING LOAD'] || ''),
    'the load board should rank athletes who logged RPE');
  check('no 0 lbs baseline leaked in', !/\b0 → /.test(body) && !/→ 0 lbs/.test(body));

  console.log('\n[D] Load board uses RPE x minutes');
  // Rpe Only: 8x60 + 7x30 = 480 + 210 = 690
  check('training load board totals 690', /690/.test(body), (body.match(/HIGHEST TRAINING LOAD[\s\S]{0,200}/) || [''])[0].replace(/\n/g, ' | '));

  console.log('\n[E] Speed & power is honestly marked as empty');
  check('speed & power shown as not enabled (feature-flagged like RPE)', /NOT ENABLED/i.test(body));

  console.log('\n[F] Controls work');
  await page.getByRole('button', { name: '90 Days' }).click();
  await page.waitForTimeout(900);
  check('range switch does not crash', errors.length === 0, errors.join(' | '));
  await page.getByLabel('Sport filter').selectOption('Volleyball');
  await page.waitForTimeout(900);
  const vb = await page.locator('body').innerText();
  check('sport filter narrows the roster', /1 athlete/.test(vb), (vb.match(/\d+ athletes?/) || [''])[0]);
  check('still no page errors after filtering', errors.length === 0, errors.join(' | '));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

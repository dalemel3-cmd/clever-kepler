// Run with:  node tests/reports-cleanup.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v5.2.1 Reports cleanup: Trend Analysis and Team & Roster Rollups are gone, the
// expired-baseline audit is a compact per-sport list instead of a full table, and
// Session Load is per-athlete (sorted by A:C ratio) or, with one athlete selected,
// that athlete's own load picture.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const daysAgo = (d) => new Date(Date.now() - d * 86400000 - 3600000).toISOString();

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  { id: uuid(1), name: 'Spike Guy', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'Steady Guy', sport: 'Football', team: 'Varsity' },
  { id: uuid(3), name: 'Stale Guy', sport: 'Football', team: 'Varsity' },
  { id: uuid(4), name: 'Vb Never', sport: 'Volleyball', team: 'Varsity' },
];
let n = 100;
const rpe = (ath, name, d, val, mins) => ({
  id: uuid(n++), athlete_id: ath, athlete_name: name, sport: 'Football', weight_lbs: 0, sleep_hrs: 0,
  rpe: val, session_minutes: mins, session_label: 'Practice', session_type: 'rpe', created_at: daysAgo(d), is_baseline: false,
});
const logs = [];
// Steady Guy: same load every week for 4 weeks -> ratio ~1.0
for (let d = 0; d < 28; d += 2) logs.push(rpe(uuid(2), 'Steady Guy', d, 5, 60));
// Spike Guy: light for weeks 2-4, heavy this week -> ratio well above 1.3
for (let d = 8; d < 28; d += 3) logs.push(rpe(uuid(1), 'Spike Guy', d, 3, 30));
for (let d = 0; d < 7; d += 1) logs.push(rpe(uuid(1), 'Spike Guy', d, 9, 90));
// Stale Guy: one weigh-in 40 days ago -> expired baseline
logs.push({ id: uuid(n++), athlete_id: uuid(3), athlete_name: 'Stale Guy', sport: 'Football', weight_lbs: 200, sleep_hrs: 8, created_at: daysAgo(40), is_baseline: true });

const SEED = { enableRpe: true, rpeTrackDuration: true, rpeScaleMax: 10, rpeHighThreshold: 8, rpeLoadSpikeRatio: 1.3, rpeChronicWeeks: 4, baselineExpiryDays: 14, dataWindowDays: 60 };

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
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  await page.goto(`${APP}/#reports`); await page.waitForTimeout(2500);
  const body = await page.locator('body').innerText();

  console.log('\n[A] Removed sections are gone');
  check('no Trend Analysis', !/TREND ANALYSIS/i.test(body));
  check('no 30-day heat map', !/Heat Map/i.test(body));
  check('no Team & Roster Rollups', !/ROSTER ROLLUPS/i.test(body));

  console.log('\n[B] Expired baselines are a compact per-sport list');
  check('baseline section present', /Baseline needed/i.test(body));
  check('grouped Football line: RPE-only athletes read never, stale one shows days', /Football \(3\):[^\n]*Spike Guy \(never\)[^\n]*Stale Guy \(40d\)/.test(body), (body.match(/Football \(\d+\):[^\n]*/) || [''])[0]);
  check('athlete with no weigh-in reads "never"', /Volleyball \(1\):\s*Vb Never \(never\)/.test(body));
  check('no old full-width INACTIVITY STATUS table', !/INACTIVITY STATUS/i.test(body));

  console.log('\n[C] Session Load is per-athlete, spikes first');
  check('section header present', /SESSION LOAD · ALL SPORTS/i.test(body), (body.match(/SESSION LOAD[^\n]*/) || [''])[0]);
  const spikeIdx = body.indexOf('Spike Guy', body.indexOf('SESSION LOAD'));
  const steadyIdx = body.indexOf('Steady Guy', body.indexOf('SESSION LOAD'));
  check('both athletes listed', spikeIdx > 0 && steadyIdx > 0);
  check('spiking athlete sorted above steady athlete', spikeIdx > 0 && spikeIdx < steadyIdx);
  check('spike summary line', /1 athlete at or above the 1\.3 spike threshold/.test(body));
  check('old program-wide "Cumulative Load" tiles gone', !/Cumulative Load/i.test(body));

  console.log('\n[D] Sport filter scopes the header');
  await page.locator('select').first().selectOption('Football'); await page.waitForTimeout(400);
  check('header names the team', /SESSION LOAD · FOOTBALL/i.test(await page.locator('body').innerText()));

  console.log('\n[E] One athlete selected -> that athlete\'s own view');
  const athleteSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Spike Guy' }) });
  await athleteSelect.selectOption(uuid(1)); await page.waitForTimeout(400);
  const one = await page.locator('body').innerText();
  check('header names the athlete', /SESSION LOAD · SPIKE GUY/i.test(one), (one.match(/SESSION LOAD[^\n]*/) || [''])[0]);
  check('A:C ratio tile shown', /A:C Ratio/i.test(one));
  check('session list shown', /MINUTES/.test(one) && /810 AU/.test(one));
  await page.screenshot({ path: '/tmp/claude-0/reports-athlete.png', fullPage: true });

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

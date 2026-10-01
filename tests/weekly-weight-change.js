// Run with:  node tests/weekly-weight-change.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.4.0: the Athletes card's weekly weight change compares against the latest
// weigh-in on or before the same calendar day last week (Central), so a slightly
// later time of day no longer skips that weigh-in. The label is always "Weekly weight
// change" with "vs M/D", instead of drifting between (7d), (10d), (14d).
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
import { getWeeklyWeightDelta } from '../src/utils/athleteData.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

// Drake's real pattern: 9/24 weigh-in at 4pm, 10/1 at 3pm (Central = UTC-5 in CDT).
const A = uuid(1);
const w = (id, iso, lbs) => ({ id: uuid(id), athlete_id: A, athlete_name: 'Drake Schmidt', sport: 'Football', weight_lbs: lbs, sleep_hrs: 8, created_at: iso });
const logs = [
  w(10, '2026-09-17T21:00:00Z', 255.8),
  w(11, '2026-09-24T21:00:00Z', 255.0), // 4pm CDT
  w(12, '2026-09-28T20:00:00Z', 251.9),
  w(13, '2026-10-01T20:00:00Z', 249.7), // 3pm CDT - less than 7x24h after 9/24 4pm
];

console.log('\n[A] Calendar-day comparison');
{
  const d = getWeeklyWeightDelta(logs, A);
  check('compares against 9/24 (same day last week), not 9/17', d.previousDay === '2026-09-24', d.previousDay);
  check('delta is 249.7 - 255.0 = -5.3 (was -6.1 vs 9/17)', d.delta === -5.3, String(d.delta));
  check('7 days between', d.daysBetween === 7, String(d.daysBetween));
  const missed = getWeeklyWeightDelta(logs.filter(l => l.id !== uuid(11)), A);
  check('missed 9/24 -> nearest earlier weigh-in (9/17)', missed.previousDay === '2026-09-17', missed.previousDay);
  const short = getWeeklyWeightDelta(logs.slice(2), A);
  check('under a week of history -> oldest available (9/28)', short.previousDay === '2026-09-28', short.previousDay);
  check('one weigh-in -> no trend', getWeeklyWeightDelta(logs.slice(3), A) === null);
}

console.log('\n[B] Card label is consistent');
const browser = await chromium.launch(LAUNCH_OPTS);
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
await stubAuth(page);
await page.route(SUPA, async (route) => {
  const req = route.request(); const url = req.url(); const m = req.method();
  const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (url.includes('/realtime/')) return route.abort();
  if (isAuthRoute(url)) return fulfillAuth(route, url, h);
  if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
  if (url.includes('/rest/v1/athletes')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ id: A, name: 'Drake Schmidt', sport: 'Football', team: 'Varsity' }]) });
  // Shift the fixture so "today" is 10/1 relative to the 30-day fetch window.
  if (url.includes('/rest/v1/weigh_ins')) {
    const shift = Date.now() - new Date('2026-10-01T22:00:00Z').getTime();
    return route.fulfill({ status: 200, headers: h, body: JSON.stringify(logs.map(l => ({ ...l, created_at: new Date(new Date(l.created_at).getTime() + Math.round(shift / 86400000) * 86400000).toISOString() }))) });
  }
  return route.fulfill({ status: 200, headers: h, body: '[]' });
});
await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2000);
await page.getByText('Drake Schmidt', { exact: true }).first().click(); await page.waitForTimeout(600);
const txt = await page.locator('main').innerText();
check('label reads "Weekly weight change"', /WEEKLY WEIGHT CHANGE/i.test(txt), (txt.match(/WEIGHT CHANGE[^\n]*/i) || [''])[0]);
check('no drifting "(Nd)" label', !/WEIGHT CHANGE \(\d+D\)/i.test(txt));
check('shows which weigh-in it compares to ("vs M/D")', /vs \d{1,2}\/\d{1,2}/.test(txt));
check('value is -5.3 lb', /-5\.3 lb/.test(txt), (txt.match(/[-+][\d.]+ lb/g) || []).join(','));
await browser.close();

console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);

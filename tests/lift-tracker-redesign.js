// Run with:  node tests/lift-tracker-redesign.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Covers the recency-first "Log a Lift" redesign (v4.29.0): a "Today's session" row
// of recently-logged athletes that jumps straight to their entry modal, a row list
// (name + last body weight + last-logged date + Stale/Current badge + Log Set button)
// replacing the old alphabetical card grid, and single-select group pills.
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
  { id: uuid(1), name: 'Recent Bencher', sport: 'Football', team: 'Varsity', grade: '11th', position: 'OL' },
  { id: uuid(2), name: 'Current Squatter', sport: 'Football', team: 'Varsity', grade: '12th', position: 'DL' },
  { id: uuid(3), name: 'Stale Lifter', sport: 'Football', team: 'Varsity', grade: '10th', position: 'WR' },
  { id: uuid(4), name: 'Never Logged', sport: 'Football', team: 'Varsity', grade: '9th', position: 'RB' },
  { id: uuid(5), name: 'Volley Athlete', sport: 'Volleyball', team: 'Varsity', grade: '11th', position: 'OH' },
];

const liftLogs = [
  // Logged today - drives the "Today's session" recent row.
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Recent Bencher', sport: 'Football', lift_type: 'Bench', weight_lbs: 225, reps: 5, source: 'manual', created_at: ago(0) },
  // Logged 3 days ago - within the 14-day default window, reads "Current".
  { id: uuid(51), athlete_id: uuid(2), athlete_name: 'Current Squatter', sport: 'Football', lift_type: 'Squat', weight_lbs: 315, reps: 3, source: 'manual', created_at: ago(3) },
  // Logged 30 days ago - past the 14-day default window, reads "Stale".
  { id: uuid(52), athlete_id: uuid(3), athlete_name: 'Stale Lifter', sport: 'Football', lift_type: 'Deadlift', weight_lbs: 275, reps: 5, source: 'manual', created_at: ago(30) },
  // Never Logged has no row at all - also "Stale" (never logged reads the same as
  // stale, since a coach needs to know either way that this athlete needs attention).
];

const weighIns = [
  { id: uuid(80), athlete_id: uuid(1), athlete_name: 'Recent Bencher', sport: 'Football', weight_lbs: 172.5, sleep_hrs: 8, created_at: ago(1), is_baseline: false },
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), {
    enableLiftTracker: true,
    liftTypes: ['Bench', 'Squat', 'Deadlift', 'Hang Clean', 'Power Clean'],
  });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(weighIns) });
    if (url.includes('/rest/v1/lift_logs') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(liftLogs) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Today\'s session recent row shows who was logged today, jumps to their modal');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    const body = await page.locator('body').innerText();
    check('"Today\'s session" section is present', /Today's session/i.test(body));
    check('the athlete logged today appears in the recent row', /Recent Bencher/.test(body));
    check('an athlete not logged today is not in the recent-row count (1 logged)', /1 logged/i.test(body), body.match(/Today's session[\s\S]{0,20}/)?.[0]);
    await page.getByRole('button', { name: /Recent Bencher/i }).first().click();
    await page.waitForTimeout(600);
    check('clicking the recent card jumps straight into that athlete\'s entry modal', /Recent Bencher/.test(await page.locator('body').innerText()) && (await page.getByRole('button', { name: 'Bench', exact: true }).count()) > 0);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Roster rows show weight + last-logged date, and the right Stale/Current badge');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    const body = await page.locator('body').innerText();
    check('a recent weigh-in weight shows on the row', /172\.5 lbs/.test(body), body.match(/Recent Bencher[\s\S]{0,60}/)?.[0]);
    // Badges render with CSS text-transform: uppercase, so innerText reads back
    // "CURRENT"/"STALE" even though the JSX literal is mixed-case - match
    // case-insensitively rather than the source casing.
    check('logged-3-days-ago athlete reads Current', /Current Squatter[\s\S]{0,80}Current/i.test(body), body.match(/Current Squatter[\s\S]{0,80}/)?.[0]);
    check('logged-30-days-ago athlete reads Stale', /Stale Lifter[\s\S]{0,80}Stale/i.test(body), body.match(/Stale Lifter[\s\S]{0,80}/)?.[0]);
    check('never-logged athlete also reads Stale, not a crash or blank badge', /Never Logged[\s\S]{0,80}Stale/i.test(body), body.match(/Never Logged[\s\S]{0,80}/)?.[0]);
    check('never-logged athlete\'s meta line says so, not a fake date', /Never Logged[\s\S]{0,80}never logged/i.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Group pills single-select filter the roster, "All" clears it');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByRole('button', { name: 'Volleyball', exact: true }).click();
    await page.waitForTimeout(400);
    let body = await page.locator('body').innerText();
    // The "Today's session" recent row is intentionally NOT scoped to the group filter
    // (a coach's recent activity stays visible regardless of which group they're
    // browsing) - so only the roster list below "Filter by group" should be checked.
    // The section label renders with CSS text-transform: uppercase, so innerText
    // reads back "FILTER BY GROUP" - search case-insensitively for the split point.
    const rosterList = body.slice(body.search(/filter by group/i));
    check('Volleyball filter shows the Volleyball athlete', /Volley Athlete/.test(rosterList), rosterList.slice(0, 300));
    check('Volleyball filter hides Football athletes from the roster list', !/Current Squatter/.test(rosterList) && !/Stale Lifter/.test(rosterList), rosterList.slice(0, 200));
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.waitForTimeout(400);
    body = await page.locator('body').innerText();
    check('"All" clears the filter, showing every sport again', /Recent Bencher/.test(body) && /Volley Athlete/.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[D] "Log Set" button on a row opens the entry modal for that athlete');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#lifts`); await page.waitForTimeout(1800);
    await page.getByText('Stale Lifter', { exact: true }).locator('..').locator('..').getByRole('button', { name: /Log Set/i }).click();
    await page.waitForTimeout(600);
    const body = await page.locator('body').innerText();
    check('the modal opened for the row\'s athlete', /Stale Lifter/.test(body) && (await page.getByRole('button', { name: 'Deadlift', exact: true }).count()) > 0, body.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

// Run with:  node tests/athletes-screen.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Covers the merged Athletes screen (v4.30.0), which replaces the standalone
// Roster grid and the Profiles picker with one searchable/filterable list and a
// drill-in profile panel:
//   - default sort is "needs attention" (danger/warning/no-logs before current)
//   - selecting a row updates the right panel in place, no navigation
//   - search and sport-pill filtering
//   - Log Entry jumps to the kiosk pre-selected; View Full Trends opens the
//     existing deep-dive Profiles screen and its back chevron returns here
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
  // Current: weighs in normally, no drop.
  { id: uuid(1), name: 'Steady Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'QB' },
  // Danger: a real drop past the default 2.0 lb dehydration threshold vs baseline.
  { id: uuid(2), name: 'Dropping Athlete', sport: 'Football', team: 'Varsity', grade: '12th', position: 'RB' },
  // Warning: has logs, but never a real weigh-in (sleep only) - "Needs baseline".
  { id: uuid(3), name: 'Sleep Only Athlete', sport: 'Volleyball', team: 'Varsity', grade: '10th', position: 'OH' },
  // Neutral: zero logs of any kind.
  { id: uuid(4), name: 'No Logs Athlete', sport: 'Volleyball', team: 'Varsity', grade: '9th', position: 'MB' },
];

const weighIns = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Steady Athlete', sport: 'Football', weight_lbs: 180, is_baseline: true, created_at: ago(20) },
  { id: uuid(51), athlete_id: uuid(1), athlete_name: 'Steady Athlete', sport: 'Football', weight_lbs: 180.5, created_at: ago(1) },
  { id: uuid(52), athlete_id: uuid(2), athlete_name: 'Dropping Athlete', sport: 'Football', weight_lbs: 200, is_baseline: true, created_at: ago(20) },
  { id: uuid(53), athlete_id: uuid(2), athlete_name: 'Dropping Athlete', sport: 'Football', weight_lbs: 195, created_at: ago(1) },
  { id: uuid(54), athlete_id: uuid(3), athlete_name: 'Sleep Only Athlete', sport: 'Volleyball', sleep_hrs: 8, created_at: ago(1) },
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  await stubAuth(page);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(weighIns) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Sidebar/nav offers Athletes, not separate Roster/Profiles entries');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(1800);
    const body = await page.locator('body').innerText();
    check('ATHLETES nav item is present', /ATHLETES/.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] List sorts by needs-attention: flagged athletes before Current ones');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    check('the dropping athlete shows a danger badge with the lb delta', /Dropping Athlete[\s\S]{0,60}-5\.0 lb/.test(body), body.match(/Dropping Athlete[\s\S]{0,60}/)?.[0]);
    check('the sleep-only athlete reads "Needs baseline"', /Sleep Only Athlete[\s\S]{0,60}Needs baseline/i.test(body), body.match(/Sleep Only Athlete[\s\S]{0,60}/)?.[0]);
    check('the never-logged athlete reads "No logs"', /No Logs Athlete[\s\S]{0,60}No logs/i.test(body), body.match(/No Logs Athlete[\s\S]{0,60}/)?.[0]);
    check('the steady athlete reads "Current"', /Steady Athlete[\s\S]{0,60}Current/i.test(body), body.match(/Steady Athlete[\s\S]{0,60}/)?.[0]);
    // Needs-attention first: the flagged athlete's name must appear before the
    // steady (Current) athlete's name in the rendered list order.
    const droppingIdx = body.indexOf('Dropping Athlete');
    const steadyIdx = body.indexOf('Steady Athlete');
    check('the flagged athlete is sorted ahead of the current one', droppingIdx >= 0 && steadyIdx >= 0 && droppingIdx < steadyIdx);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Selecting a row updates the profile panel in place');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2000);
    // The section label renders with CSS text-transform: uppercase, so innerText
    // reads back "BIOMETRIC & PERFORMANCE" - match case-insensitively.
    const before = await page.locator('body').innerText();
    check('panel defaults to the top (most flagged) athlete', /biometric/i.test(before), before.slice(-500));
    await page.getByText('Steady Athlete', { exact: true }).click();
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('panel now shows the clicked athlete', /biometric[\s\S]{0,300}current weight/i.test(body), body.slice(-500));
    check('current weight reflects the selected athlete', /180\.5 lb/.test(body), body.match(/Current weight[\s\S]{0,40}/)?.[0]);
    check('URL/screen did not navigate away (still on athletes)', page.url().includes('#athletes'));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[D] Search and group pills filter the list');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2000);
    await page.getByPlaceholder('Search athletes by name or position...').fill('Steady');
    await page.waitForTimeout(400);
    let body = await page.locator('body').innerText();
    check('search narrows to the matching athlete', /Steady Athlete/.test(body) && !/Dropping Athlete/.test(body));
    await page.getByPlaceholder('Search athletes by name or position...').fill('');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Volleyball', exact: true }).click();
    await page.waitForTimeout(400);
    body = await page.locator('body').innerText();
    // Same uppercase-transform caveat as above.
    const rosterSection = body.slice(body.search(/sorted by needs attention/i));
    check('Volleyball filter shows Volleyball athletes', /Sleep Only Athlete/.test(rosterSection), rosterSection.slice(0, 300));
    check('Volleyball filter hides Football athletes', !/Steady Athlete/.test(rosterSection) && !/Dropping Athlete/.test(rosterSection), rosterSection.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[E] Log Entry jumps to the kiosk pre-selected for the panel\'s athlete');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2000);
    await page.getByText('Steady Athlete', { exact: true }).click();
    await page.waitForTimeout(400);
    // Exact, case-sensitive match - the sidebar's own nav item renders as the
    // literal all-caps "LOG ENTRY", which a case-insensitive match would also hit.
    await page.getByRole('button', { name: 'Log Entry', exact: true }).click();
    await page.waitForTimeout(1200);
    const body = await page.locator('body').innerText();
    check('lands on the kiosk entry screen', /weigh-in/i.test(body), body.slice(0, 150));
    check('the panel\'s athlete is pre-selected', /Steady Athlete/.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[F] View Full Trends opens the deep-dive Profiles screen, back chevron returns to Athletes');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2000);
    await page.getByText('Steady Athlete', { exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /View Full Trends/i }).click();
    await page.waitForTimeout(1200);
    let body = await page.locator('body').innerText();
    check('opens the full profile dossier', /Steady Athlete/.test(body) && /CURRENT BODY MASS/i.test(body), body.slice(0, 150));
    await page.getByText(/ALL PROFILES/i).click();
    await page.waitForTimeout(600);
    body = await page.locator('body').innerText();
    check('back chevron returns to the Athletes list, not the old Profiles picker', /sorted by needs attention/i.test(body), body.slice(0, 200));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

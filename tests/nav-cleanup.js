// Run with:  node tests/nav-cleanup.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v5.3.0 cleanup: 9 sidebar items merged into 5 groups with a sub-tab switcher,
// duplicate entry buttons removed, Team Status folded into the Weigh-In screen,
// archived athletes hidden everywhere but restorable, no-sport athletes flagged.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  { id: uuid(1), name: 'Fb One', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'Vb Two', sport: 'Volleyball', team: 'Varsity' },
  { id: uuid(3), name: 'No Sport Kid', sport: '', team: '' },
  { id: uuid(4), name: 'Grad Senior', sport: 'Football', team: 'Varsity', archived_at: '2026-05-20T00:00:00Z' },
];
const logs = [{ id: uuid(50), athlete_id: uuid(1), athlete_name: 'Fb One', sport: 'Football', weight_lbs: 180, sleep_hrs: 8, created_at: new Date().toISOString(), is_baseline: true }];

async function newPage(browser, { width = 1280, height = 860, settings = {} } = {}) {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  page.patches = [];
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), { enableLiftTracker: true, ...settings });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'PATCH') { page.patches.push(req.postDataJSON()); return route.fulfill({ status: 204, headers: h, body: '' }); }
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  return page;
}

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Sidebar has the 5 merged groups, no duplicate entry buttons');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2200);
    const side = await page.locator('aside nav').innerText();
    for (const g of ['Today', 'Log', 'Teams', 'Performance', 'Settings']) check(`sidebar has ${g}`, new RegExp(g, 'i').test(side));
    for (const old of ['Sport Groups', 'Quick Entry', 'Analytics & RPE', 'Reports', 'Lift Tracker', 'Alerts']) check(`sidebar no longer lists ${old}`, !new RegExp(old, 'i').test(side), side);
    check('header "Log Set" button removed', await page.locator('header').getByRole('button', { name: /Log Set/i }).count() === 0);
    check('header "Kiosk Mode" button removed (sidebar keeps Activate Kiosk Mode)', await page.locator('header').getByRole('button', { name: /Kiosk Mode/i }).count() === 0
      && await page.locator('aside').getByRole('button', { name: /Kiosk Mode/i }).count() === 1);
  }

  console.log('\n[B] Sub-tabs switch between a group\'s screens');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2200);
    const tabs = page.getByRole('tablist', { name: 'Today' });
    check('Today shows Overview / Alerts switcher', await tabs.getByRole('tab').count() === 2);
    await tabs.getByRole('tab', { name: /Alerts/i }).click(); await page.waitForTimeout(700);
    check('Alerts tab opens the Alerts screen', /ATHLETE RECOVERY ALERTS/i.test(await page.locator('body').innerText()));
    check('sidebar still highlights Today on the Alerts screen', /Today/i.test(await page.locator('aside nav [aria-current="page"]').innerText()));
    await page.locator('aside nav').getByText('Performance', { exact: true }).click(); await page.waitForTimeout(900);
    const perf = page.getByRole('tablist', { name: 'Performance' });
    check('Performance opens with Analytics / Print Report switcher', await perf.getByRole('tab', { name: /Print Report/i }).count() === 1);
    await perf.getByRole('tab', { name: /Print Report/i }).click(); await page.waitForTimeout(900);
    check('Print Report opens Reports', /QUICK PRIORITY READINESS REPORT/i.test(await page.locator('body').innerText()));
    check('Reports raw log table is gone', !/CHRONOLOGICAL|LOG HISTORY/i.test(await page.locator('body').innerText()));
  }

  console.log('\n[C] Lift Tracker toggle hides the Lifts sub-tab');
  {
    const page = await newPage(browser, { settings: { enableLiftTracker: false } });
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(2000);
    check('no Log switcher when Lifts is off', await page.getByRole('tablist', { name: 'Log' }).count() === 0);
  }

  console.log('\n[D] Weigh-In Status opens the Weigh-In screen filtered to that sport');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#groups`); await page.waitForTimeout(2200);
    const body = await page.locator('body').innerText();
    check('no-sport athlete is flagged', /1 athlete with no sport:\s*No Sport Kid/i.test(body), (body.match(/.{0,40}no sport.{0,40}/i) || [''])[0]);
    check('archived athlete not counted in Football', !/Grad Senior/i.test(body));
    await page.getByRole('button', { name: /Weigh-In Status/i }).first().click(); await page.waitForTimeout(1200);
    const entry = await page.locator('body').innerText();
    check('landed on the Weigh-In screen', /RAPID QUICK ENTRY KIOSK|RAPID WEIGH-IN/i.test(entry));
    check('filtered to the tapped sport (Football only)', /Fb One/i.test(entry) && !/Vb Two/i.test(entry));
    await page.locator('aside nav').getByText('Log', { exact: true }).click(); await page.waitForTimeout(900);
    await page.locator('aside nav').getByText('Today', { exact: true }).click(); await page.waitForTimeout(500);
    await page.locator('aside nav').getByText('Log', { exact: true }).click(); await page.waitForTimeout(900);
    check('a later ordinary visit opens on All again', /Vb Two/i.test(await page.locator('body').innerText()));
  }

  console.log('\n[E] Archive hides an athlete but keeps them restorable');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2200);
    let body = await page.locator('body').innerText();
    check('archived athlete hidden from the main list', !/Grad Senior/i.test(body.split(/SHOW ARCHIVED/i)[1] || body));
    await page.getByRole('button', { name: /Show archived \(1\)/i }).click(); await page.waitForTimeout(300);
    check('archived list shows them', /Grad Senior/i.test(await page.locator('body').innerText()));
    await page.getByRole('button', { name: /^Restore$/i }).click(); await page.waitForTimeout(800);
    check('restore sends archived_at: null', page.patches.some(p => p.archived_at === null), JSON.stringify(page.patches));
  }

  console.log('\n[F] Phone bottom nav uses the same 5 names');
  {
    const page = await newPage(browser, { width: 390, height: 800 });
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2200);
    const nav = await page.locator('.bottom-nav').innerText();
    check('bottom nav = Today / Log / Teams / Performance / Settings', ['TODAY', 'LOG', 'TEAMS', 'PERFORMANCE', 'SETTINGS'].every(n => nav.toUpperCase().includes(n)), nav.replace(/\n/g, ' | '));
    check('no "More" sheet button', !/MORE/i.test(nav));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

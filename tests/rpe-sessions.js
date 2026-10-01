// Run with:  node tests/rpe-sessions.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.4.1 Session RPE logging fixes:
//  [A] Two different sessions in a day (Lift then Run) are two rows - the second no
//      longer prompts "Overwrite" and replaces the first. The same session type twice
//      still asks before replacing.
//  [B] An RPE session saved offline uploads WITH its RPE, minutes and label (the
//      offline queue used to drop all three, leaving an empty session).
//  [C] An RPE-typed row with no RPE value isn't counted as an RPE-0 session.
//  [D] Print Report's week-to-week weight list uses the same calendar-day rule as
//      the Athletes card.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
import { isRpeLog } from '../src/utils/athleteData.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const SETTINGS = { enableRpe: true, rpeTrackDuration: true, rpeSessionLabels: ['Lift', 'Run', 'Combined'] };
const athletes = [{ id: uuid(1), name: 'Two Session', sport: 'Football', team: 'Varsity' }];

async function newPage(browser, { offline = false, logs = [] } = {}) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' })).newPage();
  page.posts = []; page.patches = []; page.offline = offline;
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), SETTINGS);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins')) {
      if (m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(logs) });
      if (page.offline) return route.abort('internetdisconnected');
      if (m === 'POST') { const b = req.postDataJSON(); const rows = Array.isArray(b) ? b : [b]; page.posts.push(...rows); return route.fulfill({ status: 201, headers: h, body: JSON.stringify(rows.map((r, i) => ({ ...r, id: uuid(800 + page.posts.length + i) }))) }); }
      if (m === 'PATCH') { page.patches.push(req.postDataJSON()); return route.fulfill({ status: 204, headers: h, body: '' }); }
    }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  return page;
}

const logRpe = async (page, rpe, label) => {
  await page.getByText('Two Session').first().click(); await page.waitForTimeout(800);
  await page.getByLabel('Session RPE').fill(String(rpe));
  await page.getByRole('button', { name: '45 MIN', exact: true }).click();
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await page.getByRole('button', { name: /CONFIRM & SYNC ATHLETE/i }).first().click();
  await page.waitForTimeout(3000); // let the 2.5s "LOG RECORDED" celebration clear
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Two sessions in one day are both kept');
  let page = await newPage(browser);
  await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /Session RPE/i }).first().click(); await page.waitForTimeout(500);
  await logRpe(page, 7, 'Lift');
  await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400);
  await logRpe(page, 5, 'Run');
  check('no overwrite prompt for a different session', await page.getByText(/already logged a/i).count() === 0);
  check('two separate rows saved (Lift and Run)', page.posts.length === 2 && page.posts[0].session_label === 'Lift' && page.posts[1].session_label === 'Run', JSON.stringify(page.posts.map(p => [p.session_label, p.rpe])));
  check('nothing overwritten', page.patches.length === 0);
  await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400);
  await logRpe(page, 8, 'Lift');
  check('same session type again asks before replacing', await page.getByText(/already logged a Lift session today/i).count() === 1);

  console.log('\n[B] Offline RPE session uploads with its values');
  page = await newPage(browser, { offline: true });
  await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);
  await page.getByRole('button', { name: /Session RPE/i }).first().click(); await page.waitForTimeout(500);
  await logRpe(page, 6, 'Run');
  const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]'));
  check('session queued offline', queued.length === 1, String(queued.length));
  page.offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  for (let i = 0; i < 20 && !page.posts.length; i++) await page.waitForTimeout(500);
  const up = page.posts[0] || {};
  check('uploaded with RPE, minutes and label', up.rpe === 6 && up.session_minutes === 45 && up.session_label === 'Run' && up.session_type === 'rpe', JSON.stringify(up));

  console.log('\n[C] An RPE row with no value is not a session');
  const empty = { id: 'e', athlete_id: uuid(1), session_type: 'rpe', rpe: null, session_minutes: null, weight_lbs: 0, created_at: new Date().toISOString() };
  const real = { id: 'r', athlete_id: uuid(1), session_type: 'rpe', rpe: 8, session_minutes: 60, weight_lbs: 0, created_at: new Date().toISOString() };
  check('empty RPE row is not an RPE log', isRpeLog(empty) === false);
  check('real RPE row is', isRpeLog(real) === true);
  page = await newPage(browser, { logs: [{ ...empty, id: uuid(70) }, { ...real, id: uuid(71), created_at: new Date(Date.now() - 3600000).toISOString() }] });
  await page.goto(`${APP}/#rpe`); await page.waitForTimeout(2500);
  const t = await page.locator('main').innerText();
  check('RPE tab avg RPE is 8.0 from the one real session (was 4.0)', /8\.0\s*\n?\s*AVG RPE/i.test(t), (t.match(/[\d.]+\s*\n?\s*AVG RPE/i) || [''])[0]);

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

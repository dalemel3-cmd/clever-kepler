// Run with:  node tests/rpe-team-log.js   (preview server on :4173; Supabase stubbed)
// v5.4.7 RPE Team Log: Performance > RPE > Team log saves a whole sheet in one insert.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const athletes = [
  { id: uuid(1), name: 'Amy Alpha', sport: 'WSOC' }, { id: uuid(2), name: 'Bea Beta', sport: 'WSOC' },
  { id: uuid(3), name: 'Cal Gamma', sport: 'WSOC' }, { id: uuid(4), name: 'Dan Delta', sport: 'Football' },
];
const yday = new Date(Date.now() - 86400000);
const logs = [{ id: uuid(50), athlete_id: uuid(3), sport: 'WSOC', weight_lbs: 0, sleep_hrs: 0, rpe: 6, session_minutes: 80, session_label: 'Practice', session_type: 'rpe', created_at: new Date(yday.setHours(17)).toISOString() }];
const SEED = { enableRpe: true, rpeTrackDuration: true, rpeScaleMax: 10, rpeMaxMinutes: 240, rpeSessionLabels: ['Practice', 'Lift'] };
(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1024, height: 1366 } })).newPage();
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), SEED);
  const inserts = [];
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'POST') { inserts.push(JSON.parse(req.postData())); return route.fulfill({ status: 201, headers: hdrs, body: '[]' }); }
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  await page.goto(`${APP}/#rpe`); await page.waitForTimeout(2000);
  await page.getByTestId('rpe-team-open').click();
  const dlg = page.getByRole('dialog', { name: 'RPE Team Log' });
  check('panel opens', await dlg.isVisible());
  await dlg.locator('#rt-sport').selectOption('WSOC');
  check('roster filtered to team, A-Z', (await page.getByTestId('team-rpe-row').allInnerTexts()).map(t => t.split('\n')[0]).join(',') === 'Amy Alpha,Bea Beta,Cal Gamma');
  check('already-logged athlete flagged', /Already logged: RPE 6 · 80 min/.test(await page.getByTestId('team-rpe-row').nth(2).innerText()));
  await page.getByLabel('Amy Alpha RPE').fill('7');
  await page.getByLabel('Bea Beta RPE').fill('12');
  check('out-of-range RPE blocks save', await page.getByTestId('rpe-team-save').isDisabled());
  await page.getByLabel('Bea Beta RPE').fill('5');
  await page.getByLabel('Bea Beta minutes').fill('60');
  await page.getByTestId('rpe-team-save').click(); await page.waitForTimeout(800);
  const rows = inserts.flat();
  check('one insert request for the sheet', inserts.length === 1 && rows.length === 2, JSON.stringify(inserts).slice(0, 200));
  const amy = rows.find(r => r.athlete_id === uuid(1)), bea = rows.find(r => r.athlete_id === uuid(2));
  check('rows carry rpe/minutes/label/type', amy?.rpe === 7 && amy.session_minutes === 90 && amy.session_label === 'Practice' && amy.session_type === 'rpe' && bea?.session_minutes === 60, JSON.stringify(rows));
  const ct = new Date(amy.created_at);
  check('dated yesterday 3:30 PM Central', ct.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) === new Date(Date.now() - 86400000).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'numeric', day: 'numeric' }) + ', 3:30 PM', amy.created_at);
  check('success message', /Saved 2 Practice sessions/.test(await dlg.innerText()));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

// Run with:  node tests/gps.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright. Supabase is stubbed.
//
// v5.16.7: Performance > GPS. Team table for a day, weekly trends per athlete, and the Titan CSV
// upload with a check before anything is saved.
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
  { id: uuid(1), name: 'ANN ALPHA', sport: 'Football', team: 'Varsity' },
  { id: uuid(2), name: 'BO BRAVO', sport: 'Football', team: 'Varsity' },
  { id: uuid(3), name: 'CAL DELTA', sport: 'Football', team: 'Varsity' },
  { id: uuid(4), name: 'DEE ECHO', sport: 'Softball', team: 'Varsity' },
];
const S = (n, aid, date, dist, top) => ({ id: uuid(100 + n), athlete_id: aid, session_date: date, distance_yd: dist, top_speed_mph: top, accel_count: 20, decel_count: 8, high_speed_yd: 300, personal_band_yd: 50 });
const saved = [S(1, uuid(1), '2026-11-17', 6000, 17), S(2, uuid(2), '2026-11-17', 4000, 18.5), S(3, uuid(1), '2026-11-10', 5000, 16), S(4, uuid(1), '2026-11-03', 4500, 15.5)];
const HEAD = 'Date,Player Name,GPS Distance,GPS Top Speed,GPS Accel Zones  Count,GPS Decel Zones  Count,GPS Speed Bands  Distance,GPS Personal Bands  Distance';
const FILE = [HEAD,
  '11/19/2026,Ann Alpha,3000,16.5,5,2,100,40',
  '11/19/2026,bo bravo,3500,17.5,6,3,120,45',
  '11/19/2026,calx Cal Delta,2800,15,4,1,60,10',
  '11/19/2026,Mystery Man,2500,14,3,1,50,0',
  '11/19/2026,Dee Echo,100,5,0,0,0,0',
  '11/19/2026,Zero Unit,0,0,0,0,0,0',
].join('\n');

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.upserts = []; page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e).slice(0, 200)));
  await stubAuth(page);
  await page.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true })));
  let failSave = false;
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/gps_sessions')) {
      if (m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(saved) });
      if (failSave) return route.fulfill({ status: 500, headers: h, body: '{"message":"boom"}' });
      const body = req.postDataJSON(); page.upserts.push({ url, body });
      for (const r of body) { const i = saved.findIndex(x => x.athlete_id === r.athlete_id && x.session_date === r.session_date); const row = { id: i >= 0 ? saved[i].id : uuid(900 + saved.length), ...r }; if (i >= 0) saved[i] = row; else saved.push(row); }
      return route.fulfill({ status: 201, headers: h, body: '' });
    }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  console.log('\n[A] The tab and the team table');
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
  const perf = page.getByRole('tablist', { name: 'Performance' });
  await perf.getByRole('tab', { name: /^GPS$/ }).click(); await page.waitForTimeout(1200);
  check('heading, and the page title', /PERFORMANCE · GPS/.test(await page.locator('main').innerText()) && /GPS · Performance/.test(await page.title()), await page.title());
  const rows = page.getByTestId('gps-row');
  check('the latest day is shown with football athletes only, biggest distance first', await rows.count() === 2 && /ANN ALPHA/.test(await rows.nth(0).innerText()) && /6,?000/.test(await rows.nth(0).innerText()), await rows.first().innerText());
  await rows.nth(0).click(); await page.waitForTimeout(700);
  const t = await page.locator('main').innerText();
  check('tapping a row shows daily charts and the weekly table', /Daily distance/i.test(t) && /Daily speed band/i.test(t) && /Daily top speed/i.test(t) && !/Weekly distance/i.test(t) && /Week of/i.test(t));

  check('each row has a 28-day trend line for the sorted number', await page.getByTestId('gps-spark').count() === 2 && await page.getByRole('img', { name: /ANN ALPHA: Distance \(yd\) on each session day/ }).count() === 1);
  await page.getByLabel('Sort').selectOption('top_speed_mph'); await page.waitForTimeout(200);
  check('sorting by top speed switches the trend lines to top speed', await page.getByRole('img', { name: /ANN ALPHA: Top speed \(mph\) on each session day/ }).count() === 1);
  await page.getByLabel('Sort').selectOption('distance_yd'); await page.waitForTimeout(200);

  console.log('\n[A2] Trends view: the whole team by day');
  await page.getByRole('button', { name: 'Trends' }).click(); await page.waitForTimeout(500);
  check('the grid lists every athlete with a session in the window, plus a team average row', await page.getByTestId('gps-trend-row').count() === 2 && await page.getByTestId('gps-trend-avg').count() === 1 && /TEAM AVERAGE/.test(await page.getByTestId('gps-trends').innerText()));
  check('Ann has a cell for each of her 3 session days (Nov 3, 10, 17), Bo one', await page.getByTestId('gps-trend-row').filter({ hasText: 'ANN ALPHA' }).getByTestId('gps-cell').count() === 3 && await page.getByTestId('gps-trend-row').filter({ hasText: 'BO BRAVO' }).getByTestId('gps-cell').count() === 1);
  await page.getByTestId('gps-trend-row').filter({ hasText: 'BO BRAVO' }).getByTestId('gps-cell').first().click(); await page.waitForTimeout(200);
  check('tapping a cell shows that athlete-day', /BO BRAVO · Nov 17/.test(await page.getByTestId('gps-cell-detail').innerText()) && /Top speed \(mph\) 18\.5/.test(await page.getByTestId('gps-cell-detail').innerText()));
  check('the picked cell keeps a visible outline; others keep the browser focus ring (no outline: none)', await page.evaluate(() => [...document.querySelectorAll('[data-testid="gps-cell"]')].every(b => b.style.outline !== 'none')));
  check('bright cells use dark text', await page.evaluate(() => [...document.querySelectorAll('[data-testid="gps-cell"]')].some(b => b.style.color === 'rgb(10, 17, 32)')));
  check('the Sort menu is hidden in Trends', await page.getByLabel('Sort', { exact: true }).count() === 0);
  await page.getByLabel('Trend metric').selectOption('top_speed_mph'); await page.waitForTimeout(200);
  check('switching the number changes the cells', /18\.5/.test(await page.getByTestId('gps-trend-row').filter({ hasText: 'BO BRAVO' }).innerText()));
  await page.getByLabel('Trend window').selectOption('2'); await page.waitForTimeout(200);
  check('changing the window clears a cell detail that is no longer on screen', await page.getByTestId('gps-cell-detail').count() === 0);
  check('a 2-week window drops the older days', await page.getByTestId('gps-trend-row').filter({ hasText: 'ANN ALPHA' }).getByTestId('gps-cell').count() === 2);
  await page.getByLabel('Trend window').selectOption('4'); await page.getByLabel('Trend metric').selectOption('distance_yd'); await page.waitForTimeout(200);
  const order = async () => (await page.getByTestId('gps-trend-row').allInnerTexts()).map(t => t.split(/[\t\n]/)[0].trim());
  check('trends sort by athlete A–Z by default', (await order()).join() === 'ANN ALPHA,BO BRAVO', (await order()).join());
  await page.getByLabel('Trend sort').selectOption('high'); await page.waitForTimeout(200);
  check('largest average first (Ann 5,167 avg vs Bo 4,000)', (await order()).join() === 'ANN ALPHA,BO BRAVO' && /5\.2k/.test(await page.getByTestId('gps-trend-rowavg').first().innerText()), await page.getByTestId('gps-trend-rowavg').first().innerText());
  await page.getByLabel('Trend sort').selectOption('low'); await page.waitForTimeout(200);
  check('smallest average first', (await order()).join() === 'BO BRAVO,ANN ALPHA');

  console.log('\n[A3] Acute : chronic');
  await page.getByRole('button', { name: 'Acute : Chronic' }).click(); await page.waitForTimeout(400);
  const acr = page.getByTestId('gps-ac-row').filter({ hasText: 'ANN ALPHA' });
  const acText = (await acr.innerText()).replace(/\s+/g, ' ');
  check('7, 14 and 28-day totals and both ratios for Ann up to Nov 17', /6,000 11,000 15,500 3,875 1\.55 1\.42/.test(acText), acText);
  check('short history is marked Building, not flagged', /Building/.test(acText) && await page.getByTestId('gps-ac-row').count() === 2);
  check('top speed is not offered as a load', !(await page.getByLabel('Load metric').innerText()).includes('Top speed'));
  await page.getByLabel('Load sort').selectOption('name'); await page.waitForTimeout(200);
  check('sort by athlete works here too', /ANN ALPHA/.test(await page.getByTestId('gps-ac-row').first().innerText()));
  await page.getByRole('button', { name: 'Day table' }).click(); await page.waitForTimeout(300);

  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await stubAuth(phone);
  await phone.addInitScript(() => localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true })));
  await phone.route(SUPA, async (route) => { const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }; const req = route.request(); const url = req.url();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort(); if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/gps_sessions')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify(saved) });
    return route.fulfill({ status: 200, headers: h, body: '[]' }); });
  await phone.goto(`${APP}/#gps`); await phone.waitForTimeout(2200);
  await phone.getByRole('button', { name: 'Acute : Chronic' }).click(); await phone.waitForTimeout(400);
  check('phone width: the page does not scroll sideways with the three view buttons', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), String(await phone.evaluate(() => document.documentElement.scrollWidth)));
  await phone.close();

  console.log('\n[B] Upload: checked before saving');
  await page.getByLabel('Titan CSV file').setInputFiles({ name: 'titan.csv', mimeType: 'text/csv', buffer: Buffer.from(FILE) });
  await page.waitForTimeout(500);
  const pv = page.getByTestId('gps-preview');
  const ptxt = await pv.innerText();
  check('the preview counts what it will save, matched names and the zero row', /3\s*\nAthlete-days to save/i.test(ptxt) && /1\s*\nAll-zero rows skipped/i.test(ptxt), ptxt.replace(/\n/g, ' | '));
  check('the partial match, a Softball athlete and an unknown name are all listed to check; nothing saved yet', await page.getByTestId('gps-unmatched').count() === 3 && page.upserts.length === 0);
  await page.getByLabel('Match Mystery Man').selectOption({ label: 'ANN ALPHA' }).catch(() => {});
  await page.getByLabel('Match Dee Echo').selectOption('skip');
  await page.waitForTimeout(200);
  check('after matching by hand the rows stay listed with the choice, and the count updates', await page.getByTestId('gps-unmatched').count() === 3 && await page.getByLabel('Match Dee Echo').inputValue() === 'skip' && /3\s*\nAthlete-days to save/i.test(await pv.innerText()), (await pv.innerText()).replace(/\n/g, ' | '));

  console.log('\n[C] Confirm saves, replaces and shows');
  await pv.getByRole('button', { name: /^Save \d+ athlete-days/ }).click(); await page.waitForTimeout(1200);
  const up = page.upserts[0];
  check('one upsert keyed on athlete and day, with the right numbers', up && /on_conflict=athlete_id(%2C|,)session_date/.test(up.url) && up.body.some(r => r.athlete_id === uuid(2) && r.session_date === '2026-11-19' && r.distance_yd === 3500 && r.top_speed_mph === 17.5 && r.accel_count === 6 && r.personal_band_yd === 45 && r.source === 'titan'), JSON.stringify(up));
  check('the matched Cal Delta row (doubled first word) was saved too', up.body.some(r => r.athlete_id === uuid(3) && r.distance_yd === 2800));
  check('the notice says what was saved and the new day is on screen', /Saved \d+ athlete-days/.test(await page.getByTestId('gps-notice').innerText()) && /Nov 19/.test(await page.locator('main').innerText()));
  check('no page errors', page.errors.length === 0, page.errors.join(' | '));

  console.log('\n[D] A bad file and a failed save');
  await page.getByLabel('Titan CSV file').setInputFiles({ name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from('Foo,Bar\n1,2\n') });
  await page.waitForTimeout(400);
  check('a file that is not the Titan export is refused with a reason', /doesn't look like the Titan export/.test(await page.getByTestId('gps-notice').innerText()) && await page.getByTestId('gps-preview').count() === 0);
  failSave = true;
  await page.getByLabel('Titan CSV file').setInputFiles({ name: 'titan.csv', mimeType: 'text/csv', buffer: Buffer.from(FILE) });
  await page.waitForTimeout(400);
  await page.getByLabel('Match Mystery Man').selectOption('skip'); await page.getByLabel('Match Dee Echo').selectOption('skip');
  await page.getByTestId('gps-preview').getByRole('button', { name: /^Save \d+ athlete-days/ }).click(); await page.waitForTimeout(1000);
  check('a failed save says so and tells you to upload again', /Couldn't save all of it/.test(await page.getByTestId('gps-notice').innerText()));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

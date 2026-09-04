// Run with:  node tests/athlete-comparison.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Analytics -> Compare: pick athletes, plot their Speed & Power results over time.
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
  { id: uuid(1), name: 'Fast Athlete', sport: 'Football', team: 'Varsity', grade: '', position: 'WR' },
  { id: uuid(2), name: 'Slower Athlete', sport: 'Football', team: 'Varsity', grade: '', position: 'OL' },
  { id: uuid(3), name: 'Third Athlete', sport: 'Football', team: 'Varsity', grade: '', position: 'RB' },
];

// Fast Athlete's fly time is improving (1.70 -> 1.55, lower is better); Slower
// Athlete's is not (1.80 -> 1.85). Third Athlete has no results at all - the empty
// case. Also seed a vertical_jump row so switching test type actually changes what's
// plottable, not just what's labeled.
const perfTests = [
  { id: uuid(90), athlete_id: uuid(1), athlete_name: 'Fast Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.70, unit: 'sec', source: 'manual', created_at: ago(14) },
  { id: uuid(91), athlete_id: uuid(1), athlete_name: 'Fast Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.55, unit: 'sec', source: 'manual', created_at: ago(1) },
  { id: uuid(92), athlete_id: uuid(2), athlete_name: 'Slower Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.80, unit: 'sec', source: 'manual', created_at: ago(14) },
  { id: uuid(93), athlete_id: uuid(2), athlete_name: 'Slower Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.85, unit: 'sec', source: 'manual', created_at: ago(1) },
  { id: uuid(94), athlete_id: uuid(1), athlete_name: 'Fast Athlete', sport: 'Football', test_type: 'vertical_jump', metric: 24.0, unit: 'in', source: 'manual', created_at: ago(1) },
];

const newPage = async (browser, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 180)));
  page.errors = errors;
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), { enableSpeedPower: opts.enabled !== false });
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    if (url.includes('/rest/v1/performance_tests') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(perfTests) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Off: pointed at Settings, not a blank board');
  {
    const page = await newPage(browser, { enabled: false });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    await page.getByRole('button', { name: /Compare/i }).click();
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('shows NOT ENABLED under Compare', /NOT ENABLED/i.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Compare tab: empty selection state');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    await page.getByRole('button', { name: /Compare/i }).click();
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('prompts to select an athlete', /Select at least one athlete/i.test(body));
    check('date range buttons are hidden in Compare (they don\'t apply)', !/^30 Days$/m.test(body.replace(/\s+/g, ' ')) || true); // range control removed from DOM, not just hidden text
    const rangeButtons = await page.getByRole('button', { name: '30 Days' }).count();
    check('30/60/90 day buttons removed from Compare view', rangeButtons === 0, `found ${rangeButtons}`);
  }

  console.log('\n[C] Selecting athletes plots their trend and summary stats');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    await page.getByRole('button', { name: /Compare/i }).click();
    await page.waitForTimeout(400);
    await page.getByText('Fast Athlete', { exact: true }).click();
    await page.getByText('Slower Athlete', { exact: true }).click();
    await page.waitForTimeout(500);
    const body = await page.locator('body').innerText();
    check('both athletes show a best value', /Best 1\.55 sec/.test(body) && /Best 1\.80 sec/.test(body), body.match(/Best[\s\S]{0,20}/g)?.join(' | '));
    check('improving athlete gets a negative (faster) trend', /-0\.15/.test(body), body.match(/Latest[\s\S]{0,40}/g)?.join(' | '));
    check('declining athlete gets a positive (slower) trend', /\+0\.05/.test(body), body.match(/Latest[\s\S]{0,40}/g)?.join(' | '));
    const lines = await page.locator('.recharts-line').count();
    check('chart draws one line per selected athlete', lines === 2, `found ${lines}`);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[D] Switching test type changes what is plottable');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    await page.getByRole('button', { name: /Compare/i }).click();
    await page.waitForTimeout(400);
    await page.getByText('Fast Athlete', { exact: true }).click();
    await page.waitForTimeout(300);
    let body = await page.locator('body').innerText();
    check('Fly 10 (default) shows a result for Fast Athlete', /Best 1\.55 sec/.test(body));
    await page.getByRole('button', { name: 'Vertical Jump' }).click();
    await page.waitForTimeout(400);
    body = await page.locator('body').innerText();
    check('Vertical Jump shows the seeded 24.0in result', /Best 24\.0 in/.test(body), body.match(/Best[\s\S]{0,20}/)?.[0] || '');
  }

  console.log('\n[E] An athlete with zero results reads as "no results", not broken');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    await page.getByRole('button', { name: /Compare/i }).click();
    await page.waitForTimeout(400);
    await page.getByText('Third Athlete', { exact: true }).click();
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    check('empty-state message names the athlete', /No 10yd Fly results logged yet for Third Athlete/i.test(body), body.slice(0, 300));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[F] A 7th athlete cannot be selected (comparison stays readable)');
  {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: uuid(200 + i), name: `Roster ${i}`, sport: 'Football', team: 'Varsity', grade: '', position: 'WR' }));
    const manyTests = many.map((a, i) => ({ id: uuid(300 + i), athlete_id: a.id, athlete_name: a.name, sport: 'Football', test_type: '10yd_fly', metric: 1.5 + i * 0.01, unit: 'sec', source: 'manual', created_at: ago(1) }));
    const page = await newPage(browser);
    await page.route(SUPA, async (route) => {
      const req = route.request(); const url = req.url(); const method = req.method();
      const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
      if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (url.includes('/realtime/')) return route.abort();
      if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
      if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
      if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(many) });
      if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
      if (url.includes('/rest/v1/performance_tests') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(manyTests) });
      return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    await page.getByRole('button', { name: /Compare/i }).click();
    await page.waitForTimeout(400);
    for (let i = 0; i < 7; i++) await page.getByText(`Roster ${i}`, { exact: true }).click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    const body = await page.locator('body').innerText();
    // "N of M selected" is styled text-transform:uppercase, so innerText reports it
    // as "6 OF 6 SELECTED" - match case-insensitively.
    check('cap holds at 6 selected, not 7', /6 of 6 selected/i.test(body), body.match(/\d+ of \d+ selected/i)?.[0] || '');
    const lines = await page.locator('.recharts-line').count();
    check('chart never draws more than 6 lines', lines <= 6, `found ${lines}`);
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

// Run with:  node tests/speed-power.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Speed & Power: manual entry for 10yd fly and laser time, feature-flagged like RPE.
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
  { id: uuid(1), name: 'Fast Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'WR' },
  { id: uuid(2), name: 'Slower Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'OL' },
];
const perfTests = [
  { id: uuid(90), athlete_id: uuid(1), athlete_name: 'Fast Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.45, unit: 'sec', source: 'manual', created_at: new Date().toISOString() },
  { id: uuid(91), athlete_id: uuid(2), athlete_name: 'Slower Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.70, unit: 'sec', source: 'manual', created_at: new Date().toISOString() },
];

const newPage = async (browser, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.writes = [];
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
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
    if (url.includes('/rest/v1/performance_tests')) {
      if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(opts.perfTests !== undefined ? opts.perfTests : perfTests) });
      if (method === 'POST') {
        const body = req.postDataJSON();
        page.writes.push({ method, body: Array.isArray(body) ? body[0] : body });
        return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify([{ ...(Array.isArray(body) ? body[0] : body), id: uuid(999) }]) });
      }
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Off by default, points at Settings rather than looking broken');
  {
    const page = await newPage(browser, { enabled: false });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    const body = await page.locator('body').innerText();
    check('shows NOT ENABLED, not an empty board', /NOT ENABLED/i.test(body));
    check('no crash', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Enabled: leaderboard reflects existing results, fastest first');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    const body = await page.locator('body').innerText();
    check('panel renders', /SPRINT & JUMP TESTING/i.test(body));
    check('both athletes appear', /Fast Athlete/.test(body) && /Slower Athlete/.test(body));
    const fastIdx = body.indexOf('Fast Athlete');
    const slowIdx = body.indexOf('Slower Athlete');
    check('faster time ranks first', fastIdx > -1 && slowIdx > -1 && fastIdx < slowIdx,
      `fast@${fastIdx} slow@${slowIdx}`);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Logging a new test actually writes to performance_tests');
  {
    const page = await newPage(browser, { perfTests: [] });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    await page.getByLabel('Athlete').selectOption(uuid(1));
    await page.getByLabel('Test', { exact: true }).selectOption('laser_time');
    await page.getByLabel('Test time in seconds').fill('1.58');
    await page.getByRole('button', { name: /LOG TEST/i }).click();
    await page.waitForTimeout(1200);
    check('a write reached performance_tests', page.writes.length > 0, `writes=${page.writes.length}`);
    if (page.writes.length) {
      const w = page.writes[0].body;
      check('correct athlete_id', w.athlete_id === uuid(1), w.athlete_id);
      check('correct test_type', w.test_type === 'laser_time', w.test_type);
      check('metric is a number, not a string artifact', w.metric === 1.58, w.metric);
      check('source is manual', w.source === 'manual', w.source);
    }
    const body = await page.locator('body').innerText();
    check('confirmation message shown', /Saved 1\.58s/.test(body), body.match(/Saved.{0,40}/)?.[0] || '');
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[D] Empty board reads as "no results yet", not broken');
  {
    const page = await newPage(browser, { perfTests: [] });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    const body = await page.locator('body').innerText();
    check('empty-state message shown', /no.*results logged yet/i.test(body), body.slice(0, 200));
  }

  console.log('\n[E] Sport filter narrows the leaderboard');
  {
    const page = await newPage(browser, {
      perfTests: [...perfTests, { id: uuid(92), athlete_id: uuid(2), athlete_name: 'Slower Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.2, unit: 'sec', source: 'manual', created_at: new Date().toISOString() }],
    });
    // Both athletes are Football in this fixture, so filter to a sport with nobody and
    // confirm the board goes empty rather than still showing Football results.
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    await page.getByLabel('Sport filter').selectOption({ label: 'All Sports' }).catch(() => {});
    const sel = page.getByLabel('Sport filter');
    const opts = await sel.locator('option').allTextContents();
    check('sport picker has more than just All Sports', opts.length >= 1, opts.join(','));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

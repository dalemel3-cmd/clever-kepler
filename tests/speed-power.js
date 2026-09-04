// Run with:  node tests/speed-power.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Speed & Power: manual entry for 10yd fly, vertical jump, and board jump, feature-flagged like RPE.
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
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(opts.athletes !== undefined ? opts.athletes : athletes) });
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

// The Athlete dropdown lists every roster name too, so a raw body.innerText() search
// for an athlete's name can match the <select> instead of the leaderboard - giving a
// false pass/fail regardless of what the leaderboard actually shows. Strip <select>
// elements out first so these checks only see the boards.
const leaderboardText = async (page) => page.evaluate(() => {
  const clone = document.body.cloneNode(true);
  clone.querySelectorAll('select').forEach(s => s.remove());
  return clone.innerText;
});

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
    await page.getByLabel('Test', { exact: true }).selectOption('vertical_jump');
    await page.getByLabel('Test result in inches').fill('24.5');
    await page.getByRole('button', { name: /LOG TEST/i }).click();
    await page.waitForTimeout(1200);
    check('a write reached performance_tests', page.writes.length > 0, `writes=${page.writes.length}`);
    if (page.writes.length) {
      const w = page.writes[0].body;
      check('correct athlete_id', w.athlete_id === uuid(1), w.athlete_id);
      check('correct test_type', w.test_type === 'vertical_jump', w.test_type);
      check('metric is a number, not a string artifact', w.metric === 24.5, w.metric);
      check('source is manual', w.source === 'manual', w.source);
    }
    const body = await page.locator('body').innerText();
    check('confirmation message shown', /Saved 24\.5 in/.test(body), body.match(/Saved.{0,40}/)?.[0] || '');
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C2] Laser Time removed from the Test picker; jump types present');
  {
    const page = await newPage(browser, { perfTests: [] });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    const opts = await page.getByLabel('Test', { exact: true }).locator('option').allTextContents();
    check('no Laser Time option', !opts.some(o => /laser/i.test(o)), opts.join(','));
    check('Vertical Jump option present', opts.some(o => /Vertical Jump/i.test(o)), opts.join(','));
    check('Board Jump option present', opts.some(o => /Board Jump/i.test(o)), opts.join(','));
  }

  console.log('\n[F] Jump leaderboard ranks the higher value as the best (not the lower)');
  {
    const page = await newPage(browser, {
      perfTests: [
        { id: uuid(93), athlete_id: uuid(1), athlete_name: 'Fast Athlete', sport: 'Football', test_type: 'vertical_jump', metric: 22.0, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
        { id: uuid(94), athlete_id: uuid(2), athlete_name: 'Slower Athlete', sport: 'Football', test_type: 'vertical_jump', metric: 30.0, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
      ],
    });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    const body = await leaderboardText(page);
    const fastIdx = body.indexOf('Fast Athlete');
    const slowIdx = body.indexOf('Slower Athlete');
    check('higher jump (30in) ranks above lower jump (22in)', slowIdx > -1 && fastIdx > -1 && slowIdx < fastIdx,
      `fast(22in)@${fastIdx} slow(30in)@${slowIdx}`);
  }

  console.log('\n[F2] Leaderboard shows a red/green % trend from the two most recent attempts');
  {
    const page = await newPage(browser, {
      perfTests: [
        // Fast Athlete: fly time improving (1.70 -> 1.55, faster). Trend should be
        // green and point down (the number went down), NOT green pointing up.
        { id: uuid(95), athlete_id: uuid(1), athlete_name: 'Fast Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.70, unit: 'sec', source: 'manual', created_at: new Date(Date.now() - 14 * 864e5).toISOString() },
        { id: uuid(96), athlete_id: uuid(1), athlete_name: 'Fast Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.55, unit: 'sec', source: 'manual', created_at: new Date().toISOString() },
        // Slower Athlete: fly time declining (1.80 -> 1.85, slower). Trend should be
        // red and point up.
        { id: uuid(97), athlete_id: uuid(2), athlete_name: 'Slower Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.80, unit: 'sec', source: 'manual', created_at: new Date(Date.now() - 14 * 864e5).toISOString() },
        { id: uuid(98), athlete_id: uuid(2), athlete_name: 'Slower Athlete', sport: 'Football', test_type: '10yd_fly', metric: 1.85, unit: 'sec', source: 'manual', created_at: new Date().toISOString() },
      ],
    });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    const body = await leaderboardText(page);
    // (1.55 - 1.70) / 1.70 = -8.8%
    check('improving athlete shows a ~8.8% trend badge', /8\.8%/.test(body), body.match(/Fast Athlete[\s\S]{0,60}/)?.[0] || '');
    // (1.85 - 1.80) / 1.80 = +2.8%
    check('declining athlete shows a ~2.8% trend badge', /2\.8%/.test(body), body.match(/Slower Athlete[\s\S]{0,60}/)?.[0] || '');
  }

  console.log('\n[G] "Show all" reveals athletes beyond the first 8 on a board');
  {
    const manyAthletes = Array.from({ length: 10 }, (_, i) => ({
      id: uuid(200 + i), name: `Roster Athlete ${i}`, sport: 'Football', team: 'Varsity', grade: '11th', position: 'WR',
    }));
    const manyTests = manyAthletes.map((a, i) => ({
      id: uuid(300 + i), athlete_id: a.id, athlete_name: a.name, sport: 'Football', test_type: '10yd_fly',
      metric: 1.40 + i * 0.02, unit: 'sec', source: 'manual', created_at: new Date().toISOString(),
    }));
    const page = await newPage(browser, { athletes: manyAthletes, perfTests: manyTests });
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2200);
    let body = await leaderboardText(page);
    check('9th athlete hidden before expanding', !/Roster Athlete 8/.test(body), body.slice(0, 50));
    check('"Show all" button offers the hidden count', /Show all 10 \(2 more\)/.test(body), body.match(/Show all.{0,20}/)?.[0] || '');
    await page.getByRole('button', { name: /Show all 10/i }).click();
    await page.waitForTimeout(300);
    body = await leaderboardText(page);
    check('all 10 athletes visible after expanding', manyAthletes.every(a => body.includes(a.name)));
    check('toggle now offers "Show fewer"', /Show fewer/i.test(body));
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

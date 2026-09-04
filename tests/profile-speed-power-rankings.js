// Run with:  node tests/profile-speed-power-rankings.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// An athlete's profile page should show their Speed & Power best markers plus where
// they rank overall and within their own sport, and call out the weakest-ranked test
// as the thing to work on.
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

// 5 Football athletes and 1 WBB athlete. Target Athlete is 3rd of 5 in Football on
// vertical jump (so mid-pack overall/sport), but dead last on board jump within
// Football - that should be the flagged focus area, not vertical jump.
const athletes = [
  { id: uuid(1), name: 'Target Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'WR' },
  { id: uuid(2), name: 'Best Jumper', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' },
  { id: uuid(3), name: 'Mid Jumper', sport: 'Football', team: 'Varsity', grade: '11th', position: 'OL' },
  { id: uuid(4), name: 'Low Jumper', sport: 'Football', team: 'JV', grade: '10th', position: 'DL' },
  { id: uuid(5), name: 'Lowest Jumper', sport: 'Football', team: 'JV', grade: '10th', position: 'DB' },
  { id: uuid(6), name: 'Other Sport Athlete', sport: 'WBB', team: 'Varsity', grade: '12th', position: 'G' },
];

const perfTests = [
  // vertical_jump: Target Athlete lands 3rd of 5 in Football.
  { id: uuid(90), athlete_id: uuid(2), athlete_name: 'Best Jumper', sport: 'Football', test_type: 'vertical_jump', metric: 30.0, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
  { id: uuid(91), athlete_id: uuid(3), athlete_name: 'Mid Jumper', sport: 'Football', test_type: 'vertical_jump', metric: 27.0, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
  { id: uuid(92), athlete_id: uuid(1), athlete_name: 'Target Athlete', sport: 'Football', test_type: 'vertical_jump', metric: 25.0, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
  { id: uuid(93), athlete_id: uuid(4), athlete_name: 'Low Jumper', sport: 'Football', test_type: 'vertical_jump', metric: 22.0, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
  { id: uuid(94), athlete_id: uuid(5), athlete_name: 'Lowest Jumper', sport: 'Football', test_type: 'vertical_jump', metric: 20.0, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
  // board_jump: Target Athlete is dead last of 5 in Football - the weakest ranking of
  // the two tests they've done, so this should be the flagged focus area.
  { id: uuid(95), athlete_id: uuid(2), athlete_name: 'Best Jumper', sport: 'Football', test_type: 'board_jump', metric: 100, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
  { id: uuid(96), athlete_id: uuid(3), athlete_name: 'Mid Jumper', sport: 'Football', test_type: 'board_jump', metric: 95, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
  { id: uuid(97), athlete_id: uuid(4), athlete_name: 'Low Jumper', sport: 'Football', test_type: 'board_jump', metric: 90, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
  { id: uuid(98), athlete_id: uuid(5), athlete_name: 'Lowest Jumper', sport: 'Football', test_type: 'board_jump', metric: 85, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
  { id: uuid(99), athlete_id: uuid(1), athlete_name: 'Target Athlete', sport: 'Football', test_type: 'board_jump', metric: 80, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
];

const newPage = async (browser, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
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
    if (url.includes('/rest/v1/performance_tests') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(opts.perfTests !== undefined ? opts.perfTests : perfTests) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

const openProfile = async (page, name) => {
  await page.goto(`${APP}/#profiles`); await page.waitForTimeout(2200);
  await page.getByText(name, { exact: true }).first().click();
  await page.waitForTimeout(700);
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Off: no Speed & Power section on the profile');
  {
    const page = await newPage(browser, { enabled: false });
    await openProfile(page, 'Target Athlete');
    const body = await page.locator('body').innerText();
    check('no "TESTING PROFILE" section shown', !/TESTING PROFILE/i.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Shows best marker and both rankings per test type');
  {
    const page = await newPage(browser);
    await openProfile(page, 'Target Athlete');
    const body = await page.locator('body').innerText();
    check('section renders', /TESTING PROFILE/i.test(body));
    check('vertical jump best value shown', /25\.0 in/.test(body), body.match(/25[\s\S]{0,10}/)?.[0] || '');
    check('vertical jump overall rank (3rd of 6 rostered, 5 tested)', /#3 of 5 overall/.test(body), body.match(/#\d of \d overall/g)?.join(' | ') || '');
    check('vertical jump sport rank', /#3 of 5 in Football/.test(body), body.match(/#\d of \d in Football/g)?.join(' | ') || '');
    check('board jump best value shown', /80\.0 in/.test(body));
    check('board jump rank is last (5 of 5)', /#5 of 5 overall/.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[C] Flags the weakest-ranked test as the focus area, not the strongest');
  {
    const page = await newPage(browser);
    await openProfile(page, 'Target Athlete');
    const body = await page.locator('body').innerText();
    check('Board Jump named as the focus area', /Focus area: Board Jump/i.test(body), body.match(/Focus area:.{0,60}/)?.[0] || '');
    check('Vertical Jump is NOT named as the focus area', !/Focus area: Vertical Jump/i.test(body));
  }

  console.log('\n[D] Percentile bar and callout only reflect this athlete\'s sport, not the whole roster');
  {
    // Other Sport Athlete has no Football rivals - ranking them against WBB alone
    // (rather than lumping every sport together) should read as "#1 of 1".
    const withOther = [
      ...perfTests,
      { id: uuid(100), athlete_id: uuid(6), athlete_name: 'Other Sport Athlete', sport: 'WBB', test_type: 'vertical_jump', metric: 18.0, unit: 'in', source: 'manual', created_at: new Date().toISOString() },
    ];
    const page = await newPage(browser, { perfTests: withOther });
    await openProfile(page, 'Other Sport Athlete');
    const body = await page.locator('body').innerText();
    check('sole WBB athlete ranks #1 of 1 within their own sport', /#1 of 1 in WBB/.test(body), body.match(/#\d of \d in WBB/)?.[0] || '');
  }

  console.log('\n[E] An athlete with zero Speed & Power results reads as "no results", not broken');
  {
    const page = await newPage(browser);
    await openProfile(page, 'Other Sport Athlete'); // has no rows in the default fixture
    const body = await page.locator('body').innerText();
    check('empty-state message names the athlete', /No Speed & Power results logged for Other Sport Athlete/i.test(body), body.slice(0, 300));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

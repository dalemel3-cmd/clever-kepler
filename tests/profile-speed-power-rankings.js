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
  page.writes = []; // { method: 'PATCH'|'DELETE', url, body }
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
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(opts.weighIns || []) });
    if (url.includes('/rest/v1/performance_tests')) {
      if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(opts.perfTests !== undefined ? opts.perfTests : perfTests) });
      if (method === 'PATCH' || method === 'DELETE') {
        let body = null;
        try { body = req.postDataJSON(); } catch (e) {}
        page.writes.push({ method, url, body });
        return route.fulfill({ status: 204, headers: hdrs, body: '' });
      }
    }
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

  console.log('\n[F] History list: every attempt is visible, not just the PB, and the newest is marked');
  {
    // Target Athlete's vertical jump: two attempts, two weeks apart, improving.
    const withHistory = [
      ...perfTests,
      { id: uuid(101), athlete_id: uuid(1), athlete_name: 'Target Athlete', sport: 'Football', test_type: 'vertical_jump', metric: 23.0, unit: 'in', source: 'manual', created_at: new Date(Date.now() - 14 * 864e5).toISOString() },
    ];
    const page = await newPage(browser, { perfTests: withHistory });
    await openProfile(page, 'Target Athlete');
    let body = await page.locator('body').innerText();
    check('history is collapsed by default', !/23\.0 in/.test(body), body.slice(0, 50));
    await page.getByRole('button', { name: /History \(2\)/i }).click();
    await page.waitForTimeout(300);
    body = await page.locator('body').innerText();
    check('both attempts visible once expanded', /25\.0 in/.test(body) && /23\.0 in/.test(body));
    check('the PB attempt is starred', /★/.test(body));
    // (25.0 - 23.0) / 23.0 ~= +8.7%, and higher is better for a jump -> improving/green/down? no, up-arrow since value rose.
    check('trend badge reflects the two most recent attempts, not best-vs-best', /8\.7%/.test(body), body.match(/Vertical Jump[\s\S]{0,80}/)?.[0] || '');
  }

  console.log('\n[G] Editing an attempt sends a PATCH and updates what\'s shown');
  {
    const page = await newPage(browser, { perfTests: [perfTests[2]] }); // Target Athlete's one vertical_jump row, id uuid(92)
    await openProfile(page, 'Target Athlete');
    await page.getByRole('button', { name: /History \(1\)/i }).click();
    await page.waitForTimeout(300);
    await page.getByLabel('Edit result').first().click();
    await page.waitForTimeout(200);
    const valueInput = page.locator('input[type="text"]').last();
    await valueInput.fill('28');
    await page.getByRole('button', { name: /^SAVE$/i }).click();
    await page.waitForTimeout(500);
    check('a PATCH reached performance_tests', page.writes.some(w => w.method === 'PATCH'), JSON.stringify(page.writes));
    const patch = page.writes.find(w => w.method === 'PATCH');
    check('the PATCH carries the corrected value', patch && Number(patch.body.metric) === 28, JSON.stringify(patch));
    const body = await page.locator('body').innerText();
    check('the corrected value is reflected on screen', /28\.0 in/.test(body), body.match(/2[0-9]\.0 in/g)?.join(',') || '');
  }

  console.log('\n[H] Deleting an attempt asks for confirmation, then sends a DELETE');
  {
    const page = await newPage(browser, { perfTests: [perfTests[2]] });
    await openProfile(page, 'Target Athlete');
    await page.getByRole('button', { name: /History \(1\)/i }).click();
    await page.waitForTimeout(300);
    await page.getByLabel('Delete result').first().click();
    await page.waitForTimeout(300);
    check('no DELETE fires before confirming', page.writes.length === 0, JSON.stringify(page.writes));
    await page.getByRole('button', { name: /^Delete$/i }).click();
    await page.waitForTimeout(500);
    check('a DELETE reached performance_tests only after confirming', page.writes.some(w => w.method === 'DELETE'), JSON.stringify(page.writes));
  }

  console.log('\n[I] Speed & Power sits right under the name card, ahead of body weight/sleep');
  {
    const page = await newPage(browser);
    await openProfile(page, 'Target Athlete');
    const body = await page.locator('body').innerText();
    const spIdx = body.indexOf('TESTING PROFILE');
    const weightIdx = body.indexOf('BODY WEIGHT TRENDS');
    check('Speed & Power heading appears before Body Weight Trends', spIdx > -1 && weightIdx > -1 && spIdx < weightIdx, `sp@${spIdx} weight@${weightIdx}`);
  }

  console.log('\n[J] Name card is cleaned up: name, sport, org - nothing else');
  {
    const page = await newPage(browser);
    await openProfile(page, 'Target Athlete');
    const body = await page.locator('body').innerText();
    check('no "ATHLETE BIOMETRIC DOSSIER" eyebrow', !/ATHLETE BIOMETRIC DOSSIER/i.test(body));
    check('no tracking-mode badge', !/STANDARD TRACKING/i.test(body) && !/SLEEP ONLY MODE/i.test(body));
    check('subtitle reads Sport · org name', /Football/.test(body) && /Shiloh Athletics/.test(body));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[K] Sleep card shows a trend vs the night before, like the weight card');
  {
    const weighIns = [
      { id: uuid(200), athlete_id: uuid(1), athlete_name: 'Target Athlete', sport: 'Football', sleep_hrs: 6.0, created_at: new Date(Date.now() - 864e5).toISOString() },
      { id: uuid(201), athlete_id: uuid(1), athlete_name: 'Target Athlete', sport: 'Football', sleep_hrs: 7.5, created_at: new Date().toISOString() },
    ];
    const page = await newPage(browser, { weighIns });
    await openProfile(page, 'Target Athlete');
    const body = await page.locator('body').innerText();
    check('sleep trend shows +1.5 hr vs the night before', /\+1\.5 hr/.test(body), body.match(/AVERAGE SLEEP[\s\S]{0,150}/i)?.[0] || '');
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

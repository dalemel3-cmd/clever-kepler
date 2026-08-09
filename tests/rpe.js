// Run with:  node tests/rpe.js
// Requires a preview server on http://127.0.0.1:4173 (npm run build && npm run preview)
// and Playwright available (npm install --no-save playwright).
// All Supabase traffic is intercepted - these tests never touch the real database.
//
// Session RPE regression probes. The other suites carry no RPE rows in their fixtures,
// so they cannot catch the hazard this feature introduces: an RPE log has no weight, and
// every screen that treats "has a row" as "weighed in" quietly counts it anyway.
//
// What this asserts (docs/RPE-PLAN.md section 7):
//   1. The profile screen renders with RPE rows present (the Target icon was unimported,
//      which crashed the whole profile).
//   2. An RPE row never becomes an athlete's baseline, and never appears as a weight.
//   3. An RPE-only athlete is NOT counted as compliant / participating in Reports.
//   4. An RPE-only athlete still shows as an expired baseline (an RPE row is not activity).
//   5. Saving an RPE entry for an athlete who already weighed in today does NOT trigger
//      the overwrite prompt, and inserts a new row rather than blanking the weigh-in.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  // Weighs in normally AND logs RPE - the mixed case.
  { id: uuid(1), name: 'Mixed Logger', sport: 'Football', team: 'Varsity', grade: '11th', position: 'QB' },
  // Only ever logs RPE. Must not read as compliant, and must show an expired baseline.
  { id: uuid(2), name: 'Rpe Only', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' },
];

const logs = [
  // Mixed Logger: a real baseline weigh-in, plus RPE entries on top of it.
  { id: uuid(101), athlete_id: uuid(1), athlete_name: 'Mixed Logger', sport: 'Football', weight_lbs: 200, sleep_hrs: 8, rpe: null, session_minutes: null, session_label: null, session_type: null, created_at: ago(6), is_baseline: true },
  { id: uuid(102), athlete_id: uuid(1), athlete_name: 'Mixed Logger', sport: 'Football', weight_lbs: 198, sleep_hrs: 8, rpe: null, session_minutes: null, session_label: null, session_type: null, created_at: ago(0.2), is_baseline: false },
  // RPE row: weight 0, as the cloud payload writes it.
  { id: uuid(103), athlete_id: uuid(1), athlete_name: 'Mixed Logger', sport: 'Football', weight_lbs: 0, sleep_hrs: 0, rpe: 9, session_minutes: 75, session_label: 'Lift', session_type: 'rpe', created_at: ago(0.1), is_baseline: false },

  // Rpe Only: nothing but RPE, and the most recent one is today.
  { id: uuid(201), athlete_id: uuid(2), athlete_name: 'Rpe Only', sport: 'Football', weight_lbs: 0, sleep_hrs: 0, rpe: 8, session_minutes: 60, session_label: 'Run', session_type: 'rpe', created_at: ago(2), is_baseline: false },
  { id: uuid(202), athlete_id: uuid(2), athlete_name: 'Rpe Only', sport: 'Football', weight_lbs: 0, sleep_hrs: 0, rpe: 7, session_minutes: 45, session_label: 'Combined', session_type: 'rpe', created_at: ago(0.1), is_baseline: false },
];

// RPE is off by default; seed settings with it enabled so the screens actually render it.
const SEED_SETTINGS = { enableRpe: true, rpeTrackDuration: true, rpeScaleMax: 10, rpeHighThreshold: 8, baselineExpiryDays: 14, rpeSessionLabels: ['Lift', 'Run', 'Combined'] };

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  const newPage = async (opts = {}) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubAuth(page);
    await page.addInitScript((s) => {
      try {
        const prev = JSON.parse(localStorage.getItem('hpd_settings') || '{}');
        localStorage.setItem('hpd_settings', JSON.stringify({ ...prev, ...s }));
      } catch (e) { /* first-run: nothing stored yet */ }
    }, SEED_SETTINGS);
    page.writes = [];
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(String(e).slice(0, 200)));
    await page.route(SUPA, async (route) => {
      const req = route.request(); const url = req.url(); const method = req.method();
      const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
      if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (url.includes('/realtime/')) return route.abort();
      if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
      if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
      if (url.includes('/rest/v1/athletes')) {
        if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(opts.athletes || athletes) });
        return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
      }
      if (url.includes('/rest/v1/weigh_ins')) {
        if (method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(opts.logs || logs) });
        const body = req.postDataJSON();
        page.writes.push({ method, url, body: Array.isArray(body) ? body[0] : body });
        if (method === 'PATCH') return route.fulfill({ status: 204, headers: hdrs, body: '' });
        return route.fulfill({ status: 201, headers: hdrs, body: JSON.stringify([{ ...(Array.isArray(body) ? body[0] : body), id: uuid(900) }]) });
      }
      return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    });
    return { ctx, page };
  };

  // ---- 1 + 2: profile renders, and the RPE row is not treated as a weight/baseline ----
  console.log('\n[RPE-A] Athlete profile with RPE history');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1600);
    await page.getByText('Mixed Logger').first().click(); await page.waitForTimeout(1600);

    const crashed = await page.getByText('Something went wrong.').count();
    check('profile renders without crashing', crashed === 0, page.errors[0] || '');
    check('no page errors (Target icon imported)', page.errors.length === 0, page.errors.join(' | '));

    const text = await page.locator('body').innerText();
    // The RPE row carries weight 0. If it leaked into the weight series, "0 lbs" shows up
    // as a current/latest weight somewhere on the profile.
    check('no 0 lbs weight leaked from the RPE row', !/\b0(\.0)? lbs\b/.test(text), text.match(/.{0,40}0 lbs.{0,20}/)?.[0] || '');
    check('baseline still reads 200 lbs', /200/.test(text));
    await ctx.close();
  }

  // ---- 3 + 4: Reports must not count an RPE row as a weigh-in ----
  console.log('\n[RPE-B] Reports compliance and expired baselines');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${APP}/#reports`); await page.waitForTimeout(2000);

    const crashed = await page.getByText('Something went wrong.').count();
    check('reports renders without crashing', crashed === 0, page.errors[0] || '');

    const text = await page.locator('body').innerText();
    // Rpe Only has never weighed in. Its last RPE row is today, so any "has a row = active"
    // logic would report 100% compliance and hide the expired baseline entirely.
    check('compliance is not 100% (RPE-only athlete excluded)', !/\b100%/.test(text), text.match(/.{0,50}100%.{0,10}/)?.[0] || '');
    // The expired-baseline table stamps a status string; an RPE-only athlete has never
    // weighed in, so they must appear with the "no weight log" status specifically -
    // just finding their name somewhere on the page proves nothing.
    check('RPE-only athlete shows "No Weight Log Yet"', /No Weight Log Yet/i.test(text),
      'RPE rows are being counted as weigh-in activity');
    await ctx.close();
  }

  // ---- 5: an RPE entry must not overwrite the same day's weigh-in ----
  console.log('\n[RPE-C] RPE entry does not clobber today\'s weigh-in');
  {
    // Only the morning weigh-in exists today - no RPE row yet. (Overwriting an *earlier
    // RPE entry* from the same day is intended behaviour, so that row would legitimately
    // trigger the prompt and would not test anything.)
    const { ctx, page } = await newPage({ logs: logs.filter(l => l.id !== uuid(103)) });
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1800);

    const body = await page.locator('body').innerText();
    if (!/RPE/i.test(body)) {
      check('RPE mode is reachable on the entry screen', false, 'no RPE control rendered - is enableRpe seeding working?');
      await ctx.close();
    } else {
      // Switch the kiosk into RPE mode first - the athlete cards sit over the toggle row,
      // so picking the athlete first makes the mode button unclickable.
      const rpeBtn = page.getByRole('button', { name: /Session RPE/i }).first();
      if (await rpeBtn.count()) { await rpeBtn.click(); await page.waitForTimeout(600); }
      // Mixed Logger already has a weigh-in dated today (uuid 102).
      await page.getByText('Mixed Logger').first().click().catch(() => {});
      await page.waitForTimeout(900);

      await page.getByLabel('Session RPE').fill('7');
      await page.getByLabel('Session Duration').fill('60');
      // Session labels are driven by settings.rpeSessionLabels, seeded above.
      await page.getByRole('button', { name: 'Lift', exact: true }).first().click();
      await page.getByRole('button', { name: /SAVE RPE/i }).first().click();
      await page.waitForTimeout(1800);

      // Guard against a vacuous pass: if the save never fired, "no overwrite prompt" and
      // "no PATCH" would both be trivially true.
      check('the RPE save actually reached the network', page.writes.length > 0,
        'no weigh_ins write was issued - the probe did not exercise the save path');

      const overwritePrompt = await page.getByText(/Overwrite Today Log/i).count();
      check('no "Overwrite Today Log?" prompt for an RPE entry', overwritePrompt === 0,
        'RPE was matched against the morning weigh-in - confirming would blank the weight');

      const patches = page.writes.filter(w => w.method === 'PATCH');
      check('RPE was inserted, not PATCHed over the weigh-in', patches.length === 0,
        JSON.stringify(patches[0]?.body || {}).slice(0, 160));
      await ctx.close();
    }
  }

  console.log(`\n${fail === 0 ? 'ALL RPE PROBES PASSED' : 'RPE PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 1 && 0 : 1);
})();

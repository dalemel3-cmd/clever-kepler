// Run with:  node tests/settings-live.js
// Requires a preview server on http://127.0.0.1:4173 (npm run build && npm run preview)
// and Playwright available (npm install --no-save playwright).
// All Supabase traffic is intercepted - these tests never touch the real database.
/* v4.4.0: prove settings are live end-to-end (no hardcoded values left in the paths). */
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

// CHROMIUM_PATH lets CI point at a preinstalled browser; otherwise Playwright's own.
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const athletes = [{ id: uuid(1), name: 'Probe Athlete', sport: 'Football', team: 'V', grade: '11th', position: 'QB' }];
const dayAgo = (n) => new Date(Date.now() - n * 864e5).toISOString();
const logs = [
  { id: uuid(101), athlete_id: uuid(1), athlete_name: 'Probe Athlete', sport: 'Football', weight_lbs: 200, sleep_hrs: 7.0, created_at: dayAgo(4), session_type: null, is_baseline: true },
  { id: uuid(102), athlete_id: uuid(1), athlete_name: 'Probe Athlete', sport: 'Football', weight_lbs: 197, sleep_hrs: 7.0, created_at: dayAgo(0.02), session_type: null, is_baseline: false },
  { id: uuid(104), athlete_id: uuid(1), athlete_name: 'Probe Athlete', sport: 'Football', weight_lbs: 198, sleep_hrs: 7.0, created_at: dayAgo(2), session_type: null, is_baseline: false },
  { id: uuid(103), athlete_id: uuid(1), athlete_name: 'Probe Athlete', sport: 'Football', weight_lbs: 193, sleep_hrs: 0, created_at: dayAgo(0.01), session_type: 'post_practice', is_baseline: false },
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await stubAuth(page);
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));

  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'access-control-expose-headers': 'Content-Range', 'content-range': `0-0/${logs.length}` };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  let pass = 0, fail = 0;
  const check = (name, ok, detail = '') => {
    if (ok) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
  };

  const setSettings = async (patch) => {
    await page.evaluate((p) => {
      const cur = JSON.parse(localStorage.getItem('hpd_settings') || '{}');
      localStorage.setItem('hpd_settings', JSON.stringify({ ...cur, ...p }));
    }, patch);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2200);
  };

  await page.goto(APP, { waitUntil: 'load' });
  await page.waitForTimeout(2200);

  // 1. Program identity flows to the sidebar
  await setSettings({ organizationName: 'Testville Prep', coachName: 'Jamie Rivera', programName: 'Sports Science' });
  let body = await page.locator('body').innerText();
  // The org name now lives on the login screen / mobile More sheet, not the desktop sidebar.
  check('[IDENTITY] coach name shown', /JAMIE RIVERA/i.test(body));
  check('[IDENTITY] coach initials JR', body.includes('JR'));

  // 2. Dehydration threshold drives the Dashboard "Needs Attention" list, which is now
  //    sourced straight from the same canonical dailyAlerts list Alerts uses (dehydration +
  //    sleep). 197 vs 200 baseline = 1.5% drop. At 2% -> not flagged; at 1% -> flagged.
  // dehydrationThreshold is a flat lbs drop (not %): 200 -> 197 is a 3.0 lb drop.
  await setSettings({ dehydrationThreshold: 3.5 });
  body = await page.locator('body').innerText();
  check('[DEHYDRATION] 3.5 lb threshold -> 3 lb drop is clean', body.includes('within safe baseline and sleep limits'));
  await setSettings({ dehydrationThreshold: 2.0 });
  body = await page.locator('body').innerText();
  check('[DEHYDRATION] 2 lb threshold -> athlete flagged', /-3\.0 lbs drop \(-1\.5%/.test(body));

  // 3. Reports headers echo the configured thresholds
  await setSettings({ dehydrationThreshold: 3.3, baselineExpiryDays: 21 });
  await page.goto(`${APP}/#reports`); await page.waitForTimeout(1800);
  body = await page.locator('body').innerText();
  check('[REPORTS HDR] dehydration header echoes 3.3 lbs', /3\.3 LBS DOWN/i.test(body));
  check('[REPORTS HDR] baseline section echoes 21 days', /21\+ days/i.test(body));

  // 4. Sleep bands: with target 7.5 a 7.0h log is "Adequate"; raise deficit cutoff to 7.2 -> "Deficit"
  await setSettings({ sleepThreshold: 6.5, sleepTargetHours: 7.5 });
  await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1500);
  await page.locator('text=Probe Athlete').first().click(); await page.waitForTimeout(1800);
  body = await page.locator('body').innerText();
  const adequate = body.includes('Adequate Recovery');
  await setSettings({ sleepThreshold: 7.2 });
  await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1200);
  await page.locator('text=Probe Athlete').first().click(); await page.waitForTimeout(1800);
  body = await page.locator('body').innerText();
  const deficit = body.includes('Sleep Deficit Warning');
  check('[SLEEP BANDS] 7.0h @ cutoff 6.5 -> Adequate', adequate);
  check('[SLEEP BANDS] 7.0h @ cutoff 7.2 -> Deficit', deficit);

  // 5. Sleep chart target line label follows the setting
  await setSettings({ sleepChartTargetHours: 9.0 });
  await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1200);
  await page.locator('text=Probe Athlete').first().click(); await page.waitForTimeout(1800);
  body = await page.locator('body').innerText();
  check('[SLEEP CHART] target line reads 9.0h Target', body.includes('9.0h Target'));

  // 6. Fluid replacement rate feeds the hydration Rx
  await setSettings({ fluidOzPerLb: 50, sleepThreshold: 6.5 });
  await page.goto(`${APP}/#alerts`); await page.waitForTimeout(1800);
  body = await page.locator('body').innerText();
  const rx = body.match(/Drink (\d+) oz/);
  console.log(`  INFO  [FLUID Rx] oz/lb=50 -> "${rx ? rx[0] : '(no card)'}"`);

  // 7. Sports list drives pickers
  // Groups deliberately hides sports with no athletes; the entry screen's sport pills
  // list every configured sport, so that's where a custom list is visible.
  await setSettings({ sportsList: ['Curling', 'Fencing'] });
  await page.goto(`${APP}/#entry`); await page.waitForTimeout(1600);
  body = await page.locator('body').innerText();
  const upper = body.toUpperCase();
  check('[SPORTS] custom sports shown', upper.includes('CURLING') && upper.includes('FENCING'));
  check('[SPORTS] roster sport still present', upper.includes('FOOTBALL'));

  // 8. Weight bounds enforced from settings
  await setSettings({ maxWeightLbs: 150 });
  await page.goto(`${APP}/#entry`); await page.waitForTimeout(1500);
  await page.locator('text=Probe Athlete').first().click(); await page.waitForTimeout(700);
  await page.locator('input[aria-label="Body weight (lbs)"]').fill('200');
  const disabledOver = await page.getByRole('button', { name: /CONFIRM & SYNC ATHLETE/i }).first().isDisabled();
  await page.locator('input[aria-label="Body weight (lbs)"]').fill('140');
  const enabledUnder = !(await page.getByRole('button', { name: /CONFIRM & SYNC ATHLETE/i }).first().isDisabled());
  check('[WEIGHT BOUNDS] 200 lbs blocked at max 150', disabledOver);
  check('[WEIGHT BOUNDS] 140 lbs allowed', enabledUnder);

  // 9. Install instructions use the real host, not a baked-in URL
  await page.goto(`${APP}/#settings`); await page.waitForTimeout(1600);
  body = await page.locator('body').innerText();
  check('[HOST] instructions show real host', body.includes('127.0.0.1:4173'));
  check('[HOST] old hardcoded URL gone', !body.includes('clever-kepler'));

  // 10. Restore defaults round-trips
  await page.getByRole('button', { name: 'RESTORE DEFAULTS', exact: true }).click(); await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Restore Defaults', exact: true }).click(); await page.waitForTimeout(900);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_settings')));
  check('[RESET] dehydration back to 2', after.dehydrationThreshold === 2);
  check('[RESET] org back to default', after.organizationName === 'Shiloh Athletics');
  check('[RESET] sports list restored', (after.sportsList || []).length === 12, `len=${(after.sportsList || []).length}`);

  // 11. Corrupt settings must not brick the app
  await page.evaluate(() => localStorage.setItem('hpd_settings', '{"dehydrationThreshold":"banana","sleepThreshold":-99,"sportsList":"notanarray"}'));
  await page.goto(`${APP}/#dashboard`, { waitUntil: 'load' }); await page.waitForTimeout(2400);
  const crashed = await page.getByText('Something went wrong.').count();
  body = await page.locator('body').innerText();
  const normalized = await page.evaluate(() => {
    // Force the app to persist its normalized view of the corrupt input.
    return JSON.parse(localStorage.getItem('hpd_settings'));
  });
  check('[CORRUPT] app did not crash', crashed === 0);
  check('[CORRUPT] still renders dashboard', body.toUpperCase().includes('TOTAL ATHLETES'));
  check('[CORRUPT] bad values coerced in UI', !body.includes('banana'));
  console.log(`[CORRUPT] stored raw stays untouched until save: ${JSON.stringify(normalized).slice(0,80)}`);

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE FAILURE:', e); process.exit(1); });

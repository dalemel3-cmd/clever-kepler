// Run with:  node tests/settings-live.js
// Requires a preview server on http://127.0.0.1:4173 (npm run build && npm run preview)
// and Playwright available (npm install --no-save playwright).
// All Supabase traffic is intercepted - these tests never touch the real database.
/* v4.4.0: prove settings are live end-to-end (no hardcoded values left in the paths). */
import { chromium } from 'playwright';

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
  { id: uuid(103), athlete_id: uuid(1), athlete_name: 'Probe Athlete', sport: 'Football', weight_lbs: 193, sleep_hrs: 0, created_at: dayAgo(0.01), session_type: 'post_practice', is_baseline: false },
];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));

  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json', 'access-control-expose-headers': 'Content-Range', 'content-range': `0-0/${logs.length}` };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

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
  console.log(`[IDENTITY] org shown=${body.includes('Testville Prep')} coach shown=${body.includes('JAMIE RIVERA') || body.includes('Jamie Rivera')} initials JR=${body.includes('JR')} (all true expected)`);

  // 2. Dehydration threshold drives the dashboard attention list.
  //    197 vs 200 baseline = 1.5% drop. At 2% -> not flagged; at 1% -> flagged.
  await setSettings({ dehydrationThreshold: 2.0 });
  body = await page.locator('body').innerText();
  const at2 = body.includes('within safe baseline limits');
  await setSettings({ dehydrationThreshold: 1.0 });
  body = await page.locator('body').innerText();
  const at1 = /down 1\.5%/.test(body);
  console.log(`[DEHYDRATION] 2% -> clean=${at2} (true expected); 1% -> flags athlete=${at1} (true expected)`);

  // 3. Reports headers echo the configured thresholds
  await setSettings({ dehydrationThreshold: 3.3, baselineExpiryDays: 21 });
  await page.goto(`${APP}/#reports`); await page.waitForTimeout(1800);
  body = await page.locator('body').innerText();
  console.log(`[REPORTS HDR] shows "≥3.3%"=${body.includes('3.3%')} shows ">21 DAYS"=${body.includes('21 DAYS')} (both true expected)`);

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
  console.log(`[SLEEP BANDS] 7.0h @cutoff6.5 -> Adequate=${adequate}; @cutoff7.2 -> Deficit=${deficit} (both true expected)`);

  // 5. Sleep chart target line label follows the setting
  await setSettings({ sleepChartTargetHours: 9.0 });
  await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1200);
  await page.locator('text=Probe Athlete').first().click(); await page.waitForTimeout(1800);
  body = await page.locator('body').innerText();
  console.log(`[SLEEP CHART] target line reads "9.0h Target"=${body.includes('9.0h Target')} (true expected)`);

  // 6. Fluid replacement rate feeds the hydration Rx
  await setSettings({ fluidOzPerLb: 50, sleepThreshold: 6.5 });
  await page.goto(`${APP}/#alerts`); await page.waitForTimeout(1800);
  body = await page.locator('body').innerText();
  const rx = body.match(/Drink (\d+) oz/);
  console.log(`[FLUID Rx] oz/lb=50 -> "${rx ? rx[0] : '(no card)'}" (should scale with the setting)`);

  // 7. Sports list drives pickers
  await setSettings({ sportsList: ['Curling', 'Fencing'] });
  await page.goto(`${APP}/#groups`); await page.waitForTimeout(1600);
  body = await page.locator('body').innerText();
  const upper = body.toUpperCase();
  console.log(`[SPORTS] custom list shown=${upper.includes('CURLING') && upper.includes('FENCING')}, roster sport still present=${upper.includes('FOOTBALL')} (both true expected)`);

  // 8. Weight bounds enforced from settings
  await setSettings({ maxWeightLbs: 150 });
  await page.goto(`${APP}/#entry`); await page.waitForTimeout(1500);
  await page.locator('text=Probe Athlete').first().click(); await page.waitForTimeout(700);
  await page.locator('input[aria-label="Body weight (lbs)"]').fill('200');
  const disabledOver = await page.getByRole('button', { name: /Save Record & Complete|Save as regular entry/ }).first().isDisabled();
  await page.locator('input[aria-label="Body weight (lbs)"]').fill('140');
  const enabledUnder = !(await page.getByRole('button', { name: /Save Record & Complete|Save as regular entry/ }).first().isDisabled());
  console.log(`[WEIGHT BOUNDS] max=150 -> 200lbs blocked=${disabledOver}, 140lbs allowed=${enabledUnder} (both true expected)`);

  // 9. Install instructions use the real host, not a baked-in URL
  await page.goto(`${APP}/#settings`); await page.waitForTimeout(1600);
  body = await page.locator('body').innerText();
  console.log(`[HOST] instructions show real host=${body.includes('127.0.0.1:4173')} old hardcoded URL gone=${!body.includes('clever-kepler')} (both true expected)`);

  // 10. Restore defaults round-trips
  await page.getByRole('button', { name: 'RESTORE DEFAULTS', exact: true }).click(); await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Restore Defaults', exact: true }).click(); await page.waitForTimeout(900);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_settings')));
  console.log(`[RESET] dehydration back to 2=${after.dehydrationThreshold === 2} org back to default=${after.organizationName === 'Shiloh Athletics'} sports restored=${(after.sportsList || []).length === 14} (all true expected)`);

  // 11. Corrupt settings must not brick the app
  await page.evaluate(() => localStorage.setItem('hpd_settings', '{"dehydrationThreshold":"banana","sleepThreshold":-99,"sportsList":"notanarray"}'));
  await page.goto(`${APP}/#dashboard`, { waitUntil: 'load' }); await page.waitForTimeout(2400);
  const crashed = await page.getByText('Something went wrong.').count();
  body = await page.locator('body').innerText();
  const normalized = await page.evaluate(() => {
    // Force the app to persist its normalized view of the corrupt input.
    return JSON.parse(localStorage.getItem('hpd_settings'));
  });
  console.log(`[CORRUPT] app crashed=${crashed > 0} (false expected), still renders dashboard=${body.toUpperCase().includes('TOTAL ATHLETES')} (true expected), bad values coerced in UI=${!body.includes('banana')}`);
  console.log(`[CORRUPT] stored raw stays untouched until save: ${JSON.stringify(normalized).slice(0,80)}`);

  console.log(`\npageErrors: ${errs.length} ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
})().catch(e => { console.error('PROBE FAILURE:', e); process.exit(1); });

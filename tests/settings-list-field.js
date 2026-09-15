// Run with:  node tests/settings-list-field.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v4.31.0: a comma-separated Settings list field (Lift Types, Session Labels, Duration
// Tiles) couldn't actually have a new item typed into it. The input's value was derived
// straight from the parsed-and-filtered array on every keystroke - typing a comma to
// start a second item produced a trailing empty entry that got filtered out before the
// next render, so the comma (and anything typed after it) visibly vanished immediately.
// Fixed by giving the field its own local text buffer, only committing the parsed list
// on blur/Enter.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const newPage = async (browser) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  page.errors = errors;
  await stubAuth(page);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

const openLiftSection = async (page) => {
  await page.getByLabel('Configuration section').selectOption({ label: 'LIFT TRACKER' });
  await page.waitForTimeout(400);
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[A] Typing a comma to start a new list item is not stripped mid-typing');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#settings`); await page.waitForTimeout(1600);
    await openLiftSection(page);
    const field = page.locator('#setting-liftTypes');
    await field.click();
    await field.press('End'); // clicking a pre-filled input can land the cursor mid-text
    // Type character by character (not .fill()) so we actually exercise onChange the
    // way a coach typing on a keyboard would, including the comma keystroke itself.
    await field.pressSequentially(', Front Squat', { delay: 20 });
    const beforeComma = await field.inputValue();
    check('typed text is intact before the next comma', beforeComma.endsWith('Front Squat'), beforeComma);
    await field.pressSequentially(', ', { delay: 20 });
    const afterComma = await field.inputValue();
    check('the comma is NOT stripped out immediately after typing it', afterComma.includes(', Front Squat,'), afterComma);
    check('the field still ends with what was just typed, not truncated', afterComma === 'Bench, Squat, Deadlift, Hang Clean, Power Clean, Front Squat, ', afterComma);
    await field.pressSequentially('Trap Bar Deadlift', { delay: 10 });
    const finalText = await field.inputValue();
    check('a second new item can actually be typed after the comma', finalText.endsWith('Trap Bar Deadlift'), finalText);
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log('\n[B] Blurring the field commits the parsed list, which then shows up as real buttons');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#settings`); await page.waitForTimeout(1600);
    await openLiftSection(page);
    const field = page.locator('#setting-liftTypes');
    await field.click();
    await field.press('End');
    await field.pressSequentially(', Trap Bar Deadlift', { delay: 10 });
    await field.blur();
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_settings') || '{}').liftTypes);
    check('committed list is not yet saved to storage (still needs Save All Settings)', stored === undefined || !stored?.includes?.('Trap Bar Deadlift'));
    await page.getByRole('button', { name: /SAVE ALL SETTINGS/i }).click();
    await page.waitForTimeout(600);
    const storedAfterSave = await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_settings') || '{}').liftTypes);
    check('the new exercise persists after Save All Settings', Array.isArray(storedAfterSave) && storedAfterSave.includes('Trap Bar Deadlift'), JSON.stringify(storedAfterSave));
    check('no page errors', page.errors.length === 0, page.errors.join(' | '));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

// Run with:  node tests/rpe-settings.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Covers the three things that made Session RPE invisible / broken on the kiosk:
//   1. Emoji in the entry-screen labels are real characters, not mojibake. The source
//      file had been saved through a CP437 round-trip, so "Weight + Sleep" rendered as
//      garbage on the live kiosk.
//   2. enableRpe is reachable from the Settings screen. The feature shipped behind a
//      flag with no switch anywhere in the UI, so it could never be turned on.
//   3. A kiosk left in 'rpe' mode does not get stranded when RPE is off - the mode
//      button that would let you leave is hidden along with the feature.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;


// Program Configuration renders one field group at a time behind a dropdown (v4.12.0),
// so the RPE fields are not in the DOM until that section is selected.
const openRpeSection = async (page) => {
  await page.getByLabel('Configuration section').selectOption({ label: 'SESSION RPE (INTERNAL LOAD)' });
  await page.waitForTimeout(400);
};

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [{ id: uuid(1), name: 'Test Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'QB' }];

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const newPage = async (seed = null) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await stubAuth(page);
    if (seed) await page.addInitScript((s) => {
      if (s.settings) localStorage.setItem('hpd_settings', JSON.stringify(s.settings));
      if (s.mode) localStorage.setItem('shiloh_kiosk_track_mode', s.mode);
    }, seed);
    await page.route(SUPA, async (route) => {
      const req = route.request(); const url = req.url(); const method = req.method();
      const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
      if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (url.includes('/realtime/')) return route.abort();
      if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
      if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
      if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
      return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
    });
    return { ctx, page };
  };

  console.log('\n[A] Entry screen labels are not mojibake');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1600);
    const text = await page.locator('body').innerText();
    // These sequences are what UTF-8 emoji look like after a CP437 round-trip.
    const MOJIBAKE = /[Γ≡ƒ∩╠╝╤║]/;
    check('no mojibake characters on the entry screen', !MOJIBAKE.test(text),
      (text.match(/.{0,25}[Γ≡ƒ∩].{0,25}/) || [''])[0]);
    check('the scale emoji renders', text.includes('⚖️'), 'Weight + Sleep label lost its emoji');
    await ctx.close();
  }

  console.log('\n[B] enableRpe is reachable from Settings');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${APP}/#settings`); await page.waitForTimeout(1600);
    await openRpeSection(page);
    const toggle = page.locator('#setting-enableRpe');
    check('Session RPE toggle exists in Settings', await toggle.count() > 0, 'no way to turn the feature on');
    if (await toggle.count()) {
      check('toggle starts OFF (RPE is opt-in)', (await toggle.getAttribute('aria-checked')) === 'false');
      await toggle.click(); await page.waitForTimeout(300);
      check('toggle flips ON', (await toggle.getAttribute('aria-checked')) === 'true');
      await page.getByRole('button', { name: /SAVE ALL SETTINGS/i }).click(); await page.waitForTimeout(800);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_settings') || '{}').enableRpe);
      check('enableRpe persists after save', stored === true, `stored=${stored}`);
      // With it on, the kiosk must offer the third mode.
      await page.goto(`${APP}/#entry`); await page.waitForTimeout(1500);
      check('Session RPE mode button appears on the kiosk', await page.getByRole('button', { name: /Session RPE/i }).count() > 0);
    }
    await ctx.close();
  }

  console.log('\n[C] A kiosk stored in RPE mode is not stranded when RPE is off');
  {
    const { ctx, page } = await newPage({ mode: 'rpe', settings: { enableRpe: false } });
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1600);
    const text = await page.locator('body').innerText();
    check('header does not claim RPE mode', !/log today's session RPE/i.test(text),
      'stuck in a mode with no inputs and no visible way out');
    check('falls back to the weigh-in header', /weigh-in & sleep/i.test(text));
    const mode = await page.evaluate(() => localStorage.getItem('shiloh_kiosk_track_mode'));
    check('stored mode was reset', mode === 'both', `stored=${mode}`);
    await ctx.close();
  }


  console.log('\n[D] Toggling RPE survives a refresh without pressing Save');
  {
    const { ctx, page } = await newPage();
    await page.goto(`${APP}/#settings`); await page.waitForTimeout(1600);
    await openRpeSection(page);
    await page.locator('#setting-enableRpe').click(); await page.waitForTimeout(400);
    // Deliberately do NOT press "Save All Settings" - a switch reads as already applied.
    await page.reload(); await page.waitForTimeout(1800);
    await openRpeSection(page);
    const after = await page.locator('#setting-enableRpe').getAttribute('aria-checked');
    check('toggle is still ON after refresh (no Save pressed)', after === 'true',
      'the switch reverted - it only lived in React state');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('hpd_settings') || '{}').enableRpe);
    check('enableRpe was written to storage on click', stored === true, `stored=${stored}`);
    await ctx.close();
  }

  console.log('\n[E] Log-type pickers offer Session RPE');
  {
    const { ctx, page } = await newPage({ settings: { enableRpe: true } });
    await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(1800);
    const rpeBtn = page.getByRole('button', { name: /^Session RPE$/ });
    check('dashboard banner offers Session RPE', await rpeBtn.count() > 0,
      'only Start Weigh-Ins / Post-Practice were available');
    if (await rpeBtn.count()) {
      await rpeBtn.first().click(); await page.waitForTimeout(1500);
      const body = await page.locator('body').innerText();
      check('it lands on the kiosk in RPE mode', /session RPE/i.test(body), body.slice(0, 120));
    }

    // The per-athlete modal must offer the same choice.
    await page.goto(`${APP}/#entry`); await page.waitForTimeout(1500);
    await page.getByText('Test Athlete').first().click(); await page.waitForTimeout(1200);
    check('athlete modal offers RPE Only', await page.getByRole('button', { name: /RPE Only/i }).count() > 0);
    await page.getByRole('button', { name: /RPE Only/i }).first().click(); await page.waitForTimeout(700);
    const modal = await page.locator('body').innerText();
    check('modal header shows Session RPE Only', /Session RPE Only/i.test(modal));
    check('body weight field is hidden in RPE Only', !/BODY WEIGHT/i.test(modal),
      'a scale field is shown that the save discards');
    check('RPE field is shown', /SESSION RPE \(1-/i.test(modal));
    await ctx.close();
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

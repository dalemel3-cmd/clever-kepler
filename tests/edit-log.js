// Run with:  node tests/edit-log.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// Editing a past log. This existed only on post-practice sweat checks, so a mis-typed
// morning weigh-in (169.9 for 160.9) could previously only be deleted and re-entered.
// Exposing it on morning rows also exposed a latent data-loss bug: the modal collects
// weight/date/time but sent sleep_hrs: 0 with them, which zeroed sleep on any row it
// touched. Post-practice rows carry no sleep, so it never showed.
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
  { id: uuid(1), name: 'Typo Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' },
  // For the RPE-editing probe below: an athlete whose Session RPE entry was mis-typed.
  { id: uuid(2), name: 'Rpe Typo Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'QB' },
];
const BAD_ID = uuid(51);
const RPE_BAD_ID = uuid(52);
const logs = [
  { id: uuid(50), athlete_id: uuid(1), athlete_name: 'Typo Athlete', sport: 'Football', weight_lbs: 157.8, sleep_hrs: 8, session_type: null, is_baseline: true, created_at: ago(20) },
  // The fat-fingered morning weigh-in: 169.9 where 160.9 was meant. Carries 8h sleep.
  { id: BAD_ID, athlete_id: uuid(1), athlete_name: 'Typo Athlete', sport: 'Football', weight_lbs: 169.9, sleep_hrs: 8, session_type: null, is_baseline: false, created_at: ago(2) },
  // A Session RPE row entered as RPE 9 / 90 min "Lift" when the athlete meant RPE 7 / 60
  // min "Run" - the case the coach reported: the edit modal opened but had no RPE
  // fields, so there was no way to fix a mis-entered rating or session length.
  { id: RPE_BAD_ID, athlete_id: uuid(2), athlete_name: 'Rpe Typo Athlete', sport: 'Football', weight_lbs: 0, sleep_hrs: 0, rpe: 9, session_minutes: 90, session_label: 'Lift', session_type: 'rpe', is_baseline: false, created_at: ago(1) },
];

const SEED_SETTINGS = { enableRpe: true, rpeTrackDuration: true, rpeScaleMax: 10, rpeSessionLabels: ['Lift', 'Run', 'Combined'] };

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  page.patches = [];
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), SEED_SETTINGS);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins')) {
      if (method === 'GET') {
        // A profile-specific fetch filters by athlete_id (?athlete_id=eq.<uuid>) - honor
        // that the way the real PostgREST endpoint would, or Rpe Typo Athlete's row
        // (added for probe [C]) leaks into Typo Athlete's ledger as its "most recent"
        // log and the wrong row gets edited in probe [B].
        const m = /athlete_id=eq\.([^&]+)/.exec(url);
        const rows = m ? logs.filter(l => l.athlete_id === decodeURIComponent(m[1])) : logs;
        return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(rows) });
      }
      if (method === 'PATCH') { page.patches.push({ url, body: req.postDataJSON() }); return route.fulfill({ status: 204, headers: hdrs, body: '' }); }
    }
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });

  console.log('\n[A] A morning weigh-in offers an Edit control');
  await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1800);
  // Exact match: "Typo Athlete" is also a substring of "Rpe Typo Athlete" (added below
  // for probe [C]), and that card can sort ahead of this one alphabetically.
  await page.getByText('Typo Athlete', { exact: true }).first().click(); await page.waitForTimeout(1800);
  // Historical Log Ledger collapses behind a chevron by default (v4.34.0) - expand it
  // before looking for row-level Edit buttons. The collapse state lives on the
  // ProfilesScreen component itself, so it stays open across the athlete-switch in
  // probe [C] below without needing a second click.
  await page.getByText('HISTORICAL LOG LEDGER', { exact: false }).click();
  await page.waitForTimeout(400);
  const editButtons = page.getByRole('button', { name: /^EDIT$/i });
  const n = await editButtons.count();
  check('edit buttons present in the log ledger', n >= 2, `found ${n}`);
  check('no page errors', errors.length === 0, errors.join(' | '));

  console.log('\n[B] Correcting the weight PATCHes the right row');
  // The ledger is newest-first, so the first row is the bad 169.9 entry.
  await editButtons.first().click();
  await page.waitForTimeout(1000);
  const modal = await page.locator('body').innerText();
  check('edit modal opened', /EDIT LOG ENTRY/i.test(modal), modal.slice(0, 120));
  check('modal is prefilled with the existing weight', /169\.9/.test(modal), 'weight not carried into the form');

  const weightField = page.locator('input[type="number"], input[inputmode="decimal"]').filter({ hasNot: page.locator('[disabled]') }).first();
  await weightField.fill('160.9');
  await page.getByRole('button', { name: /SAVE CHANGES/i }).click();
  await page.waitForTimeout(1600);

  const patch = page.patches.find(p => p.url.includes(BAD_ID)) || page.patches[0];
  check('a PATCH was issued', !!patch, `patches: ${page.patches.length}`);
  if (patch) {
    check('PATCH targets the edited row', patch.url.includes(BAD_ID), patch.url.slice(-80));
    check('weight corrected to 160.9', Number(patch.body.weight_lbs) === 160.9, JSON.stringify(patch.body));
    // The regression this whole probe exists for.
    check('sleep preserved at 8h, not zeroed', Number(patch.body.sleep_hrs) === 8,
      `sleep_hrs=${patch.body.sleep_hrs} — editing a weigh-in wiped the sleep value`);
    check('row not reclassified as post-practice', patch.body.session_type !== 'post_practice',
      `session_type=${patch.body.session_type}`);
    check('is_baseline not named in the payload', !('is_baseline' in patch.body),
      'naming it risks clearing a baseline marker on an unrelated edit');
  }
  check('still no page errors', errors.length === 0, errors.join(' | '));

  console.log('\n[C] Editing a Session RPE log shows and corrects the RPE, duration, and label');
  // Still on Typo Athlete's profile detail from [B] - use the "switch athlete" dropdown
  // rather than a roster-grid click, which only exists on the list view.
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'RPE TYPO ATHLETE' }) }).first()
    .selectOption({ value: uuid(2) });
  await page.waitForTimeout(1800);
  const rpeEditButtons = page.getByRole('button', { name: /^EDIT$/i });
  await rpeEditButtons.first().click();
  await page.waitForTimeout(1000);
  const rpeModal = await page.locator('body').innerText();
  check('edit modal opened on the RPE tab', /EDIT LOG ENTRY/i.test(rpeModal) && /Session RPE/i.test(rpeModal), rpeModal.slice(0, 200));
  // The bug: the modal only ever showed a Body Weight field, so an RPE row's actual
  // rating, duration, and label were never visible to correct. Input *values* don't
  // appear in innerText, so read them directly rather than scraping page text.
  const rpeValueField = page.locator('input[type="number"]').first();
  const durationValueField = page.locator('input[type="number"]').nth(1);
  check('the athlete\'s actual RPE value is shown', await rpeValueField.inputValue() === '9', `got ${await rpeValueField.inputValue()}`);
  check('the athlete\'s actual session duration is shown', await durationValueField.inputValue() === '90', `got ${await durationValueField.inputValue()}`);

  await rpeValueField.fill('7');
  await durationValueField.fill('60');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: /SAVE CHANGES/i }).click();
  await page.waitForTimeout(1600);

  const rpePatch = page.patches.find(p => p.url.includes(RPE_BAD_ID));
  check('a PATCH was issued for the RPE row', !!rpePatch, `patches: ${page.patches.map(p => p.url).join(', ')}`);
  if (rpePatch) {
    check('RPE corrected to 7', Number(rpePatch.body.rpe) === 7, JSON.stringify(rpePatch.body));
    check('duration corrected to 60 minutes', Number(rpePatch.body.session_minutes) === 60, JSON.stringify(rpePatch.body));
    check('label corrected to Run', rpePatch.body.session_label === 'Run', JSON.stringify(rpePatch.body));
    check('session_type stays rpe', rpePatch.body.session_type === 'rpe', JSON.stringify(rpePatch.body));
  }
  check('still no page errors after editing RPE', errors.length === 0, errors.join(' | '));

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

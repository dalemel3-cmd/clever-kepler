// Run with:  node tests/workout-tablet.js   (preview on :4173; Supabase stubbed)
// v5.10.0 today's workout on the rack tablet (docs/HANDOFF.md §134): team program dated
// today shows in Lift Kiosk Mode with the athlete's own weights; sets log to lift_logs
// with one tap (adjust, undo); Finish -> RPE with the duration timed automatically.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const central = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d);
const TODAY = central(new Date());
const TOMORROW = central(new Date(Date.now() + 86400000));
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const athletes = [
  { id: uuid(1), name: 'Rack Ray', sport: 'Football', position: 'LB' },
  { id: uuid(2), name: 'Rack Rita', sport: 'Football', position: 'RB' },
  { id: uuid(3), name: 'Vb Vic', sport: 'Volleyball' },
];
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();
const lifts = [
  { id: uuid(51), athlete_id: uuid(1), athlete_name: 'Rack Ray', sport: 'Football', lift_type: 'Squat', weight_lbs: 300, reps: 1, source: 'manual', notes: null, created_at: ago(10) },
  { id: uuid(52), athlete_id: uuid(2), athlete_name: 'Rack Rita', sport: 'Football', lift_type: 'Squat', weight_lbs: 250, reps: 1, source: 'manual', notes: null, created_at: ago(10) },
];
const day = (id, date, focus) => ({
  id, date, focus, warmTitle: 'Warm-Up (2 Rounds)', warm: ['Band Pull Apart x 12', 'Pogos x 10'],
  blocks: [
    { id: `${id}b1`, code: '1a', name: 'Back Squat', note: 'Depth to box', maxKey: 'squat', rx: '', velocity: '.55–.65', sets: [{ reps: '5', pct: '70', tempo: '3XX' }, { reps: '3', pct: '80', tempo: '' }] },
    { id: `${id}b2`, code: '1b', name: 'Box Jump', note: '', maxKey: '', rx: '3x 3', velocity: '', sets: [] },
    { id: `${id}b3`, code: '2a', name: 'DB Row', note: '', maxKey: '', rx: '', velocity: '', sets: [{ reps: '8', pct: '', tempo: '' }] },
  ],
  finTitle: 'Core', fin: ['Plank x 30s'],
});
const programs = [
  { id: uuid(900), name: 'Football Strength', week_label: 'Week 3', phase: 'Strength + Power', sport: 'Football', days: [day('d1', TODAY, 'Lower + Power'), day('d2', TOMORROW, 'Upper')], max_map: { clean: 'Hang Clean', bench: 'Bench', squat: 'Squat', dl: 'Trap Bar Deadlift', ohp: '', window: 'all' }, updated_at: ago(1) },
];
const SEED = { enableLiftTracker: true, enableRpe: true, rpeTrackDuration: true, rpeScaleMax: 10, rpeSessionLabels: ['Lift', 'Run', 'Combined'], liftTypes: ['Bench', 'Squat', 'Hang Clean', 'Trap Bar Deadlift'], dataWindowDays: 30 };

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1300 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await stubAuth(page);
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('hpd_settings', JSON.stringify(s)); localStorage.setItem(`hpd_workout_${'x'}_2020-01-01`, '{}'); } }, SEED);
  const programGets = [], liftPosts = [], liftDeletes = [], rpePosts = [], weighGets = [];
  let programsDown = false;
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = decodeURIComponent(req.url()); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: '[{"approved":true}]' });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/programs') && m === 'GET') {
      programGets.push(url);
      if (programsDown) return route.abort();
      const date = (url.match(/"date":"(\d{4}-\d{2}-\d{2})"/) || [])[1];
      return route.fulfill({ status: 200, headers: h, body: JSON.stringify(programs.filter(p => !date || p.days.some(d => d.date === date))) });
    }
    if (url.includes('/rest/v1/lift_logs')) {
      if (m === 'POST') { const b = req.postDataJSON(); const rows = Array.isArray(b) ? b : [b]; liftPosts.push(...rows); return route.fulfill({ status: 201, headers: h, body: JSON.stringify(rows) }); }
      if (m === 'DELETE') { liftDeletes.push(url); return route.fulfill({ status: 204, headers: h, body: '' }); }
      return route.fulfill({ status: 200, headers: h, body: JSON.stringify(lifts) });
    }
    if (url.includes('/rest/v1/weigh_ins')) {
      if (m === 'POST') { const b = req.postDataJSON(); const rows = Array.isArray(b) ? b : [b]; rpePosts.push(...rows); return route.fulfill({ status: 201, headers: h, body: JSON.stringify(rows.map((r, i) => ({ ...r, id: uuid(700 + rpePosts.length + i) }))) }); }
      if (m === 'GET') weighGets.push(url);
      return route.fulfill({ status: 200, headers: { ...h, 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: '[]' });
    }
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  // Coach view (not kiosk): no workout, no program download.
  await page.goto(`${APP}/#lifts`); await page.waitForTimeout(2500);
  check('coach view: no program download', programGets.length === 0, JSON.stringify(programGets));
  await page.getByRole('button', { name: 'Activate Lift Kiosk Mode' }).click(); await page.waitForTimeout(1500);
  check('kiosk: downloads only programs dated today, with a team, not archived', programGets.length === 1 && programGets[0].includes(`days=cs.[{"date":"${TODAY}"}]`) && /archived_at=is\.null/.test(programGets[0]) && /sport=not\.is\.null/.test(programGets[0]), programGets[0]);
  check('kiosk header points to today\'s workout', /today's workout/i.test(await page.locator('body').innerText()));
  check('old workout sessions cleared from the tablet', await page.evaluate(() => localStorage.getItem('hpd_workout_x_2020-01-01')) === null);

  await page.getByText('Rack Ray', { exact: true }).first().click(); await page.waitForTimeout(800);
  const panel = page.getByTestId('workout-panel');
  check('athlete opens today\'s workout', await panel.count() === 1 && (await page.getByTestId('wo-title').innerText()).toUpperCase().includes('LOWER + POWER'));
  check('warm-up and finisher show', /Band Pull Apart x 12/.test(await page.getByTestId('wo-warm').innerText()) && /Plank x 30s/.test(await page.getByTestId('wo-fin').innerText()));
  const w = async () => page.getByTestId('wo-weight').evaluateAll(els => els.map(e => e.value));
  check('working weights from his max: 70% / 80% of 300 = 210 / 240', JSON.stringify(await w()) === '["210","240"]', JSON.stringify(await w()));
  check('max and velocity target shown', /Max 300/.test(await panel.innerText()) && /Velocity \.55–\.65/.test(await panel.innerText()));
  check('progress starts 0/4, timer running', (await page.getByTestId('wo-progress').innerText()) === '0/4' && /\d+ min/i.test(await page.getByTestId('wo-timer').innerText()), `${await page.getByTestId('wo-progress').innerText()} | ${await page.getByTestId('wo-timer').innerText()}`);

  await page.getByTestId('wo-log').first().click(); await page.waitForTimeout(800);
  const p1 = liftPosts[0] || {};
  check('Log saves the set to Lift Tracker: Squat 210 × 5, kiosk, note names the block', p1.lift_type === 'Squat' && Number(p1.weight_lbs) === 210 && Number(p1.reps) === 5 && p1.source === 'kiosk' && /Workout: Football Strength · 1a set 1/.test(p1.notes || ''), JSON.stringify(p1));
  check('set shows logged, progress 1/4', /210 × 5/.test(await panel.innerText()) && (await page.getByTestId('wo-progress').innerText()) === '1/4');
  await page.getByRole('button', { name: 'More Set 2 weight' }).click();
  await page.getByRole('button', { name: 'Less Set 2 reps' }).click();
  await page.getByTestId('wo-log').first().click(); await page.waitForTimeout(800);
  check('adjusted set: 245 × 2', Number(liftPosts[1]?.weight_lbs) === 245 && Number(liftPosts[1]?.reps) === 2, JSON.stringify(liftPosts[1]));
  await page.getByRole('button', { name: 'Undo set 2' }).click(); await page.waitForTimeout(800);
  check('undo deletes that exact set', liftDeletes.length === 1 && liftDeletes[0].includes(liftPosts[1]?.id), JSON.stringify(liftDeletes));
  check('undone set is back to Log', (await page.getByTestId('wo-log').count()) === 1 && (await page.getByTestId('wo-progress').innerText()) === '1/4');
  const doneBtns = page.getByTestId('wo-done');
  await doneBtns.nth(0).click(); await doneBtns.nth(1).click(); await page.waitForTimeout(300);
  check('non-lift work is checked off (3x 3 box jumps, DB row set)', (await page.getByTestId('wo-progress').innerText()) === '3/4' && liftPosts.length === 2);
  check('rack chip shows progress', /3\/4 sets/.test(await page.getByTestId('rack-progress').first().innerText()));

  // Another athlete on the same rack: own weights, own session; PR message.
  await page.getByRole('button', { name: 'Add Another Athlete' }).click(); await page.waitForTimeout(400);
  await page.getByText('Rack Rita', { exact: true }).first().click(); await page.waitForTimeout(800);
  check('second athlete: her own weights (175 / 200)', JSON.stringify(await w()) === '["175","200"]', JSON.stringify(await w()));
  await page.getByTestId('wo-weight').nth(1).fill('260');
  await page.getByTestId('wo-log').nth(1).click(); await page.waitForTimeout(800);
  check('new PR message (260 × 3 beats 250)', /New PR! Squat est\. 1RM 286 \(was 250\)/.test(await page.getByTestId('wo-msg').innerText().catch(() => '')), await page.getByTestId('wo-msg').innerText().catch(() => '(none)'));

  // Finish: duration timed from when he opened the workout.
  await page.evaluate(({ id, d }) => { const k = `hpd_workout_${id}_${d}`; const s = JSON.parse(localStorage.getItem(k)); s.startedAt = Date.now() - 40 * 60000; localStorage.setItem(k, JSON.stringify(s)); }, { id: uuid(1), d: TODAY });
  await page.getByRole('button', { name: /Rack Ray/ }).first().click(); await page.waitForTimeout(600);
  check('progress kept when he comes back to the tablet', (await page.getByTestId('wo-progress').innerText()) === '3/4');
  weighGets.length = 0;
  await page.getByTestId('wo-finish').click(); await page.waitForTimeout(300);
  check('Finish opens RPE with the timed duration (40 min)', await page.getByTestId('wo-rpe').count() === 1 && (await page.getByTestId('wo-minutes').inputValue()) === '40', await page.getByTestId('wo-minutes').inputValue().catch(() => ''));
  await page.getByTestId('wo-rpe-7').click();
  check('RPE word shown', /Very hard/.test(await page.getByTestId('wo-rpe').innerText()));
  await page.getByTestId('wo-rpe-save').click(); await page.waitForTimeout(900);
  const r = rpePosts[0] || {};
  check('RPE saved: 7, 40 min, label Lift, session_type rpe', Number(r.rpe) === 7 && Number(r.session_minutes) === 40 && r.session_label === 'Lift' && r.session_type === 'rpe' && r.athlete_id === uuid(1), JSON.stringify(r));
  check('complete banner', /Workout complete · RPE 7 · 40 min/.test(await page.getByTestId('wo-complete').innerText()));
  check('no 30-day re-download after the RPE save', weighGets.filter(u => /select=id,created_at,athlete_id/.test(u)).length === 0, JSON.stringify(weighGets));

  await page.getByTestId('wo-free-log').click(); await page.waitForTimeout(300);
  check('"Log a lift not on the plan" opens the normal log form', await page.getByRole('button', { name: /Log Lift/ }).count() === 1 && await page.getByTestId('wo-back').count() === 1);
  await page.getByTestId('wo-back').click(); await page.waitForTimeout(300);
  check('back to the workout', await page.getByTestId('workout-panel').count() === 1);

  // v5.11.1: nobody tapped Finish - the timer stops at the 60 min cap, and the time can be changed.
  await page.evaluate(({ id, d }) => { const k = `hpd_workout_${id}_${d}`; const s = JSON.parse(localStorage.getItem(k)); s.startedAt = Date.now() - 3 * 3600000; localStorage.setItem(k, JSON.stringify(s)); }, { id: uuid(2), d: TODAY });
  await page.getByRole('button', { name: /Rack Rita/ }).first().click(); await page.waitForTimeout(600);
  check('3 hours later the timer reads 60 min max', /^60 min max$/i.test((await page.getByTestId('wo-timer').innerText()).trim()) && await page.getByTestId('wo-timer').getAttribute('data-capped') === '1', await page.getByTestId('wo-timer').innerText());
  await page.getByTestId('wo-finish').click(); await page.waitForTimeout(300);
  check('Finish starts at 60 min with the "timer stopped" note', (await page.getByTestId('wo-minutes').inputValue()) === '60' && /stopped at 60 min/.test(await page.getByTestId('wo-minutes-hint').innerText()), `${await page.getByTestId('wo-minutes').inputValue()} | ${await page.getByTestId('wo-minutes-hint').innerText().catch(() => '')}`);
  await page.getByTestId('wo-minutes').fill('75');
  await page.getByTestId('wo-rpe-6').click();
  await page.getByTestId('wo-rpe-save').click(); await page.waitForTimeout(900);
  check('changed time saved past the cap (75 min)', Number((rpePosts[1] || {}).session_minutes) === 75 && (rpePosts[1] || {}).athlete_id === uuid(2), JSON.stringify(rpePosts[1]));
  check('complete banner shows 75 min', /Workout complete · RPE 6 · 75 min/.test(await page.getByTestId('wo-complete').innerText().catch(() => '')));

  await page.getByRole('button', { name: 'Add Another Athlete' }).click(); await page.waitForTimeout(400);
  await page.getByText('Vb Vic', { exact: true }).first().click(); await page.waitForTimeout(600);
  check('athlete with no program today gets the normal log form', await page.getByTestId('workout-panel').count() === 0 && await page.getByRole('button', { name: /Log Lift/ }).count() === 1);

  // Tablet loses WiFi: the workout still opens from what the tablet saved.
  programsDown = true;
  await page.reload(); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Activate Lift Kiosk Mode' }).click(); await page.waitForTimeout(1200);
  await page.getByText('Rack Rita', { exact: true }).first().click(); await page.waitForTimeout(800);
  check('no signal: workout opens from the tablet\'s copy, logged set kept', await page.getByTestId('workout-panel').count() === 1 && (await page.getByTestId('wo-progress').innerText()) === '1/4');

  await page.setViewportSize({ width: 768, height: 1024 }); await page.waitForTimeout(300);
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('iPad portrait: no sideways scroll', sideways <= 0, `${sideways}px`);
  const small = await page.getByTestId('workout-panel').locator('button').evaluateAll(bs => bs.filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map(b => `${b.textContent.trim() || b.getAttribute('aria-label')} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
  check('workout buttons are at least 44×44', small.length === 0, small.join(', '));

  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

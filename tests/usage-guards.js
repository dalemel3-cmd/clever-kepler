// Run with: node tests/usage-guards.js  (preview on :4173; Supabase stubbed)
// v5.8.0 usage guards (after the v5.7.6 loop used 40 GB of egress in one night):
// lift/test tables load new rows only (full refresh at most daily), the live weigh-in sync
// stays at the normal window when reports load longer history, and the fetch brake stops
// a runaway caller.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? ` -> ${d}` : ''}`); } };
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const lift = { id: uuid(5), athlete_id: uuid(1), athlete_name: 'A', sport: 'Football', lift_type: 'Bench', weight_lbs: 200, reps: 1, source: 'manual', notes: null, created_at: new Date(Date.now() - 86400000).toISOString() };
(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await stubAuth(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('hpd_settings', JSON.stringify({ enableLiftTracker: true, enableSpeedPower: true, dataWindowDays: 30 })); } });
  const reqs = [];
  let athletesDelay = 0; // ms the roster reply is held (v5.15.9 in-flight test)
  let probeReply = null; // { n, latest }: what the change probe's tiny query answers
  await page.route(SUPA, async (r) => {
    const u = r.request().url(), m = r.request().method(); const H = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return r.fulfill({ status: 200, headers: { ...H, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.includes('/realtime/')) return r.abort();
    if (isAuthRoute(u)) return fulfillAuth(r, u, H);
    if (m === 'GET') reqs.push(decodeURIComponent(u));
    if (u.includes('/rest/v1/coaches')) return r.fulfill({ status: 200, headers: H, body: '[{"approved":true}]' });
    if (u.includes('/rest/v1/athletes')) {
      if (athletesDelay) await new Promise(res => setTimeout(res, athletesDelay));
      return r.fulfill({ status: 200, headers: H, body: JSON.stringify([{ id: uuid(1), name: 'A', sport: 'Football' }]) }).catch(() => {});
    }
    if (u.includes('/rest/v1/lift_logs')) return r.fulfill({ status: 200, headers: H, body: JSON.stringify([lift]) });
    // Row count like PostgREST sends it, so the change probe sees "no change".
    if (u.includes('/rest/v1/weigh_ins') && probeReply && /select=created_at&/.test(decodeURIComponent(u))) {
      return r.fulfill({ status: 200, headers: { ...H, 'content-range': `0-0/${probeReply.n}`, 'access-control-expose-headers': 'content-range' }, body: JSON.stringify(probeReply.latest ? [{ created_at: probeReply.latest }] : []) });
    }
    if (u.includes('/rest/v1/weigh_ins')) return r.fulfill({ status: 200, headers: { ...H, 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: '[]' });
    return r.fulfill({ status: 200, headers: H, body: '[]' });
  });
  const of = (t) => reqs.filter(u => u.includes(`/rest/v1/${t}?`));
  await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2500);
  const l1 = of('lift_logs');
  check('first load: one full lift download, named columns (no select=*)', l1.length === 1 && !/created_at=gt/.test(l1[0]) && /select=id,athlete_id/.test(l1[0]) && !/select=\*/.test(l1[0]), JSON.stringify(l1));
  check('weigh-in sync uses named columns', of('weigh_ins').some(u => /select=id,created_at,athlete_id/.test(u)) && !of('weigh_ins').some(u => /select=\*/.test(u)), JSON.stringify(of('weigh_ins')));
  reqs.length = 0;
  await page.reload(); await page.waitForTimeout(2500);
  const l2 = of('lift_logs');
  check('second load: only rows newer than the cache (created_at=gt.)', l2.length === 1 && /created_at=gt\./.test(l2[0]), JSON.stringify(l2));
  await page.evaluate(() => localStorage.setItem('hpd_lift_logs_full_at', String(Date.now() - 25 * 3600 * 1000)));
  reqs.length = 0;
  await page.reload(); await page.waitForTimeout(2500);
  check('after 24h: one full refresh again', of('lift_logs').length === 1 && !/created_at=gt/.test(of('lift_logs')[0]), JSON.stringify(of('lift_logs')));
  // Reports load 90 days once, separately; the live sync stays at 30 days.
  reqs.length = 0;
  await page.goto(`${APP}/#reports`); await page.waitForTimeout(2500);
  const hist = of('weigh_ins').filter(u => /created_at=lt\./.test(u));
  check('reports: one separate history request (older than the live window)', hist.length === 1, JSON.stringify(of('weigh_ins')));
  const gteDays = (u) => { const m = u.match(/created_at=gte\.([^&]+)/); return m ? Math.round((Date.now() - new Date(m[1]).getTime()) / 86400000) : null; };
  await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(1500);
  const live = of('weigh_ins').filter(u => /select=id,created_at,athlete_id/.test(u) && !/created_at=lt\./.test(u));
  check('live sync stays at 30 days after opening reports', live.length > 0 && live.every(u => gteDays(u) <= 31), JSON.stringify(live.map(gteDays)));
  // v5.8.1: coming back to the app fires focus AND visibilitychange - one refresh, not two;
  // flipping between apps stays at one refresh per 30s.
  await page.goto(`${APP}/#dashboard`); await page.reload(); await page.waitForTimeout(2500);
  const liveWi = () => of('weigh_ins').filter(u => /select=id,created_at,athlete_id/.test(u) && !/created_at=lt\./.test(u)).length;
  reqs.length = 0;
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(800);
  check('back to the app: one roster + one weigh-in download (not two)', of('athletes').length === 1 && liveWi() === 1, `athletes=${of('athletes').length} weigh_ins=${liveWi()}`);
  reqs.length = 0;
  for (let i = 0; i < 15; i++) { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await page.waitForTimeout(60); }
  await page.waitForTimeout(800);
  check('flipping between apps 15x: no extra downloads inside 30s', of('athletes').length === 0 && liveWi() === 0, `athletes=${of('athletes').length} weigh_ins=${liveWi()}`);
  // A burst of athlete changes (a team baseline update writes every row) -> one download.
  reqs.length = 0;
  for (let i = 0; i < 10; i++) await page.evaluate(() => window.__hpdOnAthletesChange());
  await page.waitForTimeout(2500);
  check('10 realtime athlete changes in a burst: one roster download', of('athletes').length === 1, `athletes=${of('athletes').length}`);
  // The brake still caps a runaway caller, and a skipped roster refresh catches up later.
  reqs.length = 0;
  await page.evaluate(() => { window.__hpdFetchBrake.reset(); const t = Date.now() - 50000; window.__hpdFetchBrake.hits.set('athletes', [t, t, t, t]); });
  await page.evaluate(() => window.__hpdOnAthletesChange());
  await page.waitForTimeout(2500);
  check('brake skips a 5th roster download inside a minute', of('athletes').length === 0, `athletes=${of('athletes').length}`);
  await page.waitForTimeout(20000);
  check('...and runs one catch-up download ~20s later', of('athletes').length === 1, `athletes=${of('athletes').length}`);
  // v5.15.7: athlete changes from another device are applied from the realtime row: no
  // roster download, even for several edits in a row.
  await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2500);
  reqs.length = 0;
  await page.evaluate((id) => { for (let i = 0; i < 6; i++) window.__hpdOnAthletesChange({ eventType: 'UPDATE', new: { id, name: `Renamed ${i}`, sport: 'Football', position: 'QB' }, old: { id } }); }, uuid(1));
  await page.evaluate((id) => window.__hpdOnAthletesChange({ eventType: 'INSERT', new: { id, name: 'New Kid', sport: 'Football', position: '' }, old: {} }), uuid(2));
  await page.waitForTimeout(800);
  let roster = await page.locator('main').innerText();
  check('6 athlete edits + a new athlete from another device: applied, no roster download', of('athletes').length === 0 && /Renamed 5/i.test(roster) && !/Renamed 4/i.test(roster) && /New Kid/i.test(roster), `athletes=${of('athletes').length}`);
  await page.evaluate((id) => window.__hpdOnAthletesChange({ eventType: 'DELETE', new: {}, old: { id } }), uuid(2));
  await page.waitForTimeout(600);
  roster = await page.locator('main').innerText();
  check('a deleted athlete disappears, still no download', of('athletes').length === 0 && !/New Kid/i.test(roster));
  check('the roster cache on the device follows', await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_roster') || '[]').map(a => a.name).join(',')) === 'Renamed 5');
  // v5.15.8: a baseline set on another device reaches this device's baselines map (alarms read it).
  await page.evaluate((id) => window.__hpdOnAthletesChange({ eventType: 'UPDATE', new: { id, name: 'Renamed 5', sport: 'Football', position: JSON.stringify({ pos: 'QB', bw: 181.5, bd: '2026-11-01', lid: 'log-x' }) }, old: { id } }), uuid(1));
  await page.waitForTimeout(600);
  const bmap = await page.evaluate((id) => JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}')[id], uuid(1));
  check('a realtime baseline change updates the baselines map', bmap?.weight_lbs === 181.5 && bmap?.log_id === 'log-x', JSON.stringify(bmap));
  // Coming back with realtime up: flipping windows doesn't re-download the roster; returning
  // after the screen was hidden over a minute (an iPad asleep) does.
  reqs.length = 0;
  await page.evaluate(() => {
    window.__hpdSetRealtimeHealthy(true);
    const real = Date.now.bind(Date); window.__off = 40000; Date.now = () => real() + window.__off;
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForTimeout(800);
  check('realtime up, switching back from another window: no roster download', of('athletes').length === 0, `athletes=${of('athletes').length}`);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.evaluate(() => { window.__off += 70000; Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(800);
  check('realtime up, back after the screen was off over a minute: one roster download', of('athletes').length === 1, `athletes=${of('athletes').length}`);
  // Realtime: a check-in from another device is applied directly - no re-download.
  await page.goto(`${APP}/#dashboard`); await page.waitForTimeout(2500);
  reqs.length = 0;
  const row = { id: uuid(77), athlete_id: uuid(1), athlete_name: 'A', sport: 'Football', weight_lbs: 180, sleep_hrs: 0, session_type: null, is_baseline: false, rpe: null, session_minutes: null, session_label: null, created_at: new Date().toISOString() };
  const logged = async () => ((await page.locator('body').innerText()).match(/(\d+) OF (\d+) LOGGED/i) || [])[0] || '';
  const before = await logged();
  await page.evaluate((r) => window.__hpdApplyWeighInChange({ eventType: 'INSERT', new: r, old: {} }), row);
  await page.waitForTimeout(400);
  const afterIns = await logged();
  check('realtime INSERT updates the dashboard without a download', /1 OF 1 LOGGED/i.test(afterIns) && of('weigh_ins').filter(u => /select=id,created_at,athlete_id/.test(u)).length === 0, `${before} -> ${afterIns} | ${JSON.stringify(of('weigh_ins'))}`);
  await page.evaluate((r) => window.__hpdApplyWeighInChange({ eventType: 'INSERT', new: r, old: {} }), row);
  await page.waitForTimeout(200);
  check('same row twice is not duplicated', JSON.parse(await page.evaluate(() => localStorage.getItem('shiloh_reports'))).filter(r => r.id === '00000077-0000-4000-8000-000000000077').length === 1);
  await page.evaluate(() => window.__hpdApplyWeighInChange({ eventType: 'DELETE', new: {}, old: { id: '00000077-0000-4000-8000-000000000077' } }));
  await page.waitForTimeout(400);
  check('realtime DELETE removes it', /0 OF 1 LOGGED/i.test(await logged()), await logged());
  // v5.8.1: another device's check-in arrives twice (broadcast copy + realtime row), in
  // either order - it must show once, as the real row.
  const rows = () => page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_reports') || '[]').filter(r => r.athlete_id === '00000001-0000-4000-8000-000000000001'));
  const bcast = (r) => ({ payload: { type: 'NEW_WEIGH_IN_LOGGED', record: { ...r, id: `broadcast_${Date.now()}` } } });
  const r1 = { ...row, id: uuid(78), created_at: new Date().toISOString() };
  await page.evaluate((p) => window.__hpdOnDeviceSync(p), bcast(r1));
  await page.evaluate((r) => window.__hpdApplyWeighInChange({ eventType: 'INSERT', new: r, old: {} }), r1);
  await page.waitForTimeout(300);
  let got = await rows();
  check('broadcast then realtime: shown once, as the real row', got.length === 1 && got[0].id === r1.id, JSON.stringify(got.map(r => r.id)));
  await page.evaluate(() => window.__hpdApplyWeighInChange({ eventType: 'DELETE', new: {}, old: { id: '00000078-0000-4000-8000-000000000078' } }));
  const r2 = { ...row, id: uuid(79), created_at: new Date().toISOString() };
  await page.evaluate((r) => window.__hpdApplyWeighInChange({ eventType: 'INSERT', new: r, old: {} }), r2);
  await page.evaluate((p) => window.__hpdOnDeviceSync(p), bcast(r2));
  await page.waitForTimeout(300);
  got = await rows();
  check('realtime then broadcast: shown once, as the real row', got.length === 1 && got[0].id === r2.id, JSON.stringify(got.map(r => r.id)));

  // v5.15.9 (docs/HANDOFF.md §154)
  // A check-in that arrived live is counted by the change probe: no full re-download of the
  // 30-day window on every device after every check-in.
  await page.reload(); await page.waitForTimeout(2500);
  const fullWi = () => of('weigh_ins').filter(u => /select=id,created_at,athlete_id/.test(u) && !/created_at=lt\./.test(u)).length;
  const live1 = { ...row, id: uuid(81), created_at: new Date(Date.now() - 60000).toISOString() };
  await page.evaluate((r) => window.__hpdApplyWeighInChange({ eventType: 'INSERT', new: r, old: {} }), live1);
  reqs.length = 0;
  probeReply = { n: 1, latest: live1.created_at };
  await page.evaluate(() => window.__hpdProbe()); await page.waitForTimeout(800);
  check('probe after a live check-in: nothing new, no full download', fullWi() === 0 && of('weigh_ins').length >= 1, JSON.stringify(of('weigh_ins')));
  probeReply = { n: 2, latest: new Date().toISOString() };
  await page.evaluate(() => window.__hpdProbe()); await page.waitForTimeout(800);
  check('probe sees a check-in that did not arrive live: a full download', fullWi() >= 1, JSON.stringify(of('weigh_ins')));
  probeReply = null;

  // A roster download already sent when an athlete change arrives live can't include it:
  // the change is put back on top of the download instead of being undone.
  await page.goto(`${APP}/#athletes`); await page.reload(); await page.waitForTimeout(2500);
  await page.evaluate(() => window.__hpdFetchBrake.reset());
  reqs.length = 0; athletesDelay = 2000;
  await page.evaluate(() => window.__hpdOnAthletesChange()); // no usable row: one roster download in 1.5 s
  await page.waitForTimeout(2000);
  await page.evaluate((id) => window.__hpdOnAthletesChange({ eventType: 'UPDATE', new: { id, name: 'Moved Mid Download', sport: 'Football', position: 'WR' }, old: { id } }), uuid(1));
  await page.waitForTimeout(2500);
  athletesDelay = 0;
  roster = await page.locator('main').innerText();
  check('a change that arrives while a roster download is in flight survives it', of('athletes').length === 1 && /Moved Mid Download/i.test(roster) && await page.evaluate(() => JSON.parse(localStorage.getItem('shiloh_roster') || '[]').map(a => a.name).join(',')) === 'Moved Mid Download', `athletes=${of('athletes').length} | ${roster.slice(0, 200)}`);

  // Realtime connecting: right after load (the roster was just downloaded) no extra download;
  // a first connect that comes late, or a reconnect, catches the roster up once.
  await page.reload(); await page.waitForTimeout(1500);
  reqs.length = 0;
  await page.evaluate(() => window.__hpdOnRealtimeStatus('SUBSCRIBED')); await page.waitForTimeout(600);
  check('realtime connects right after load: no second roster download', of('athletes').length === 0, `athletes=${of('athletes').length}`);
  await page.reload(); await page.waitForTimeout(1500);
  reqs.length = 0;
  await page.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 15000; window.__hpdOnRealtimeStatus('SUBSCRIBED'); });
  await page.waitForTimeout(600);
  check('realtime connects for the first time well after load: one roster catch-up', of('athletes').length === 1, `athletes=${of('athletes').length}`);
  reqs.length = 0;
  await page.evaluate(() => { window.__hpdOnRealtimeStatus('CHANNEL_ERROR'); const real = Date.now; Date.now = () => real() + 15000; window.__hpdOnRealtimeStatus('SUBSCRIBED'); });
  await page.waitForTimeout(600);
  check('...and after a drop, one more', of('athletes').length === 1, `athletes=${of('athletes').length}`);

  // Reports asking for older history while the brake is full: loaded ~20 s later, not never.
  await page.goto(`${APP}/#dashboard`); await page.reload(); await page.waitForTimeout(2500);
  reqs.length = 0;
  await page.evaluate(() => { const t = Date.now() - 50000; window.__hpdFetchBrake.hits.set('weigh_ins:history', [t, t, t]); location.hash = '#reports'; });
  await page.waitForTimeout(2500);
  const histNow = () => of('weigh_ins').filter(u => /created_at=lt\./.test(u)).length;
  check('history skipped by the brake: no request yet', histNow() === 0, JSON.stringify(of('weigh_ins')));
  await page.waitForTimeout(20000);
  check('...and loaded once about 20 s later', histNow() === 1, JSON.stringify(of('weigh_ins')));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();

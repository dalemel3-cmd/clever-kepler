// Run with:  node tests/speed-trend.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
//
// v5.15.0: every speed (10yd Fly) chart plots raw times, so faster sits lower, with a
// dashed least-squares trend line that slopes down as an athlete gets faster. Checked on
// the Analytics team trend, Compare, Jumps & Sprints (chart + table sparkline), the
// Progress Card and the printable leaderboard; jumps keep "up = better" and no trend.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';
import { linearFit, trendSeries } from '../src/utils/trendLine.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = 86400000;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = [
  { id: uuid(1), name: 'Fast Feet', sport: 'Football', team: 'Varsity', position: 'WR', grade: '11' },
  { id: uuid(2), name: 'Slow Down', sport: 'Football', team: 'Varsity', position: 'OL', grade: '11' },
];
let n = 100;
const res = (aid, daysAgo, type, metric, variant) => ({ id: uuid(n++), athlete_id: aid, test_type: type, test_variant: variant, metric, unit: type === '10yd_fly' ? 'sec' : 'in', source: 'manual',
  created_at: new Date(Date.now() - daysAgo * DAY - 3600000).toISOString() });
const fly = (aid, d, v) => res(aid, d, '10yd_fly', v, 'build10_fly10');
const tests = [
  fly(uuid(1), 28, 1.30), fly(uuid(1), 20, 1.25), fly(uuid(1), 12, 1.21), fly(uuid(1), 3, 1.18), // getting faster
  fly(uuid(2), 25, 1.20), fly(uuid(2), 5, 1.24),                                                 // getting slower
  res(uuid(1), 20, 'vertical_jump', 26, 'hands_on_hips'), res(uuid(1), 3, 'vertical_jump', 28, 'hands_on_hips'),
];
const SEED = { enableLiftTracker: true, enableSpeedPower: true, liftTypes: ['Bench'], dataWindowDays: 90 };

// First and last point of an svg path ("M x,y L x,y ..."), y grows downward.
const ends = (d) => {
  const nums = (d || '').match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
  return nums.length >= 4 ? { y1: nums[1], y2: nums[nums.length - 1] } : null;
};

(async () => {
  console.log('\n[A] Least-squares fit');
  {
    const f = linearFit([1.30, 1.25, 1.21, 1.18]);
    check('faster times give a negative slope', f && f.slope < 0 && Math.abs(f.slope - (-0.04)) < 1e-9, JSON.stringify(f));
    check('slower times give a positive slope', linearFit([1.20, 1.24]).slope > 0);
    check('one point gives no line', linearFit([1.2]) === null && linearFit([null, 1.2, null]) === null);
    const s = trendSeries([null, 1.30, null, 1.20, null]);
    check('trend spans first to last point only, skipping gaps', s[0] === null && s[4] === null && s[1] === 1.3 && s[2] === 1.25 && s[3] === 1.2, JSON.stringify(s));
  }

  const browser = await chromium.launch(LAUNCH_OPTS);
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await stubAuth(page);
  await page.addInitScript((s) => localStorage.setItem('hpd_settings', JSON.stringify(s)), SEED);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/performance_tests') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(tests) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });

  console.log('\n[B] Analytics team trend');
  await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);
  const teamCard = page.locator('.card-glass').filter({ hasText: /AVERAGE 10YD FLY/i }).first();
  const teamTrend = teamCard.locator('.recharts-line.trend-line path.recharts-curve');
  check('10yd Fly team average has a dashed trend line', await teamTrend.count() === 1);
  const te = ends(await teamTrend.first().getAttribute('d'));
  check('team getting faster: trend slopes down', te && te.y2 > te.y1, JSON.stringify(te));
  check('note says lower = faster', /Lower = faster/.test(await teamCard.innerText()));
  await teamCard.getByRole('button', { name: 'Vertical Jump' }).click(); await page.waitForTimeout(300);
  await teamCard.locator('select[aria-label="Technique"]').selectOption('hands_on_hips').catch(() => {}); await page.waitForTimeout(400);
  check('vertical jump has no trend line', await teamCard.locator('.recharts-line.trend-line').count() === 0);

  console.log('\n[C] Compare');
  await page.getByRole('button', { name: /Compare/i }).click(); await page.waitForTimeout(400);
  await page.getByText('Fast Feet', { exact: true }).click();
  await page.getByText('Slow Down', { exact: true }).click(); await page.waitForTimeout(600);
  const cmp = page.locator('.recharts-line.trend-line path.recharts-curve');
  check('one dashed trend per athlete', await cmp.count() === 2, `found ${await cmp.count()}`);
  const c1 = ends(await cmp.nth(0).getAttribute('d')), c2 = ends(await cmp.nth(1).getAttribute('d'));
  check('faster athlete trend slopes down, slower one slopes up', c1 && c2 && c1.y2 > c1.y1 && c2.y2 < c2.y1, JSON.stringify([c1, c2]));
  check('trend lines are left out of the legend', !/trend/i.test(await page.locator('.recharts-legend-wrapper').innerText()));
  check('compare note shown', await page.getByTestId('compare-trend-note').count() === 1);

  console.log('\n[D] Jumps & Sprints');
  const perf = page.getByRole('tablist', { name: 'Performance' });
  await perf.getByRole('tab', { name: /Jumps & Sprints/ }).click(); await page.waitForTimeout(1200);
  await page.getByLabel('Test').selectOption('10yd_fly'); await page.waitForTimeout(500);
  const rows = page.locator('tbody tr');
  const fastRow = rows.filter({ hasText: 'Fast Feet' }).first();
  const st = fastRow.getByTestId('spark-trend');
  check('table sparkline has a trend line', await st.count() === 1);
  const sy1 = Number(await st.getAttribute('y1')), sy2 = Number(await st.getAttribute('y2'));
  check('sparkline trend slopes down for the faster athlete', sy2 > sy1, `${sy1} -> ${sy2}`);
  await fastRow.click(); await page.waitForTimeout(900);
  const det = page.locator('.recharts-line.trend-line path.recharts-curve');
  check('detail chart has a trend line', await det.count() === 1);
  const de = ends(await det.first().getAttribute('d'));
  check('detail trend slopes down', de && de.y2 > de.y1, JSON.stringify(de));
  // Recharts 3 draws tick labels outside the axis group; the y ticks are the 1.xx ones.
  const ticks = (await page.locator('svg.recharts-surface').last().locator('text.recharts-cartesian-axis-tick-value').evaluateAll(els => els.map(e => ({ t: e.textContent, y: e.getBoundingClientRect().y }))))
    .filter(k => /^\d+\.\d\d$/.test(k.t)).map(k => ({ v: Number(k.t), y: k.y }));
  const top = ticks.reduce((a, b) => (b.y < a.y ? b : a), ticks[0]), bottom = ticks.reduce((a, b) => (b.y > a.y ? b : a), ticks[0]);
  check('axis no longer flipped: slowest time at the top', ticks.length > 1 && top.v > bottom.v, JSON.stringify(ticks));
  check('detail note explains the trend', /slopes down as they get faster/.test(await page.locator('main').innerText()) && !/flipped/.test(await page.locator('main').innerText()));
  await page.getByLabel('Test').selectOption('vertical_jump'); await page.waitForTimeout(500);
  check('jump table sparklines have no trend line', await page.getByTestId('spark-trend').count() === 0);

  console.log('\n[E] Progress Card');
  await page.goto(`${APP}/#athletes`); await page.waitForTimeout(2500);
  await page.getByText('Fast Feet', { exact: true }).first().click(); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /View Full Trends/i }).click(); await page.waitForTimeout(1500);
  await page.getByTestId('pc-open').click(); await page.waitForTimeout(1200);
  const flyM = page.getByTestId('pc-metric').filter({ hasText: /^FLY 10/i });
  const pt = flyM.getByTestId('pc-trend');
  check('Fly 10 sparkline has a trend line', await pt.count() === 1);
  const py1 = Number(await pt.getAttribute('y1')), py2 = Number(await pt.getAttribute('y2'));
  check('Fly 10 trend slopes down', py2 > py1, `${py1} -> ${py2}`);
  const dots = await flyM.locator('circle').evaluateAll(els => els.map(e => Number(e.getAttribute('cy'))));
  check('fastest (latest) time plotted lowest', dots.length === 4 && dots[3] === Math.max(...dots) && dots[0] === Math.min(...dots), JSON.stringify(dots));
  const vjM = page.getByTestId('pc-metric').filter({ hasText: /^VERTICAL \(HANDS/i });
  check('vertical has no trend line', await vjM.count() === 1 && await vjM.getByTestId('pc-trend').count() === 0);
  check('footer explains speed', /lower = faster · dashed line = trend/.test(await page.getByTestId('pc-speed-note').innerText()));
  check('header legend unchanged (one line)', /up = better$/m.test(await page.getByTestId('progress-card').innerText()));
  check('card still fits one page', (await page.getByTestId('progress-card').getAttribute('data-fit')) !== 'overflow', await page.getByTestId('progress-card').getAttribute('data-fit'));
  await page.getByTestId('progress-card').screenshot({ path: '/tmp/claude-0/-home-user-MoneyMase/9587e7dc-3753-5d82-8e64-81fff61e380c/scratchpad/pc_speed_trend.png' }).catch(() => {});

  console.log('\n[F] Printable leaderboard');
  await page.goto(`${APP}/#lifts`); await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /LEADERBOARD/ }).first().click(); await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Printable leaderboard/i }).click(); await page.waitForTimeout(1500);
  const dlg = page.getByRole('dialog', { name: 'Printable leaderboard' });
  await page.locator('#lb-metric').selectOption({ label: '10yd Fly' }); await page.waitForTimeout(500);
  const lbRows = dlg.getByTestId('lb-page').nth(0).getByTestId('lb-row');
  const fastLb = lbRows.filter({ hasText: 'Fast Feet' }).getByTestId('lb-trend');
  const slowLb = lbRows.filter({ hasText: 'Slow Down' }).getByTestId('lb-trend');
  check('each fly row has a trend line', await fastLb.count() === 1 && await slowLb.count() === 1);
  const f1 = Number(await fastLb.getAttribute('y1')), f2 = Number(await fastLb.getAttribute('y2'));
  const s1 = Number(await slowLb.getAttribute('y1')), s2 = Number(await slowLb.getAttribute('y2'));
  check('faster athlete slopes down, slower slopes up', f2 > f1 && s2 < s1, `${f1}->${f2} | ${s1}->${s2}`);
  const fastPts = await lbRows.filter({ hasText: 'Fast Feet' }).locator('polyline').getAttribute('points');
  const ys = fastPts.split(' ').map(p => Number(p.split(',')[1]));
  check('raw times: the fastest (last) point sits lowest', ys[ys.length - 1] === Math.max(...ys), fastPts);
  check('footer reads lower = faster', /lower = faster, dashed = trend/.test(await dlg.getByTestId('lb-page').nth(0).innerText()));
  await page.locator('#lb-metric').selectOption({ label: 'Vertical Jump (Hands on Hips)' }).catch(async () => {
    const opts = await page.locator('#lb-metric option').allTextContents();
    const v = opts.find(o => /Vertical/i.test(o)); if (v) await page.locator('#lb-metric').selectOption({ label: v });
  });
  await page.waitForTimeout(500);
  check('jump leaderboard has no trend lines', await dlg.getByTestId('lb-trend').count() === 0 && /up = improvement/.test(await dlg.getByTestId('lb-page').nth(0).innerText()));

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

// Run with:  node tests/tooltip-units.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// CustomTooltip was written only for ProfilesScreen's single 'Weight' series, so it
// hardcoded "'Weight' -> lbs, anything else -> hrs". Analytics' series are named
// 'Avg Weight' and 'Compliance', neither of which matched, so both silently showed
// "hrs" - a weight trend suffixed hrs, and a percentage suffixed hrs.
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

const athletes = [{ id: uuid(1), name: 'Chart Athlete', sport: 'Football', team: 'Varsity', grade: '11th', position: 'RB' }];
const logs = [
  { id: uuid(10), athlete_id: uuid(1), athlete_name: 'Chart Athlete', sport: 'Football', weight_lbs: 180, sleep_hrs: 7.5, session_type: null, is_baseline: true, created_at: ago(10) },
  { id: uuid(11), athlete_id: uuid(1), athlete_name: 'Chart Athlete', sport: 'Football', weight_lbs: 178, sleep_hrs: 8, session_type: null, is_baseline: false, created_at: ago(2) },
];

const newPage = async (browser) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await stubAuth(page);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, hdrs);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  return page;
};

(async () => {
  const browser = await chromium.launch(LAUNCH_OPTS);

  // Recharts' hit-testing for a thin AreaChart stroke did not reliably respond to
  // Playwright's element .hover() when the visible line only spans a short diagonal
  // segment (a sparse fixture with mostly-null days draws one short connectNulls
  // segment near the chart's edge, not a line spanning the full width). Reading the
  // path's own `d` attribute and moving the mouse to a point actually on that line -
  // in real page coordinates, offset from the SVG surface's bounding box - reproduces
  // what a person hovering the chart does, rather than trusting element geometry that
  // does not match the path's real hit area for a nearly-flat short segment.
  const hoverPointOnPath = async (page, chartIndex, pathSelector) => {
    const wrapper = page.locator('.recharts-wrapper').nth(chartIndex);
    const surface = wrapper.locator('.recharts-surface');
    const surfaceBox = await surface.boundingBox();
    const path = wrapper.locator(pathSelector).first();
    if (!(await path.count()) || !surfaceBox) return null;
    const d = await path.getAttribute('d');
    // Parse the first "x,y" pair out of a `M<x>,<y>L<x>,<y>` path - the line's start
    // point is always on the line itself.
    const m = /M\s*([\d.]+)[ ,]([\d.]+)/.exec(d || '');
    if (!m) return null;
    const x = surfaceBox.x + Number(m[1]);
    const y = surfaceBox.y + Number(m[2]);
    await page.mouse.move(x, y);
    await page.mouse.move(x + 0.5, y + 0.5); // a second move so Recharts sees real movement, not just a position
    await page.waitForTimeout(500);
    return wrapper.locator('.recharts-tooltip-wrapper').innerText().catch(() => '');
  };

  // BarChart rectangles hover reliably with Playwright's own .hover({ force: true }),
  // unlike the thin AreaChart stroke above.
  const hoverBar = async (page, chartIndex) => {
    const wrapper = page.locator('.recharts-wrapper').nth(chartIndex);
    const rect = wrapper.locator('.recharts-rectangle').first();
    if (!(await rect.count())) return null;
    await rect.hover({ force: true });
    await page.waitForTimeout(500);
    return wrapper.locator('.recharts-tooltip-wrapper').innerText().catch(() => '');
  };

  console.log('\n[A] Analytics weight trend tooltip reads lbs, not hrs');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);
    // Chart order on the page: 0 = weight trend (AreaChart).
    const tip = await hoverPointOnPath(page, 0, '.recharts-area path.recharts-curve');
    check('tooltip appeared', !!tip && tip.length > 0, `got: ${JSON.stringify(tip)}`);
    check('weight tooltip says lbs', /lbs/.test(tip || ''), tip);
    check('weight tooltip does NOT say hrs', !/hrs/.test(tip || ''), tip);
  }

  console.log('\n[B] Analytics compliance tooltip reads %, not hrs');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#analytics`); await page.waitForTimeout(2500);
    // Chart order: 0 = weight trend, 1 = compliance (BarChart).
    const tip = await hoverBar(page, 1);
    check('tooltip appeared', !!tip && tip.length > 0, `got: ${JSON.stringify(tip)}`);
    check('compliance tooltip says %', /%/.test(tip || ''), tip);
    check('compliance tooltip does NOT say hrs', !/hrs/.test(tip || ''), tip);
  }

  console.log('\n[C] ProfilesScreen tooltips unchanged (no regression)');
  {
    const page = await newPage(browser);
    await page.goto(`${APP}/#profiles`); await page.waitForTimeout(1800);
    await page.getByText('Chart Athlete').first().click(); await page.waitForTimeout(1800);
    // The profile's weight trend is the first chart on the page.
    const tip = await hoverPointOnPath(page, 0, '.recharts-area path.recharts-curve');
    check('profile weight tooltip still says lbs', /lbs/.test(tip || ''), tip);
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

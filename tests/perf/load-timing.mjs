// Cold-load timing on an iPad-class profile. Supabase is fully stubbed (no real DB traffic).
// Usage: APP_URL=http://127.0.0.1:4173 LABEL=x RUNS=3 node tests/perf/load-timing.mjs
// (preview build served; CHROMIUM_PATH as for the tests). Prints medians for a signed-out
// load and a signed-in #entry load with 250 athletes: first paint, app mounted, roster
// shown, icon font loaded, largest paint, bytes. Used by the weekly performance review
// (.claude/agents/hpd-performance.md); baselines in docs/OPS.md.
import { chromium } from 'playwright';
import { stubAuth, isAuthRoute, fulfillAuth } from '../lib/auth-stub.js';

const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const RUNS = Number(process.env.RUNS || 3);
const LABEL = process.env.LABEL || 'build';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

const SPORTS = ['Football', 'Volleyball', 'Wrestling', 'Baseball', 'Track & Field'];
const athletes = Array.from({ length: 250 }, (_, i) => ({
  id: uuid(i + 1), name: `Athlete${i + 1} Test${i + 1}`, sport: SPORTS[i % SPORTS.length],
  team: 'Varsity', grade: '11th', position: 'ATH', created_at: new Date(Date.now() - 90 * 864e5).toISOString(),
}));
const logs = []; let li = 1000;
for (const a of athletes) for (let d = 1; d <= 8; d++) logs.push({
  id: uuid(++li), athlete_id: a.id, athlete_name: a.name, sport: a.sport, weight_lbs: 180 + (d % 5),
  sleep_hrs: 8, rpe: null, session_minutes: null, session_label: null, session_type: null,
  is_baseline: d === 1, created_at: new Date(Date.now() - d * 864e5).toISOString(),
});

const INIT = () => {
  const mark = (k) => { if (window.__t[k] == null) requestAnimationFrame(() => { window.__t[k] ??= performance.now(); }); };
  window.__t = {};
  let mounted = false;
  Object.defineProperty(window, '__hpdMounted', { configurable: true, get: () => mounted, set: (v) => { mounted = v; window.__t.mounted ??= performance.now(); } });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__t.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__t.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  document.fonts.addEventListener('loadingdone', (ev) => {
    for (const f of ev.fontfaces) if (/Material Symbols/.test(f.family)) window.__t.icon ??= performance.now();
  });
  const mo = new MutationObserver(() => {
    if (document.querySelector('input[type="email"]')) mark('login');
    if (document.querySelector('[data-testid="athlete-card"]')) mark('roster');
  });
  document.addEventListener('DOMContentLoaded', () => mo.observe(document.documentElement, { childList: true, subtree: true }));
};

async function once(browser, signedIn) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  if (signedIn) await stubAuth(page);
  await page.addInitScript(INIT);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    const hdrs = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...hdrs, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) {
      if (!signedIn) return route.fulfill({ status: 401, headers: hdrs, body: '{}' });
      return fulfillAuth(route, url, hdrs);
    }
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && method === 'GET') return route.fulfill({ status: 200, headers: hdrs, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: hdrs, body: '[]' });
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const urls = new Map(); let bytes = 0; let iconBytes = 0, iconUrl = '';
  cdp.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url));
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
    const u = urls.get(e.requestId) || '';
    if (/fonts\.gstatic\.com\/(l\/font|icon\/font|s\/materialsymbols)/i.test(u)) { iconBytes += e.encodedDataLength; iconUrl = u; }
  });
  await page.goto(`${APP}/${signedIn ? '#entry' : ''}`, { waitUntil: 'commit' });
  const need = signedIn ? ['mounted', 'roster', 'icon'] : ['mounted', 'login'];
  const deadline = Date.now() + 30000;
  let t = {};
  while (Date.now() < deadline) {
    t = await page.evaluate(() => window.__t).catch(() => ({}));
    if (t && need.every((k) => t[k] != null)) break;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(300);
  t = await page.evaluate(() => window.__t);
  // gstatic icon file size by URL (fallback if CDP URL match missed)
  const fontRes = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /gstatic/.test(r.name)).map((r) => ({ n: r.name.slice(0, 120), end: r.responseEnd, size: r.transferSize || r.encodedBodySize })));
  await ctx.close();
  return { ...t, bytes, iconBytes, iconUrl, fontRes };
}

const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const f = (ms) => (ms == null ? 'n/a' : (ms / 1000).toFixed(2) + ' s');

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  for (const signedIn of [false, true]) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await once(browser, signedIn));
    const keys = signedIn ? ['fcp', 'mounted', 'roster', 'icon', 'lcp'] : ['fcp', 'mounted', 'login', 'lcp'];
    const name = signedIn ? 'signed-in #entry' : 'login (signed out)';
    console.log(`[${LABEL}] ${name}: ` + keys.map((k) => `${k} ${f(med(runs.map((r) => r[k])))}`).join(' | ') +
      ` | net ${(med(runs.map((r) => r.bytes)) / 1024).toFixed(0)} KiB` + (signedIn ? ` | icon font ${(med(runs.map((r) => r.iconBytes)) / 1024).toFixed(1)} KiB` : ''));
    console.log(`   runs: ` + runs.map((r) => keys.map((k) => (r[k] == null ? '-' : (r[k] / 1000).toFixed(2))).join('/')).join('  '));
    if (signedIn) console.log('   gstatic:', JSON.stringify(runs[0].fontRes.map((x) => ({ n: x.n.replace(/^https:\/\/fonts\.gstatic\.com\//, '').slice(0, 50), end: Math.round(x.end), size: x.size }))));
  }
  await browser.close();
})();

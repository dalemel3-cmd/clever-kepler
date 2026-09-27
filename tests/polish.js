// Run with:  node tests/polish.js
// Requires a preview server on http://127.0.0.1:4173 and Playwright.
// All Supabase traffic is intercepted - never touches the real database.
//
// v5.2.4 polish audit guards: page metadata, per-screen titles, a real not-found
// view, one h1 per screen, no sideways scrolling on phones/tablets, no leftover
// template assets, and no controls that look clickable but do nothing.
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { stubAuth, isAuthRoute, fulfillAuth } from './lib/auth-stub.js';

const LAUNCH_OPTS = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';
const SUPA = '**/cwfpjlomlvkburugolky.supabase.co/**';
const uuid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); }
};

const athletes = Array.from({ length: 12 }, (_, i) => ({
  id: uuid(i + 1), sport: ['Football', 'Volleyball', 'WSOC'][i % 3], team: 'Varsity', position: 'WR',
  name: i === 0 ? 'Christopher Alexander Montgomery-Wellington III' : `Athlete ${i + 1}`,
}));
const logs = athletes.map((a, i) => ({ id: uuid(500 + i), athlete_id: a.id, athlete_name: a.name, sport: a.sport, weight_lbs: 190, sleep_hrs: 7, created_at: new Date().toISOString(), is_baseline: true }));

async function newPage(browser, width, height) {
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await stubAuth(page);
  await page.route(SUPA, async (route) => {
    const req = route.request(); const url = req.url(); const m = req.method();
    const h = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (m === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...h, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.includes('/realtime/')) return route.abort();
    if (isAuthRoute(url)) return fulfillAuth(route, url, h);
    if (url.includes('/rest/v1/coaches')) return route.fulfill({ status: 200, headers: h, body: JSON.stringify([{ approved: true }]) });
    if (url.includes('/rest/v1/athletes') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(athletes) });
    if (url.includes('/rest/v1/weigh_ins') && m === 'GET') return route.fulfill({ status: 200, headers: h, body: JSON.stringify(logs) });
    return route.fulfill({ status: 200, headers: h, body: '[]' });
  });
  return page;
}

(async () => {
  console.log('\n[A] Static assets and metadata');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  check('meta description present', /<meta name="description" content="[^"]{30,}"/.test(html));
  check('robots noindex (private staff tool)', /<meta name="robots" content="noindex/.test(html));
  check('og:image is an absolute URL', /og:image" content="https:\/\//.test(html));
  check('canonical link present', /rel="canonical"/.test(html));
  check('pinch-zoom not blocked', !/user-scalable=no|maximum-scale=1/.test((html.match(/<meta name="viewport"[^>]*>/) || [''])[0]));
  check('icon font loaded once', (html.match(/Material\+Symbols/g) || []).length === 1);
  check('Vite template favicon.svg removed', !existsSync(new URL('../public/favicon.svg', import.meta.url)));
  check('Vite template icons.svg removed', !existsSync(new URL('../public/icons.svg', import.meta.url)));
  for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'og-image.png', 'robots.txt']) {
    check(`public/${f} exists`, existsSync(new URL(`../public/${f}`, import.meta.url)));
  }
  const src = ['App.jsx'].map(f => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');
  check('no console.log left in App.jsx', !/console\.log\(/.test(src));

  const browser = await chromium.launch(LAUNCH_OPTS);

  console.log('\n[B] Every screen: unique title, one h1');
  {
    const page = await newPage(browser, 1280, 800);
    const titles = new Set();
    for (const s of ['dashboard', 'alerts', 'entry', 'groups', 'athletes', 'analytics', 'reports', 'settings']) {
      await page.goto(`${APP}/#${s}`); await page.waitForTimeout(1300);
      const t = await page.title();
      titles.add(t);
      const h1 = await page.locator('h1:visible').count();
      check(`#${s}: exactly one visible h1`, h1 === 1, `found ${h1}`);
    }
    check('8 screens have 8 different titles', titles.size === 8, [...titles].join(' | '));
    await page.goto(`${APP}/#this-does-not-exist`); await page.waitForTimeout(1200);
    check('unknown hash shows Page not found', /Page not found/i.test(await page.locator('body').innerText()));
    check('not-found page has its own title', /Page not found/.test(await page.title()));
    await page.getByRole('button', { name: /Go to Today/i }).click(); await page.waitForTimeout(800);
    check('Go to Today returns to the dashboard', /OVERVIEW/i.test(await page.locator('body').innerText()));
  }

  console.log('\n[C] No sideways scrolling on phone and tablet widths');
  for (const [w, h] of [[390, 844], [768, 1024], [820, 1180]]) {
    const page = await newPage(browser, w, h);
    for (const s of ['dashboard', 'entry', 'groups', 'athletes', 'reports', 'settings']) {
      await page.goto(`${APP}/#${s}`); await page.waitForTimeout(1200);
      const extra = await page.evaluate(() => { const r = document.querySelector('[data-scroll-root]'); return r ? r.scrollWidth - r.clientWidth : 0; });
      check(`${w}px #${s}: no sideways scroll`, extra <= 1, `${extra}px wider than the screen`);
    }
  }

  console.log('\n[D] Nothing looks clickable without doing anything');
  {
    const page = await newPage(browser, 1280, 800);
    for (const s of ['dashboard', 'entry', 'lifts', 'groups', 'athletes', 'reports', 'settings']) {
      await page.goto(`${APP}/#${s}`); await page.waitForTimeout(1300);
      const dead = await page.evaluate(() => [...document.querySelectorAll('button')].filter(el => {
        if (!el.getBoundingClientRect().height || el.disabled) return false;
        const k = Object.keys(el).find(x => x.startsWith('__reactProps'));
        const p = k ? el[k] : {};
        return !(p.onClick || p.onMouseDown || p.onPointerDown || el.closest('form'));
      }).map(el => (el.innerText || el.title || el.outerHTML).trim().slice(0, 40)));
      check(`#${s}: every button has a handler`, dead.length === 0, dead.join(', '));
    }
  }

  console.log('\n[E] Avatars use two initials, not every word');
  {
    const page = await newPage(browser, 1280, 800);
    await page.goto(`${APP}/#athletes`); await page.waitForTimeout(1500);
    const body = await page.locator('body').innerText();
    check('long name shows CM, not CAMI', /\bCM\b/.test(body) && !/\bCAMI\b/.test(body));
  }

  console.log(`\n${fail === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${pass} passed, ${fail} failed)`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();

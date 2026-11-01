// Run with:  node tests/icon-font-subset.js   (no browser needed)
// v5.15.4: index.html loads the Material Symbols font with icon_names= (just the icons the
// app uses, ~52 KB instead of ~4 MB). An icon missing from that list renders as its name
// ("chevron_left") instead of a glyph, so this checks every icon in src/ is listed, and
// that the list is alphabetical (Google Fonts requires it).
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
register('./lib/src-resolve.mjs', import.meta.url);
const { NAV_GROUPS } = await import('../src/navigation.js');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };

const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/Material\+Symbols\+Outlined[^"]*icon_names=([a-z0-9_,]+)/);
const listed = m ? m[1].split(',') : [];
check('index.html loads the icon font with an icon_names list', listed.length > 0);
check('icon_names is alphabetical with no repeats', JSON.stringify(listed) === JSON.stringify([...new Set(listed)].sort()), listed.join(','));

// Every <span className="material-symbols-outlined ...">name</span>, plus the quoted names
// in an expression child ({cond ? 'a' : 'b'}), plus the sidebar's NAV_GROUPS icons.
const used = new Set(NAV_GROUPS.map(g => g.icon));
const unresolved = [];
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|html)$/.test(f)) files.push(p); } })('src');
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let i = 0;
  for (;;) {
    const at = s.indexOf('material-symbols-outlined', i);
    if (at < 0) break;
    i = at + 25;
    const gt = s.indexOf('>', at);
    if (gt < 0) break;
    const lt = s.indexOf('<', gt);
    const txt = s.slice(gt + 1, lt < 0 ? gt + 80 : lt).trim();
    if (/^[a-z_0-9]+$/.test(txt)) { used.add(txt); continue; }
    const quoted = [...txt.matchAll(/'([a-z_0-9]+)'/g)].map(x => x[1]);
    if (quoted.length) quoted.forEach(q => used.add(q));
    else if (txt && txt !== '{icon}' && !/^icon_name$/.test(txt)) unresolved.push(`${f}: ${txt.slice(0, 60)}`);
  }
}
const missing = [...used].filter(n => !listed.includes(n)).sort();
check(`every icon the app uses is in icon_names (${used.size} used)`, missing.length === 0, `add to index.html: ${missing.join(', ')}`);
check('no icon picked by an expression this test can\'t read', unresolved.length === 0, unresolved.join(' | '));
const unused = listed.filter(n => !used.has(n));
check('no unused icons in the list', unused.length === 0, unused.join(', '));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

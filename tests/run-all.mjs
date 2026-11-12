// Runs every tests/*.js and exits 1 if any fails (v5.16.1). `npm test`.
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort &   (the browser tests need it)
//   npm test                         all files, one at a time
//   npm test -- --jobs 3             three at a time (faster; timing tests may need a rerun)
//   npm test -- --shard 2/4          the 2nd quarter of the files (GitHub runs 4 in parallel)
//   npm test -- usage-guards auth    only files whose name contains one of these
// A file that fails is run once more on its own before it counts as failed (a chart hover
// or a timing check can miss on a busy machine). APP_URL and CHROMIUM_PATH pass through.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(dir);
// `--name value` and `--name=value` both work.
const args = process.argv.slice(2).flatMap(a => (/^--[a-z]+=/.test(a) ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a]));
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const jobs = Math.max(1, Number(opt('--jobs')) || 1);
const shard = (opt('--shard') || '1/1').split('/').map(Number);
const APP = process.env.APP_URL || 'http://127.0.0.1:4173';

let files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
if (args.length) files = files.filter(f => args.some(a => f.includes(a)));
const unknown = args.filter(a => a.startsWith('--'));
if (unknown.length || !(shard[0] >= 1 && shard[0] <= shard[1])) { console.error(`Not understood: ${unknown.join(' ') || `--shard ${shard.join('/')}`}`); process.exit(2); }
files = files.filter((_, i) => i % shard[1] === shard[0] - 1);
// A mistyped name must not pass by running nothing.
if (!files.length) { console.error('No test files match.'); process.exit(2); }

// Playwright installed only globally (the Claude cloud container): ES modules can't see it
// without the loader.
const loader = await import('playwright').then(() => [], () => ['--import', path.join(dir, 'lib/pw-resolve.mjs')]);

const up = await fetch(APP).then(r => r.ok, () => false);
if (!up) { console.error(`Nothing is serving ${APP}. Run: npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort`); process.exit(2); }

const SUMMARY = /(\d+) passed, (\d+) failed|(\d+)\/(\d+) checks passed/;
function run(file) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [...loader, path.join('tests', file)], { cwd: root, env: process.env });
    let out = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { out += '\nTIMEOUT after 400 s'; p.kill('SIGKILL'); }, 400000);
    p.on('close', (code) => {
      clearTimeout(timer);
      const lines = out.split('\n');
      const summary = [...lines].reverse().find(l => SUMMARY.test(l)) || '';
      const fails = lines.filter(l => /^\s*FAIL\b/.test(l)).map(l => l.trim());
      resolve({ file, ok: code === 0 && !fails.length && !!summary, summary: summary.trim() || `no result (exit ${code})`, fails, tail: lines.slice(-12).join('\n') });
    });
  });
}

const results = [];
const queue = [...files];
await Promise.all(Array.from({ length: jobs }, async () => {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const r = await run(f);
    console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${f}: ${r.summary}`);
    results.push(r);
  }
}));

// One more try, alone, for anything that failed.
for (const r of results.filter(x => !x.ok)) {
  const again = await run(r.file);
  console.log(`${again.ok ? 'ok  ' : 'FAIL'}  ${r.file} (rerun): ${again.summary}`);
  Object.assign(r, again, { rerun: true });
}

const failed = results.filter(r => !r.ok);
const flaky = results.filter(r => r.ok && r.rerun);
let report = `${results.length} files: ${results.length - failed.length} passed, ${failed.length} failed`;
if (flaky.length) report += `\nPassed on a rerun: ${flaky.map(r => r.file).join(', ')}`;
for (const r of failed) report += `\n\n${r.file}: ${r.summary}\n${(r.fails.length ? r.fails.join('\n') : r.tail)}`;
console.log(`\n${report}`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Tests (part ${shard[0]} of ${shard[1]})\n\n\`\`\`\n${report}\n\`\`\`\n`);
process.exit(failed.length ? 1 : 0);

// Turns the older "diagnostic log" probes into real pass/fail tests.
//
// Those scripts print lines like
//   [STATUS] REST dead: claims live=false (false expected), shows reconnecting=true (true expected)
//   [GHOST] value="" (empty expected), placeholder="199" ("199" expected)
// and always exited 0, so a mismatch only showed up if someone read the output.
// Importing this wraps console.log: every `name=value (expected expected)` or
// `name: value (expected)` pair is compared, mismatches are echoed as FAIL lines,
// and the process exits non-zero at the end if any were seen. Parentheticals that
// aren't a single token (e.g. "(initial load used 1)") are ignored.
const origLog = console.log.bind(console);
let checked = 0;
const mismatches = [];

const PAIR = /([^\s=:,]+)\s*[=:]\s*("[^"]*"|[^\s,()]+)\s*\(\s*("[^"]*"|[^\s()=]+)(?:\s+expected)?\s*\)/g;
const norm = (v) => {
  const s = String(v).replace(/^"(.*)"$/, '$1');
  return s === 'empty' ? '' : s;
};

console.log = (...args) => {
  const line = args.map(String).join(' ');
  origLog(...args);
  for (const m of line.matchAll(PAIR)) {
    checked++;
    const [, name, got, want] = m;
    if (norm(got) !== norm(want)) {
      mismatches.push(`${name}: got ${got}, expected ${want}`);
      origLog(`  FAIL  ${name}: got ${got}, expected ${want}`);
    }
  }
};

process.on('exit', (code) => {
  origLog(`\n${mismatches.length === 0 ? 'ALL PROBES PASSED' : 'PROBES FAILED'}  (${checked - mismatches.length} passed, ${mismatches.length} failed)`);
  if (mismatches.length && code === 0) process.exitCode = 1;
});

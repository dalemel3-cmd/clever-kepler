// In-memory stand-in for src/supabaseClient.js (tests/lib/fake-supabase-hook.mjs).
// Tables live in fake.tables[name] (arrays, already in the order the query asks for).
// Like PostgREST, a request returns at most fake.maxRows rows; .range(a, b) slices.
// fake.onUpsert(table, rows) decides an upsert's result ({ error } or nothing);
// fake.delay (ms) holds every request; fake.requests logs them.
export const fake = { tables: {}, maxRows: 1000, delay: 0, requests: [], onUpsert: null, beforePage: null };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function query(table) {
  const q = { table, range: null };
  const chain = {
    select() { return chain; }, order() { return chain; }, gt() { return chain; }, gte() { return chain; }, lt() { return chain; },
    eq() { return chain; }, is() { return chain; }, not() { return chain; }, contains() { return chain; }, limit() { return chain; },
    range(a, b) { q.range = [a, b]; return chain; },
    upsert(rows) { q.upsert = rows; return chain; },
    then(res, rej) { return run().then(res, rej); },
  };
  async function run() {
    fake.requests.push({ table, range: q.range, upsert: q.upsert });
    if (fake.delay) await sleep(fake.delay);
    if (q.upsert) { const r = fake.onUpsert ? fake.onUpsert(table, [].concat(q.upsert)) : null; return { data: null, error: r?.error || null }; }
    if (fake.beforePage) fake.beforePage(table, q.range);
    const all = fake.tables[table] || [];
    if (fake.maxRows > 10000) return { data: all, error: null }; // a server that ignores Range
    const [a, b] = q.range || [0, all.length - 1];
    return { data: all.slice(a, Math.min(b + 1, a + fake.maxRows)), error: null };
  }
  return chain;
}
export const supabase = { from: (t) => query(t), rpc: () => query('rpc') };

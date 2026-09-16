// Run with:  deno test supabase/functions/plyomat-sync/sync.test.ts
// Mocks the global `fetch` Deno provides - no real network, no live Plyomat API key
// needed. Pins down the pagination/backoff/error-shape logic the way
// tests/plyomat-import.js pins down buildImportPlan at the pure-function level.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fetchAllPages, PlyomatApiError, runSync } from './sync.ts';

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.test('fetchAllPages pages until has_more is false', async () => {
  let calls = 0;
  const fakeFetch = (async (url: string) => {
    calls++;
    const offset = new URL(url).searchParams.get('offset');
    if (offset === '0') return jsonResponse({ data: [{ id: 'a' }], total: 2, limit: 1, offset: 0, has_more: true });
    return jsonResponse({ data: [{ id: 'b' }], total: 2, limit: 1, offset: 1, has_more: false });
  }) as unknown as typeof fetch;

  const result = await fetchAllPages(fakeFetch, 'https://api.plyomat.com/v1', 'pk_test', '/sets', {});
  assertEquals(result.rows.length, 2);
  assertEquals(result.partial, false);
  assertEquals(calls, 2);
});

Deno.test('fetchAllPages retries a 429 using Retry-After, then succeeds', async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls++;
    if (calls === 1) return jsonResponse({ error: { code: 'rate_limited', message: 'slow down' } }, 429, { 'Retry-After': '0' });
    return jsonResponse({ data: [{ id: 'a' }], total: 1, limit: 500, offset: 0, has_more: false });
  }) as unknown as typeof fetch;

  const result = await fetchAllPages(fakeFetch, 'https://api.plyomat.com/v1', 'pk_test', '/sets', {});
  assertEquals(result.rows.length, 1);
  assertEquals(result.partial, false);
  assertEquals(calls, 2);
});

Deno.test('fetchAllPages reports partial after exhausting 429 retries', async () => {
  const fakeFetch = (async () =>
    jsonResponse({ error: { code: 'rate_limited', message: 'slow down' } }, 429, { 'Retry-After': '0' })
  ) as unknown as typeof fetch;

  const result = await fetchAllPages(fakeFetch, 'https://api.plyomat.com/v1', 'pk_test', '/sets', {});
  assertEquals(result.rows.length, 0);
  assertEquals(result.partial, true);
});

Deno.test('fetchAllPages throws PlyomatApiError with the API\'s own code/message on other errors', async () => {
  const fakeFetch = (async () =>
    jsonResponse({ error: { code: 'unauthorized', message: 'bad key' } }, 401)
  ) as unknown as typeof fetch;

  let caught: unknown = null;
  try {
    await fetchAllPages(fakeFetch, 'https://api.plyomat.com/v1', 'pk_bad', '/sets', {});
  } catch (e) {
    caught = e;
  }
  if (!(caught instanceof PlyomatApiError)) throw new Error('expected a PlyomatApiError');
  assertEquals(caught.code, 'unauthorized');
  assertEquals(caught.status, 401);
});

Deno.test('runSync resolves only athletes referenced by fetched sets, and sets fetchedThrough to the newest started_at', async () => {
  const sets = [
    { id: 's1', athlete_id: 'a1', display_mode: 'vertical', laterality: 'bilateral', started_at: '2026-09-01T00:00:00Z', version: 1, reps: [] },
    { id: 's2', athlete_id: 'a2', display_mode: 'vertical', laterality: 'bilateral', started_at: '2026-09-03T00:00:00Z', version: 1, reps: [] },
  ];
  const athletes = [
    { id: 'a1', first_name: 'A', last_name: 'One' },
    { id: 'a2', first_name: 'A', last_name: 'Two' },
    { id: 'a3', first_name: 'A', last_name: 'Three' }, // not referenced by any set
  ];
  const fakeFetch = (async (url: string) => {
    if (url.includes('/sets')) return jsonResponse({ data: sets, total: 2, limit: 500, offset: 0, has_more: false });
    return jsonResponse({ data: athletes, total: 3, limit: 500, offset: 0, has_more: false });
  }) as unknown as typeof fetch;

  const result = await runSync(fakeFetch, 'https://api.plyomat.com/v1', 'pk_test', null);
  assertEquals(result.sets.length, 2);
  assertEquals(result.athletes.length, 2);
  assertEquals(result.athletes.map((a) => a.id).sort(), ['a1', 'a2']);
  assertEquals(result.fetchedThrough, '2026-09-03T00:00:00Z');
  assertEquals(result.partial, false);
});

Deno.test('runSync reports partial and null fetchedThrough when a page is rate-limited past retry', async () => {
  const fakeFetch = (async (url: string) => {
    if (url.includes('/sets')) return jsonResponse({ error: { code: 'rate_limited', message: 'slow down' } }, 429, { 'Retry-After': '0' });
    return jsonResponse({ data: [], total: 0, limit: 500, offset: 0, has_more: false });
  }) as unknown as typeof fetch;

  const result = await runSync(fakeFetch, 'https://api.plyomat.com/v1', 'pk_test', null);
  assertEquals(result.partial, true);
  assertEquals(result.partialReason, 'rate_limited');
  assertEquals(result.fetchedThrough, null);
});

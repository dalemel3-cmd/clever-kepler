// Pure pagination/backoff logic for pulling Plyomat's Partner API, factored out of
// index.ts so it can be unit-tested with a mocked `fetch` (deno test) without needing a
// running Supabase project or a real Plyomat API key - see sync.test.ts.

export interface PlyomatSet {
  id: string;
  session_id?: string;
  athlete_id: string;
  device_id?: string | null;
  display_mode: string;
  laterality: string;
  started_at: string;
  ended_at?: string | null;
  version: number;
  reps: Array<{
    rep_index: number;
    jump_height_cm?: number | null;
    is_kept: boolean;
    captured_at: string;
    [k: string]: unknown;
  }>;
}

export interface PlyomatAthlete {
  id: string;
  first_name: string;
  last_name: string;
  external_id?: string | null;
  external_source?: string | null;
  [k: string]: unknown;
}

interface PlyomatListEnvelope<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

interface PlyomatErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class PlyomatApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const PAGE_LIMIT = 500;
// A page every ~1.05s stays comfortably under Plyomat's 60 req/min budget across a
// sync's combined /sets + /athletes calls, without needing real token-bucket precision
// for what is at most a few hundred requests in one invocation.
const REQUEST_SPACING_MS = 1050;
const MAX_RATE_LIMIT_RETRIES = 5;
// Never wait longer than this for one Retry-After, however large Plyomat's own value is -
// an Edge Function has its own execution time limit, and a single page should not eat
// most of it.
const MAX_RETRY_AFTER_MS = 65_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FetchPageResult<T> {
  envelope: PlyomatListEnvelope<T> | null;
  /** true when retries were exhausted on a 429 and this page could not be fetched. */
  rateLimited: boolean;
}

/**
 * Fetches one page of a Plyomat list endpoint, retrying on 429 up to
 * MAX_RATE_LIMIT_RETRIES times using the server's own Retry-After header. Any other
 * non-2xx throws PlyomatApiError with Plyomat's own error code/message intact, so the
 * caller can surface it verbatim rather than a generic failure.
 */
export async function fetchPage<T>(
  fetchImpl: typeof fetch,
  apiBase: string,
  apiKey: string,
  path: string,
  params: Record<string, string>,
): Promise<FetchPageResult<T>> {
  const url = new URL(apiBase + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const res = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (res.status === 429) {
      if (attempt === MAX_RATE_LIMIT_RETRIES) return { envelope: null, rateLimited: true };
      const retryAfterSec = Number(res.headers.get('Retry-After') || '1');
      const waitMs = Math.min(Math.max(retryAfterSec, 1) * 1000, MAX_RETRY_AFTER_MS);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      let body: PlyomatErrorBody | null = null;
      try { body = await res.json(); } catch (_e) { /* fall through to generic error below */ }
      throw new PlyomatApiError(
        body?.error?.code || 'plyomat_error',
        body?.error?.message || `Plyomat API returned ${res.status}`,
        res.status,
      );
    }

    const envelope = (await res.json()) as PlyomatListEnvelope<T>;
    return { envelope, rateLimited: false };
  }
  return { envelope: null, rateLimited: true };
}

export interface FetchAllResult<T> {
  rows: T[];
  /** true when a page could not be fetched after exhausting rate-limit retries. */
  partial: boolean;
}

/**
 * Pages a Plyomat list endpoint to exhaustion (or until a page is rate-limited past
 * retry), spacing requests to stay under the per-key budget across a whole sync.
 */
export async function fetchAllPages<T>(
  fetchImpl: typeof fetch,
  apiBase: string,
  apiKey: string,
  path: string,
  baseParams: Record<string, string>,
): Promise<FetchAllResult<T>> {
  const rows: T[] = [];
  let offset = 0;
  let first = true;

  while (true) {
    if (!first) await sleep(REQUEST_SPACING_MS);
    first = false;

    const { envelope, rateLimited } = await fetchPage<T>(fetchImpl, apiBase, apiKey, path, {
      ...baseParams,
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    if (rateLimited || !envelope) return { rows, partial: true };

    rows.push(...envelope.data);
    if (!envelope.has_more) return { rows, partial: false };
    offset += PAGE_LIMIT;
  }
}

export interface SyncResult {
  ok: true;
  sets: PlyomatSet[];
  athletes: PlyomatAthlete[];
  fetchedThrough: string | null;
  partial: boolean;
  partialReason?: string;
}

/**
 * Full sync: pages /sets since the given checkpoint, then resolves every referenced
 * athlete_id via /athletes (a full-roster pull, not N per-id calls - cheap and simple at
 * one school's roster size, and picks up athletes with zero recent sets for free).
 */
export async function runSync(
  fetchImpl: typeof fetch,
  apiBase: string,
  apiKey: string,
  since: string | null,
): Promise<SyncResult> {
  const setsResult = await fetchAllPages<PlyomatSet>(fetchImpl, apiBase, apiKey, '/sets', since ? { since } : {});

  const athleteIds = new Set(setsResult.rows.map((s) => s.athlete_id));
  const athletesResult = await fetchAllPages<PlyomatAthlete>(fetchImpl, apiBase, apiKey, '/athletes', {});
  const athletes = athletesResult.rows.filter((a) => athleteIds.has(a.id));

  const partial = setsResult.partial || athletesResult.partial;
  const newestStartedAt = setsResult.rows.reduce<string | null>(
    (latest, s) => (!latest || s.started_at > latest ? s.started_at : latest),
    null,
  );

  return {
    ok: true,
    sets: setsResult.rows,
    athletes,
    // Only meaningful when the sync wasn't partial - the caller (client) must not
    // advance its checkpoint past data a rate-limited run didn't actually retrieve.
    fetchedThrough: partial ? null : (newestStartedAt || new Date().toISOString()),
    partial,
    partialReason: partial ? 'rate_limited' : undefined,
  };
}

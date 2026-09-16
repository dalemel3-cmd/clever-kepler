// Thin authenticated proxy in front of Plyomat's Partner API. This function makes zero
// product/matching decisions - it only holds PLYOMAT_API_KEY outside the browser and
// hands back raw Plyomat data. Plan-building (fuzzy name matching, sport inference,
// dedup) stays entirely client-side in src/features/analytics/plyomatImport.js, so there
// is exactly one implementation of that logic, not a duplicate copy in Deno.
//
// Deploy:   supabase functions deploy plyomat-sync
// Secret:   supabase secrets set PLYOMAT_API_KEY=pk_live_...   (set once, never committed)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { PlyomatApiError, runSync } from './sync.ts';

const PLYOMAT_API_BASE = 'https://api.plyomat.com/v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    // Verify the caller is an approved coach via the same is_approved_coach() function
    // every other RLS policy in this app relies on (db/003_coach_approval.sql) - one
    // definition of "who is a coach" in the whole system, not a second one here. The
    // incoming Authorization header carries the caller's own JWT because the client
    // calls this via supabase.functions.invoke(), which forwards it automatically.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: { code: 'unauthorized', message: 'Missing Authorization header.' } }), { status: 401, headers: jsonHeaders });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: isApproved, error: rpcError } = await supabaseClient.rpc('is_approved_coach');
    if (rpcError || !isApproved) {
      return new Response(JSON.stringify({ ok: false, error: { code: 'forbidden', message: 'Only approved coaches can sync from Plyomat.' } }), { status: 403, headers: jsonHeaders });
    }

    const apiKey = Deno.env.get('PLYOMAT_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ ok: false, error: { code: 'not_configured', message: 'PLYOMAT_API_KEY is not set for this project.' } }), { status: 500, headers: jsonHeaders });
    }

    let since: string | null = null;
    try {
      const body = await req.json();
      since = typeof body?.since === 'string' && body.since ? body.since : null;
    } catch (_e) {
      // No body / not JSON - treat as "fetch everything" (first-ever sync).
    }

    const result = await runSync(fetch, PLYOMAT_API_BASE, apiKey, since);
    return new Response(JSON.stringify(result), { status: 200, headers: jsonHeaders });
  } catch (e) {
    if (e instanceof PlyomatApiError) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: e.code, message: e.message } }),
        { status: e.status >= 400 && e.status < 600 ? e.status : 502, headers: jsonHeaders },
      );
    }
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'internal_error', message: e instanceof Error ? e.message : String(e) } }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

// Shared CORS headers for Edge Functions invoked from the app's own browser client via
// supabase.functions.invoke(). Standard Supabase Edge Function scaffold.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

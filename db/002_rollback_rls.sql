-- EMERGENCY ROLLBACK — restores the app instantly if anything goes wrong after
-- enabling RLS. Run this in Supabase → SQL Editor.
--
-- This returns the database to the state it was in before 001_enable_rls.sql:
-- fully open to the anon key. That is insecure, but it is better than a coach
-- unable to log weigh-ins during a session. Re-enable once the cause is found.
--
-- Weigh-ins recorded while the app was broken are NOT lost: failed writes stay
-- in the device's offline queue and upload automatically once access is restored.

alter table public.athletes  disable row level security;
alter table public.weigh_ins disable row level security;

-- Policies are left in place (harmless while RLS is disabled) so that re-enabling
-- is just the two `enable row level security` lines again.

select
  (select bool_or(relrowsecurity) from pg_class
     where relname in ('athletes','weigh_ins') and relnamespace='public'::regnamespace) as rls_still_enabled;
-- expect: false

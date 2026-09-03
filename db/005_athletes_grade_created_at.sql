-- 005: The two athlete columns that were only ever applied by hand.
--
-- ALREADY APPLIED to the live project. This file does not change anything there; it
-- exists so the schema can be rebuilt from this directory alone. Until now these two
-- columns lived only in a handoff note, which meant a rebuilt database would have
-- silently reintroduced the worst bug this app has had.
--
-- What went wrong without them: the app writes `grade` on every athlete create/update
-- and `created_at` on CSV roster import. PostgREST rejects the ENTIRE row when the
-- payload names a column that does not exist, and the app surfaced that as a generic
-- failure or, worse, as success:
--
--   - CSV roster upload failed 100% of the time
--   - Add Athlete silently fell back to device-only storage - it reported success, the
--     athlete appeared on that one iPad, and never reached the cloud
--   - Only the kiosk's auto-create path worked, because it sends just name + sport
--
-- Both statements are idempotent, so running this against the live project is a no-op.

alter table public.athletes add column if not exists grade text;
alter table public.athletes add column if not exists created_at timestamptz default now();

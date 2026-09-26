-- 013: archive instead of delete (v5.3.0 roster cleanup).
-- Graduated / departed athletes get archived_at set: they drop out of every roster,
-- kiosk, alert and report, but their weigh-ins, tests and lifts are kept, and they can
-- be restored from Teams > Athletes > Archived. NULL = active. Additive and nullable,
-- so older app versions that select * are unaffected.
alter table public.athletes add column if not exists archived_at timestamptz;

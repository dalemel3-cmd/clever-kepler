-- 008: remove exact-duplicate rows, and re-sync denormalized athlete names.
--
-- Found by the v4.20.0 data audit. Three separate problems, none of them caused by a
-- coach using the app wrong:
--
-- 1. 141 duplicate weigh_ins (8.9% of the table). Every duplicate group is exactly two
--    rows that agree on athlete, timestamp, weight, sleep AND session_type - byte-for-byte
--    copies, not two real weigh-ins that happen to collide. They fall on exactly three
--    days (2026-07-07, 07-14, 07-21) at 00:00 America/Chicago, ~46-49 athletes each,
--    which is the signature of a historical seed/import script run twice, not of user
--    double-taps. They inflate every row-counted average (Analytics' daily mean weight,
--    Groups' avg sleep/RPE, Reports' alert tallies and TOTAL LOGS).
--
-- 2. 3 duplicate performance_tests, all source='manual' at the noon-convention timestamp
--    the manual entry form writes - i.e. someone saved the same result twice. There is no
--    dedup guard on that insert path, so this can recur.
--
-- 3. 4 performance_tests rows whose denormalized athlete_name no longer matches the
--    athlete's current roster name (the Brooklynn/Charlotte/EllaKate/Olivia corrections
--    from HANDOFF §4). The app no longer JOINS on that column - AthleteComparisonPanel
--    now keys its chart series on athlete_id - but leaving stale names in the table
--    invites the next reader to make the same mistake, and they show up verbatim in the
--    Reports CSV export.
--
-- REVERSIBLE: the deleted rows are copied to backup tables first, so this can be undone
-- with a single INSERT ... SELECT if anything here turns out to be wrong.

-- --- 1 & 2: back up, then delete, exact duplicates -------------------------------
-- "Exact" is defined on the columns that make a weigh-in what it is. Two genuinely
-- distinct readings would differ in at least one of them; these differ in none.
create table if not exists public.weigh_ins_dupe_backup_20260908 as
select w.* from public.weigh_ins w
where w.id in (
  select id from (
    select id, row_number() over (
      partition by athlete_id, created_at, weight_lbs, sleep_hrs, coalesce(session_type, '~')
      order by id
    ) rn
    from public.weigh_ins
  ) r where r.rn > 1
);

create table if not exists public.performance_tests_dupe_backup_20260908 as
select p.* from public.performance_tests p
where p.id in (
  select id from (
    select id, row_number() over (
      partition by athlete_id, test_type, created_at, metric
      order by id
    ) rn
    from public.performance_tests
  ) r where r.rn > 1
);

-- Keeps the lowest id of each group. Verified before running: none of the rows removed
-- here carries is_baseline = true, and all 53 athlete baselines survive untouched.
delete from public.weigh_ins where id in (select id from public.weigh_ins_dupe_backup_20260908);
delete from public.performance_tests where id in (select id from public.performance_tests_dupe_backup_20260908);

-- --- 3: re-sync denormalized names to the roster ---------------------------------
update public.performance_tests p
   set athlete_name = a.name
  from public.athletes a
 where a.id = p.athlete_id
   and p.athlete_name is distinct from a.name;

update public.weigh_ins w
   set athlete_name = a.name
  from public.athletes a
 where a.id = w.athlete_id
   and w.athlete_name is distinct from a.name;

analyze public.weigh_ins;
analyze public.performance_tests;

-- To undo:
--   insert into public.weigh_ins select * from public.weigh_ins_dupe_backup_20260908;
--   insert into public.performance_tests select * from public.performance_tests_dupe_backup_20260908;
-- Once the result has been confirmed in the app, the backup tables can be dropped.

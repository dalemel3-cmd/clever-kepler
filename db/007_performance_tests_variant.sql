-- 007: test_variant on performance_tests - the same test_type can be measured under a
-- different protocol, and results from two protocols are not comparable. Two concrete
-- cases prompted this, both flagged by the coach before the roster grew further:
--
-- 1. Jump technique differs by team: some run vertical/board jump hands-on-hips, others
--    with a full arm swing - the arm swing adds meaningful height/distance on its own,
--    so mixing the two into one leaderboard or one athlete's trend line silently
--    compares two different tests.
-- 2. Fly 10 is "10yd build + 10yd fly" today but is expected to change distances in the
--    future. Tagging every row with the protocol it was actually run under means a
--    future distance change becomes a new variant value, not a silent redefinition of
--    every existing row's meaning.
--
-- Nullable and free text, same reasoning as test_type in db/006: a coach's next
-- protocol change should be a data value, not a migration.

alter table public.performance_tests add column if not exists test_variant text;

comment on column public.performance_tests.test_variant is
  'Protocol/technique this result was measured under, scoped within test_type. '
  'vertical_jump/board_jump: hands_on_hips | arm_swing. 10yd_fly: build10_fly10 (today''s '
  'only protocol, tagged now so a future distance change does not silently merge with it). '
  'Null means untagged/pre-tracking - excluded from variant-scoped rankings rather than '
  'guessed at.';

-- Backfill: every 10yd_fly row today was run under the same protocol.
update public.performance_tests
  set test_variant = 'build10_fly10'
  where test_type = '10yd_fly' and test_variant is null;

-- Backfill jump technique per the coach's current team assignments (2026-09-08).
-- Football and Volleyball run hands-on-hips; WSOC, WBB, and Baseball run full arm swing.
-- MBB, Softball, and Cheer & Dance were not covered by that instruction and are
-- deliberately left null rather than guessed - see docs/HANDOFF.md for the follow-up.
update public.performance_tests
  set test_variant = 'hands_on_hips'
  where test_type in ('vertical_jump', 'board_jump')
    and test_variant is null
    and sport in ('Football', 'Volleyball');

update public.performance_tests
  set test_variant = 'arm_swing'
  where test_type in ('vertical_jump', 'board_jump')
    and test_variant is null
    and sport in ('WSOC', 'WBB', 'Baseball');

analyze public.performance_tests;

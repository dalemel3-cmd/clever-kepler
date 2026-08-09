# Handoff — open items

Written 2026-08-07, last updated 2026-08-09 (v4.9.1). Everything below was established
during working sessions and exists nowhere else, so it's recorded here rather than
living in a chat log.

---

## 1. ⚠️ A database change is NOT in this repo

Two columns were added to `public.athletes` directly against the live Supabase
project. They are applied and working, but there is **no migration file** — if the
database is ever rebuilt from scratch, this has to be redone:

```sql
alter table public.athletes add column if not exists grade text;
alter table public.athletes add column if not exists created_at timestamptz default now();
```

**Why it mattered:** the app writes `grade` on every athlete create/update and
`created_at` on CSV roster import, but neither column existed. Postgres rejects the
*entire row* when a payload names an unknown column, so:

- CSV roster upload failed 100% of the time ("Failed to upload athletes to database")
- The Add Athlete form silently fell back to device-only storage — it showed success,
  the athlete appeared on that one iPad, and never reached the cloud
- Only the kiosk's auto-create path worked, because it sends just name + sport

This is the single most important lesson in this file, and it applies directly to the
RPE feature: **apply the migration before deploying code that writes new columns.**
See `docs/RPE-PLAN.md` §2.

---

## 2. 🔒 Row Level Security — auth is built, the switch is not thrown

**Status as of v4.9.1: the app side is done and working. The database is still open.**

Shipped and verified in production:
- Login screen, kiosk session persistence, sign-out (v4.8.0)
- Coach sign-up with approval gating — creating an account grants nothing until an
  approved coach approves it in Settings → Coach Access (v4.9.0)
- Sign-in confirmed working on phone and desktop against the real Supabase project

⚠️ **Still not done: the database is open.** RLS is disabled, no `coaches` table
exists, and the anon key in this repo grants full read/write to anyone who finds it.
The yellow banner in Settings → Coach Access is the app reporting this accurately.

Note the login screen is client-side and already live — a device that has not signed
in is gated regardless of RLS.

**To finish it, follow `docs/RLS-RUNBOOK.md`.** In short: create the user in Supabase,
sign in on each device while the database is still open, then run
`db/001_enable_rls.sql`.

**Decided: one shared coach login** for all devices and coaches. Trade-off recorded
in the runbook — offboarding means rotating the shared password, not deleting a user. Verification steps and the instant rollback
(`db/002_rollback_rls.sql`) are in the runbook.

The policy shape was verified against this database inside a rolled-back transaction:
`anon` sees 0 rows and cannot write; `authenticated` has full access.

Until that SQL is run, the anon key in this repo still grants full read/write to
anyone who finds it.

## 3. 📋 Most teams are still not in Supabase

As of writing: **53 athletes, all Football. 1,340 weigh-ins.**

The other sports you see in the app's pickers come from the configurable
`sportsList` setting — they appear whether or not a single athlete exists behind
them, which is why the roster can look fuller than it is.

Roster upload **works now** (that's what item 1 unblocked). To load the rest:
Settings → Cloud Data Management → **Template** → fill per team → **Upload CSV**.
Columns: `Athlete, Sport, Team, Grade, Position`.

Note the existing 53 athletes have a blank Grade — the column is new — so the Grade
filter stays empty until it's populated.

---

## 4. 🔀 The two repos have diverged

| Repo | State |
|---|---|
| **`dalemel3-cmd/clever-kepler`** | v4.9.1 — deployed by Vercel, **source of truth** |
| `dalemel3-cmd/MoneyMase` | v4.4.0 — same tests and docs, but missing the v4.6.0/v4.7.0 Alerts/Reports split and all of the v4.8.0–v4.9.1 auth work |

The gap has widened to five releases. Worth deciding whether MoneyMase catches up or
is retired as a mirror — keeping it half-synced is the worst of both. Right now,
**push app changes to clever-kepler** — that's what deploys.

---

## 5. Things that are already handled

Recorded so they don't get re-litigated:

- **Version bumping** — rules in `VERSIONING.md`. Small push = patch (`4.9.2`),
  large push = minor (`4.10.0`). Two files must match: `APP_VERSION` in
  `src/utils/athleteData.js` and `version` in `package.json`.
- **Auth** — `docs/RLS-RUNBOOK.md` is the sequence for finishing the lockdown;
  `db/003_coach_approval.sql` is the one to run (it supersedes `001`). Its policy
  behavior was verified against the live database in rolled-back transactions.
- **Tests** — `tests/` + `tests/README.md`. They intercept all Supabase traffic, so
  they never touch the real database. Run them before pushing anything non-trivial.
- **Settings** — as of v4.4.0 nothing is hardcoded; thresholds, windows, program
  identity, and the sports list are all live settings in `src/settings.js`.
- **Deploy verification** — the version badge (sidebar, header pill, mobile More
  menu). If it shows the old number after a deploy, the service worker is serving
  cache: close and reopen the app.

---

## 6. Next up

Two things, in this order:

1. **Finish the RLS lockdown** — `docs/RLS-RUNBOOK.md`. Sign in on the kiosk iPad
   first, then run `db/003_coach_approval.sql`. The BOOTSTRAP line at the bottom is
   already set to `masonm@shilohsaints.org`.
2. **Session RPE** — `docs/RPE-PLAN.md` (1–10 post-session rating), originally planned
   for v4.5.0 and now landing after the auth work. Read §2 of that doc before writing any code: RPE
rows carry no weight, which reintroduces a bug class that has already shipped twice
(sleep-only logs showed as `185 → 0 lbs` on the leaderboard; post-practice logs
false-flagged everyone as dehydrated). Phase 0 of that plan exists specifically to
prevent a third occurrence.

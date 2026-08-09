# Handoff — open items

Written 2026-08-07. Everything below was established during work on v4.1.5 → v4.4.0
and exists nowhere else, so it's recorded here rather than living in a chat log.

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

**Status as of v4.8.0: the app side is done and deployed. The database is still open.**

The login screen, kiosk session persistence, and sign-out all ship in v4.8.0, and the
app works exactly as before because RLS is still disabled. Nothing is enforced yet.

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
| **`dalemel3-cmd/clever-kepler`** | v4.7.0 — deployed by Vercel, **source of truth** |
| `dalemel3-cmd/MoneyMase` | v4.4.0 — has the same tests and docs, but not the v4.6.0/v4.7.0 Alerts/Reports split |

Worth deciding whether MoneyMase catches up or is retired as a mirror. Right now,
**push app changes to clever-kepler** — that's what deploys.

---

## 5. Things that are already handled

Recorded so they don't get re-litigated:

- **Version bumping** — rules in `VERSIONING.md`. Small push = patch (`4.7.1`),
  large push = minor (`4.8.0`). Two files must match: `APP_VERSION` in
  `src/utils/athleteData.js` and `version` in `package.json`.
- **Tests** — `tests/` + `tests/README.md`. They intercept all Supabase traffic, so
  they never touch the real database. Run them before pushing anything non-trivial.
- **Settings** — as of v4.4.0 nothing is hardcoded; thresholds, windows, program
  identity, and the sports list are all live settings in `src/settings.js`.
- **Deploy verification** — the version badge (sidebar, header pill, mobile More
  menu). If it shows the old number after a deploy, the service worker is serving
  cache: close and reopen the app.

---

## 6. Next up

`docs/RPE-PLAN.md` — Session RPE (1–10 post-session rating), planned for v4.5.0 but
now landing after the v4.7.0 work. Read §2 of that doc before writing any code: RPE
rows carry no weight, which reintroduces a bug class that has already shipped twice
(sleep-only logs showed as `185 → 0 lbs` on the leaderboard; post-practice logs
false-flagged everyone as dehydrated). Phase 0 of that plan exists specifically to
prevent a third occurrence.

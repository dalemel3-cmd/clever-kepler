# Handoff — open items

Written 2026-08-07, last updated 2026-08-10 (v4.11.2). Everything below was established
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

The lesson generalises: **apply the migration before deploying code that writes new
columns.** The Session RPE columns were added correctly ahead of the feature, so this
did not repeat.

---

## 2. 🔒 Row Level Security — DONE and verified

**Status as of v4.11.2: RLS is enabled and enforcing.** Earlier versions of this file
said otherwise; that is no longer true.

- `db/003_coach_approval.sql` has been run. `athletes`, `weigh_ins`, `coaches` and
  `alert_status` all have RLS on with policies requiring an approved coach.
- Login, kiosk session persistence, sign-out, and approval-gated sign-up are live.
- One shared coach login (`masonm@shilohsaints.org`) for all devices and coaches.
  Trade-off: offboarding means rotating the shared password, not deleting a user.

Verified against the live database by simulating each role:

| role | athletes | weigh_ins | alert_status | insert | self-approve |
|---|---|---|---|---|---|
| approved coach | 53 | 1340 | ✓ | OK | — |
| `anon` | 0 | 0 | 0 | denied | — |
| signed-in, unapproved | 0 | 0 | 0 | denied | 0 rows changed |

The anon key in this repo is therefore safe to be public — that is what it is designed
for, *given* RLS. If RLS is ever rolled back, the key becomes a full read/write
credential again.

Rollbacks: `db/002_rollback_rls.sql` (for 001/003), `db/004_rollback.sql` (for 004).

---

## 3. 🐛 Live defects found by auditing the running project (fixed in v4.10.2)

These could not be caught locally — the test suites intercept every Supabase call by
design, so they never exercise the real database. Found only by inspecting the live
project directly. **Re-audit after any schema change.**

- **`alert_status` was completely locked.** RLS on, *zero policies*, which denies
  everything. Every acknowledge/resolve a coach ever tapped failed at the database;
  `useAlertStatus` swallows the error and falls back to localStorage, so it looked
  like it worked while each device kept a private copy. The table held 0 rows.
- **Realtime had never fired.** The app subscribes to `postgres_changes` on three
  tables, but the `supabase_realtime` publication was empty, so no subscription ever
  delivered a row. Sync was carried entirely by the adaptive poll and the broadcast
  channel (which does not need the publication, and did work).
- **`weigh_ins.athlete_id` had no index**, despite every profile and per-athlete
  report filtering on it.
- **`rpe` CHECK was `1..10`** while `rpeScaleMax` is settable to 100 — raising the
  setting would have failed every save with nothing shown in the UI.

> **The root cause worth remembering:** Supabase installs an event trigger
> (`public.rls_auto_enable`) that turns RLS **on** for every new table in `public` at
> `CREATE TABLE` time. A new table is therefore *locked by default* until someone
> writes a policy for it. `alert_status` was created for the v4.6.0 Alerts rework and
> silently sat in that state. **Any new table needs a policy written in the same
> change that creates it.**

Applied as `db/004_fix_alert_status_realtime_and_indexes.sql`.

---

## 4. 📋 Most teams are still not in Supabase

As of writing: **53 athletes, all Football, all Varsity. 1,340 weigh-ins. 0 RPE logs.**

The other sports in the app's pickers come from the configurable `sportsList` setting —
they appear whether or not a single athlete exists behind them, which is why the roster
can look fuller than it is. This is the largest remaining gap between the app and the
program.

Roster upload **works now** (that's what item 1 unblocked). To load the rest:
Settings → Cloud Data Management → **Template** → fill per team → **Upload CSV**.
Columns: `Athlete, Sport, Team, Grade, Position`.

The existing 53 athletes have a blank Grade — the column is new — so the Grade filter
stays empty until it's populated.

---

## 5. 🎯 Session RPE — shipped, and its bug history

Built across v4.10.0–v4.11.2. Off by default; enable at
**Settings → SESSION RPE → toggle ON**. It then appears as a third kiosk entry mode, a
per-sport panel on the dashboard, and acute:chronic load alerts.

The plan's warning came true, so it's worth keeping in mind for the next feature: an
RPE row carries **no weight and no sleep**, and several screens treated "the athlete
has a row" as "the athlete weighed in". That produced an athlete with no weigh-ins
reading as 100% compliant, and RPE entries overwriting the same day's weigh-in with
weight 0. `isRpeLog` / `hasWeight` / `hasSleep` in `src/utils/athleteData.js` exist to
prevent a repeat — **use them in any new consumer of `reportData`.**

Two other traps from this feature, both now fixed but easy to reintroduce:

- **`rpe` is a `smallint`.** The kiosk accepted decimals, so 7.5 silently became 8.
  Entry is whole-number only.
- **Rates must count athletes, not rows.** An athlete rating a lift *and* a run files
  two rows; dividing rows by athletes read 60% where the truth was 40%, and would
  exceed 100% for a team that trained twice.

---

## 6. ✏️ EntryScreen.jsx has been corrupted once by an editor

`src/features/entry/EntryScreen.jsx` was committed at one point with every emoji
mangled through a CP437 round-trip — `⚖️` stored as `ΓÜû∩╕Å` and so on, rendering as
garbage on the live kiosk. Repaired in v4.10.1 by re-decoding rather than retyping.

Whatever editor or tool produced that write is not saving UTF-8. If mojibake reappears,
this is why. `tests/rpe-settings.js` now asserts the entry screen renders no CP437
mojibake, so a repeat should fail CI rather than reach a coach.

---

## 7. Things that are already handled

Recorded so they don't get re-litigated:

- **Repos are in sync.** `clever-kepler` is the **source of truth** — Vercel deploys
  from its `main`. `MoneyMase` is a mirror kept at the same version. Push app changes
  to clever-kepler.
- **Version bumping** — rules in `VERSIONING.md`. Small push = patch (`4.11.3`),
  large push = minor (`4.12.0`). Two files must match: `APP_VERSION` in
  `src/utils/athleteData.js` and `version` in `package.json`.
- **Tests** — `tests/` + `tests/README.md`. Nine suites: `stress`, `data-integrity`,
  `offline-recovery`, `sync-and-ux`, `settings-live`, `auth`, `rpe`, `rpe-settings`,
  `rpe-dashboard`. They intercept all Supabase traffic, so they never touch the real
  database — which is also why they cannot catch the class of defect in §3. Run them
  before pushing anything non-trivial.
- **Settings** — nothing is hardcoded; thresholds, windows, program identity, the
  sports list and all RPE tunables are live settings in `src/settings.js`. On/off
  switches persist on click; numeric and text fields need **Save All Settings**.
- **Deploy verification** — the version badge (sidebar, header pill, mobile More
  menu). If it shows the old number after a deploy, the service worker is serving
  cache: close and reopen the app.

---

## 8. Next up

1. **Turn on leaked-password protection** — Supabase dashboard → Authentication →
   Policies. Checks passwords against HaveIBeenPwned. Worth it for a shared login.
   This is the only outstanding item from the security audit.
2. **Load the remaining teams** (§4). Everything else is built and waiting on data —
   the per-sport dashboard panels will show one Football card until then.
3. **Use Session RPE with a real team** and see whether the defaults hold: the
   hard-session threshold (8), the load-spike A:C ratio (1.3), and the 4-week chronic
   window are all standard starting points, not tuned to this program.

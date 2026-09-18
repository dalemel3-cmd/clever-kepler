# Handoff — open items

Written 2026-08-07, last updated 2026-08-11 (v4.14.0, branch). Everything below was established
during working sessions and exists nowhere else, so it's recorded here rather than
living in a chat log.

---

## 1. ✅ The hand-applied athlete columns now have a migration file

Two columns were added to `public.athletes` directly against the live Supabase project
and existed nowhere in this repo, so a rebuilt database would have silently
reintroduced the worst bug this app has had. They are now captured in
**`db/005_athletes_grade_created_at.sql`**, verified to match the live schema:

```sql
alter table public.athletes add column if not exists grade text;
alter table public.athletes add column if not exists created_at timestamptz default now();
```

Both statements are idempotent, so the file is a no-op against the live project.

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

**Status as of v4.12.5: RLS is enabled and enforcing.** Earlier versions of this file
said otherwise; that is no longer true.

- `db/003_coach_approval.sql` has been run. `athletes`, `weigh_ins`, `coaches` and
  `alert_status` all have RLS on with policies requiring an approved coach.
- Login, kiosk session persistence, sign-out, and approval-gated sign-up are live.
- One shared coach login (`masonm@shilohsaints.org`) for all devices and coaches.
  Trade-off: offboarding means rotating the shared password, not deleting a user.

Verified against the live database by simulating each role:

| role | athletes | weigh_ins | alert_status | insert | self-approve |
|---|---|---|---|---|---|
| approved coach | 53* | 1340* | ✓ | OK | — |
| `anon` | 0 | 0 | 0 | denied | — |
| signed-in, unapproved | 0 | 0 | 0 | denied | 0 rows changed |

\* Row counts are from the v4.12.5 verification run. The roster has since grown to 182
athletes and 1,538 weigh-ins (§4) — the point of the table is the **shape** (coach sees
everything, anon and unapproved see nothing), which has not changed. Re-run the checks in
`docs/RLS-RUNBOOK.md` if the policies are ever touched.

The anon key in this repo is therefore safe to be public — that is what it is designed
for, *given* RLS. If RLS is ever rolled back, the key becomes a full read/write
credential again.

Rollbacks: `db/002_rollback_rls.sql` (for 001/003), `db/004_rollback.sql` (for 004).

`docs/RLS-RUNBOOK.md` is written in the future tense because it was a plan. It now
carries a banner saying so — it is kept as the rebuild procedure and as the record of
why the steps are ordered that way, not as a to-do list. Its verification checklist is
still worth running any time the policies change.

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

## 4. ✅ The other teams are loaded — as a side effect of the Plyomat import

**Resolved.** This section spent months reading "53 athletes, all Football, all Varsity"
and calling that the largest gap between the app and the program. The live roster is now
**182 athletes across 8 sports**:

| sport | athletes |
|---|---|
| Football | 51 |
| Baseball | 33 |
| WSOC | 25 |
| Volleyball | 23 |
| WBB | 20 |
| MBB | 18 |
| Softball | 11 |
| Cheer & Dance | 1 |

Nobody typed a roster CSV to get there. The Plyomat export (§15) named 181 people and
carried each one's team in its "Athlete Groups" column, so importing the jump data
created the missing athletes with their sport attached. The lesson worth keeping: **the
roster gap was never a data-entry problem, it was a data-source problem** — the roster
already existed, in a device nobody had connected to the app yet.

Grade is still mostly blank. The Plyomat groups carry a graduating class only for the
WSOC athletes (`Junior / WSOC`), so 5 athletes have one and the rest do not. Filling the
others still needs a CSV pass: Settings → Cloud Data Management → **Template** → fill per
team → **Upload CSV**. Columns: `Athlete, Sport, Team, Grade, Position`.

Also still true: `sportsList` in settings drives the sport pickers, so a sport appears
there whether or not anyone is on it.

---

## 5. 🎯 Session RPE — shipped, and its bug history

Built across v4.10.0–v4.11.2. Off by default; enable at **Settings → Program
Configuration → pick "SESSION RPE (INTERNAL LOAD)" from the dropdown → toggle ON**.
(Since v4.12.0 that card shows one field group at a time, so the RPE fields are not
visible until the section is selected — they are not missing.) It then appears as a third kiosk entry mode, a
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

## 7. ⚡ Quick Entry performance, and what was actually measured

v4.12.5 cut per-render work on the kiosk entry screen, reported as iPad sluggishness:

- Roster tiles are now `src/features/entry/AthleteCard.jsx`, wrapped in `React.memo`.
  Its props are **primitives on purpose** — passing the `athletesRecordedToday` Set
  would re-render every tile whenever any one athlete logged, because a Set is a new
  reference each time it is recomputed. `handleSelectAthleteForEntry` is `useCallback`'d
  in App.jsx for the same reason: a fresh function identity per render would change
  every card's props and defeat the memo entirely.
- `lastLoggedWeight` is memoized on `[selectedAthleteId, reportData]`. It previously
  filtered and sorted the whole weigh-in table on every keystroke in the modal.
- The weigh-in and add-athlete overlays no longer run a `backdrop-filter` blur. A
  full-surface blur makes the compositor re-blur everything behind it on every repaint,
  and those modals repaint per keystroke.

**Be honest about the evidence.** On desktop Chromium with 250 athletes and 2,000
weigh-ins the before/after timings were *within noise* (search 133ms → 96ms, weight
entry 68ms → 41ms, across runs varying by more than the difference). The changes are
justified by the work they remove, not by a benchmark this environment can show;
`backdrop-filter` is far more costly on iPad Safari than desktop Chromium, which is
where the problem was reported. **If the iPad is still slow, this was not the cause —
profile on the device before doing more of this.**

A testing trap worth remembering: the first blur probe only counted *full-viewport*
backdrop-filters and so matched nothing, passing against a build that still had the
blur. The overlay is `position: fixed` but sizes to the nearest transformed ancestor
(`animate-slide-up`), not the viewport. Any probe asserting an absence must be shown to
fail on the build that has the thing.

---

## 8. 👥 This repo has more than one author

The v4.12.0–v4.12.4 Weigh-In Status work (new `src/features/team-status/`, lbs-based
dehydration thresholds, the Settings config dropdown) landed on `main` from a separate
session while other work was in flight.

Practical consequences:

- **Fetch before starting, and rebase rather than force-push.** The one conflict was
  trivial to resolve by hand; a force-push would have destroyed five commits.
- **Re-run the full suite after a rebase, not just before.** The rebase silently broke
  `rpe-settings` — the Settings dropdown meant the RPE fields were no longer in the DOM
  by default. That looked like a regression and was not one, but only re-running caught
  it at all.

---

## 9. 📊 Analytics / reporting layer — charts and Speed & Power done (v4.14.2)

`src/features/analytics/AnalyticsScreen.jsx`, in the sidebar between Profiles and
Reports. Shipped across `feature/units-and-speed-power` (v4.13.0's chart work, plus
v4.14.0's tooltip fix and Speed & Power) and `feature/speed-power-adjustments`
(v4.14.2 - see below):

- Average body weight over 30/60/90 days, filterable by sport
- Daily logging compliance, and average sleep against the configured target
- Daily session load (RPE × minutes), shown only when RPE is enabled
- Leaderboards: weight gain and loss vs baseline, and highest training load
- **Speed & Power**: manual entry of 10yd fly, vertical jump, and board jump results,
  with best-result leaderboards per test type. Off by default behind
  `settings.enableSpeedPower`, same pattern as RPE - toggle it at Settings → Program
  Configuration → SPEED & POWER.

**v4.14.2 changes to Speed & Power, from live coach feedback:**
- **Removed "Laser Time"** as a test type - not a test this program actually runs.
- **Added Vertical Jump and Board Jump** (unit: inches). Each test type now carries a
  `better: 'asc' | 'desc'` direction - lower is best for a sprint time, higher is best
  for a jump. The leaderboard reduction respects this per type; getting it backwards
  would rank an athlete's worst jump as their personal best, so this is covered by a
  dedicated Playwright probe (`tests/speed-power.js`, probe `[F]`) rather than trusted
  by inspection.
- **Leaderboards show everyone, not just the top 8.** Each board still opens collapsed
  to the top 8 (avoids a wall of rows for a full roster on first glance), with a "Show
  all N (M more)" toggle per board. Covered by probe `[G]`, which fixtures 10 athletes
  and asserts the 9th is hidden until expanded.
- 10yd Fly is unchanged.

**✅ Plyomat CSV import is built (v4.16.0).** The sample export arrived and unblocked it —
see §15 for what the real file turned out to contain, which was considerably messier than
"a CSV of jump heights". `performance_tests.source` distinguishes `'manual'` from
`'plyomat'` rows as designed.

Schema decision made and applied: test results live in `public.performance_tests`
(`db/006_performance_tests.sql`), not more columns on `weigh_ins`. Test results are a
different shape — sparse, tied to test days rather than daily, several metrics per
session — and bolting them onto `weigh_ins` would have created a second null-heavy row
class; §5 is a complete account of the damage the first one did.

Its own hook (`usePerformanceTests`, same shape as `useAlertStatus`) rather than folded
into `fetchReportData` — that pipeline is heavily tested and tuned around `weigh_ins`
specifically, and this is a side panel, not something every screen needs.

The RLS policy was written in the same migration that created the table (§3's rule) and
verified against the live database by simulating `anon`: 0 rows read, insert denied.

**Build it on a Vercel branch preview, not production.** Push the work to a branch;
Vercel gives that branch its own preview URL, which can be opened on the iPad and shown
to staff without touching what the coaches use daily. Merge to `main` only once it is
verified. `main` auto-deploys to production, so anything landing there is live
immediately.

---

## 10. ✅ The iPad perf fixes are confirmed working on the actual device

**Closed out.** The coach confirmed on the physical iPad that the kiosk works well
after v4.12.6. The open verification item this section used to track is done - no
further blur removal or windowing work is needed unless new choppiness is reported.

### History (kept for context)

The three fixes in §7 came from a diagnosis that explicitly recommended pushing them to
a branch for an iPad preview first. They were pushed straight to `main` instead, landing
in production as v4.12.5 — nothing was harmed (all suites passed, the changes only
removed work) but the intended verify-on-device-first step was skipped at the time.

**The rest of that diagnosis shipped in v4.12.6** and is now confirmed working, above. It
counted eleven `backdrop-filter` surfaces: two in EntryScreen (removed in v4.12.5) and
nine in App.jsx. Six of those nine cover the viewport and are now removed too — the
recovery modal, the More / analytics modal, the install modal, the confirm dialog, the
expired-baselines drill-down, and the coach manual-entry modal. That last one is the
one that actually mattered: it was the only remaining full-screen overlay holding text
inputs, so it repainted per keystroke exactly like the two already fixed.

Three surfaces keep their blur deliberately — the two toast chips and the
pull-to-refresh pill. Blur cost scales with the area being blurred, these are a few
hundred pixels each, they are on screen briefly, and none sits behind a text input.

v4.12.6 was built on the `perf/app-backdrop-blur` branch and previewed there before
being merged to `main`, which is the workflow this section exists to argue for.

**It is now in production.** Eight of the original eleven blur surfaces are gone; the
three that remain (two toast chips, the pull-to-refresh pill) are kept on purpose.

If the iPad still feels choppy after this, stop removing blur. It was a hypothesis, and
having taken every surface that plausibly mattered without a measured win, the
bottleneck is somewhere else — most likely the number of tiles the 70vh roster grid
holds in the DOM at once, which needs windowing rather than memoization or paint
tweaks. Profile on the device before writing more code.

---

## 11. 🔑 There is no password recovery, and the login is shared

`src/auth/LoginScreen.jsx` calls `signInWithPassword` and `signUp` and nothing else.
There is no "Forgot password" link anywhere in the app, and nothing in `src/auth/`
references `resetPasswordForEmail`.

The only way to recover a forgotten password today is **Supabase Dashboard →
Authentication → Users → the account → reset or send recovery**, which only the project
owner can reach.

That combination is the problem. The login is deliberately shared across every coach and
the weight-room kiosk (§2), so a lockout is not one person's inconvenience — it is
everybody, including the kiosk, with a single person able to fix it. This already
happened once during a working session; it was resolved in minutes only because the
owner was at a keyboard. During a session, with athletes waiting, it would not be.

Two ways out, in increasing order of effort:

1. **Add a "Forgot password" link** — one `supabase.auth.resetPasswordForEmail` call plus
   a small reset screen. Supabase sends the mail; no new infrastructure. Note the
   recovery link goes to the address on the shared account, so whoever holds that inbox
   is still the bottleneck — better, but not fully solved.
2. **Move off a single shared credential** to per-coach accounts. The RLS policies already
   support this unchanged — approval gating is per user (§2), so this is adding users,
   not rewriting authorization. It also restores the ability to offboard one person
   without rotating everyone's password.

Related and separate: **leaked-password protection is still off** in the Supabase
dashboard (Authentication → Policies). For a shared, rarely-rotated credential that
check is worth more than usual.

---

## 12. 🐛 A shared component silently mislabeled two Analytics charts

`CustomTooltip` (`src/components/CustomTooltip.jsx`) was written for exactly one caller
- ProfilesScreen's weight chart - and hardcoded the unit as a string match: `name ===
'Weight' ? 'lbs' : 'hrs'`. When Analytics reused the same component with series named
`'Avg Weight'` and `'Compliance'`, neither matched, so both silently fell into the
`'hrs'` branch: a weight trend in lbs suffixed hrs, a percentage suffixed hrs. Fixed in
v4.14.0 by making the tooltip take an explicit `units` map from its caller instead of
guessing from the series name.

**The general lesson: a shared component that special-cases one caller's exact prop
values is a trap for the next caller, not a convenience for this one.** It compiles,
renders, and looks fine - the wrongness only shows up in the label text, which is easy
not to read closely. Worth an eye toward `CustomTooltip`'s siblings (`CustomTooltip` is
now the second component group in this codebase - after the `isRpeLog`/`hasWeight`
predicates in §5 - to have needed a "define the contract explicitly, don't infer it from
one caller's shape" fix) if anything else gets reused across screens.

---

## 13. 📱 Screen metric changes from coach feedback (v4.15.0)

Three changes, all requested directly by the coach after using v4.14.x:

- **Dashboard — Session Accountability Tracker is now collapsible**, closed by default.
  It was a full-width per-sport grid permanently occupying the bottom of the dashboard;
  the "N of M ROSTER CHECKED IN" badge in its header already answers the question most
  of the time, so the sport-by-sport detail is one click away instead of always on.
- **Profiles — roster cards now show four metrics** instead of "Current Mass" and
  "Total Records": Current Weight (with lbs up/down vs the previous weigh-in), Best
  Vertical, Best Fly 10 (with a % trend), and Best Broad Jump. Session count was
  dropped; it was the least actionable number on the card.
- **Teams & Rosters — Avg RPE and Avg Sleep added** next to Athletes and Avg Lb. This
  was the coach's own reasoning: some teams don't track body weight at all, and those
  cards previously showed a permanent `--` with nothing else to look at. Avg RPE only
  renders when `settings.enableRpe` is on, matching how RPE is gated everywhere else.

**Fly 10's trend compares the two most recent attempts, not the two best.** The tile
shows the personal best, but the arrow next to it answers "is this athlete getting
faster right now" — the same framing as the weight tile above it. A "best vs previous
best" reading would only ever move when a PB is broken, which is not what a coach
scanning a roster is asking.

### The bug this shipped with, and the lesson

`usePerformanceTests` was originally called *inside* `SpeedPowerPanel`. Profiles needed
the same rows, so the hook was lifted to `App.jsx` and threaded down as props — which
avoids two realtime subscriptions to one table, and matches how `useAlertStatus` has
always been wired.

The lift was done in three places and **the App.jsx → AnalyticsScreen call site was
missed.** `performanceTests` arrived `undefined`, `for (const t of performanceTests)`
threw inside the boards reduce, and the error boundary blanked *the entire Analytics
screen* — every chart, every leaderboard — over one side panel's missing prop. It built
clean and linted clean; only `tests/select-visibility.js` and `tests/speed-power.js`
caught it, both by failing to find any `<option>` on a screen that no longer rendered.

Two things came out of it, both in the code now:

1. `SpeedPowerPanel` defaults `performanceTests = []`. A side panel missing a prop
   should degrade to an empty board, never take the screen down with it.
2. **When lifting a hook out of a component, the prop has to be added at every call
   site on the path, and adding it to the receiving component's signature is the half
   that looks finished.** The signature change is what makes it *compile*; the call
   site is what makes it *work*. Grep the JSX for the component name, not just the
   prop.

---

## 14. Things that are already handled

Recorded so they don't get re-litigated:

- **Repos are in sync.** `clever-kepler` is the **source of truth** — Vercel deploys
  from its `main`. `MoneyMase` is a mirror kept at the same version. Push app changes
  to clever-kepler.
- **Version bumping** — rules in `VERSIONING.md`. Small push = patch (`4.12.6`),
  large push = minor (`4.13.0`). Two files must match: `APP_VERSION` in
  `src/utils/athleteData.js` and `version` in `package.json`.
- **Tests** — `tests/` + `tests/README.md`. Twenty suites: `analytics`,
  `athlete-comparison`, `auth`, `dashboard-profile-team`, `data-integrity`, `edit-log`,
  `entry-perf`, `offline-recovery`, `plyomat-import`, `plyomat-ui`,
  `profile-speed-power-rankings`, `rpe`, `rpe-dashboard`, `rpe-settings`,
  `select-visibility`, `settings-live`, `speed-power`, `stress`, `sync-and-ux`,
  `tooltip-units`. A full pass takes ~10 minutes, almost all of it deliberate waiting —
  the offline-queue and heartbeat probes only catch what they catch after real elapsed
  time.
  They intercept all Supabase traffic, so they never touch the real
  database — which is also why they cannot catch the class of defect in §3. Run them
  before pushing anything non-trivial.
- **Settings** — nothing is hardcoded; thresholds, windows, program identity, the
  sports list and all RPE tunables are live settings in `src/settings.js`. On/off
  switches persist on click; numeric and text fields need **Save All Settings**.
- **Deploy verification** — the version badge (sidebar, header pill, mobile More
  menu). If it shows the old number after a deploy, the service worker is serving
  cache: close and reopen the app.

---

## 15. 📥 Plyomat CSV import — built, and what the real export actually contained

`src/features/analytics/plyomatImport.js` (pure logic, unit-tested by
`tests/plyomat-import.js`) and `PlyomatImportPanel.jsx` (the UI, browser-tested by
`tests/plyomat-ui.js`). It sits under Speed & Power on Analytics, behind the same
`enableSpeedPower` flag.

**It works in two steps on purpose: pick a file to get a PLAN, confirm to write.** The
first sample export was 569 rows, of which only 273 matched the roster. An importer that
just wrote what matched would have reported success while discarding over half the file —
§1's silent-rejection failure, at scale. So the preview states, before anything is saved:
how many rows will import, which athletes will be created, which rows will not import and
why.

### What the sample file taught us (all of it handled, all of it tested)

- **UTF-8 BOM** on the first header, and the local timestamp is quoted with a comma
  inside it (`"9/1/26, 3:25 PM"`). A `split(',')` corrupts every row from that column on,
  so the module carries a real (small) CSV reader.
- **Values have their units glued on**: `25.31 in`, `127.7 ft·lb`, bare `2.34` for RSI.
- **Names are split First/Last and are not reliably in that order** — "Copp Sarah",
  "Dodson Alexia" are transposed. Matching tries reversed before giving up.
- **Casing is inconsistent by team**: Football is ALL CAPS, everyone else Title Case.
  All matching is case-insensitive.
- **"Athlete Groups" mixes sport, graduating class and org buckets**, slash-separated:
  `Football SH`, `Junior / WSOC`, `Freshmen / Volleyball SH / WSOC`, `Coaches`. It is
  parsed into sport + grade, which is a bonus: it populates the `grade` column that §4
  wanted filled and that was empty for all 76 athletes.
- **Not every row is an athlete.** `Coaches` rows are excluded.
- **Not every metric has a home here.** Only `Jump Height` maps to a test type
  (`vertical_jump`). `PPS` (ft·lb) and `RSI` (unitless) are reported as unsupported
  rather than coerced onto an inches leaderboard where they would be nonsense.
- **`Session ID` is a per-capture UUID**, stored as `notes = "plyomat:<id>"`. Re-importing
  the same export is therefore a no-op rather than doubling everyone's results — which
  matters, because the obvious way to use this is to re-upload a file that grew.

### The name-matching bug, and why the middle band exists

Fuzzy matching started as a greedy longest-common-subsequence ratio. It scored the
roster's `Charlorte Velazquez` against Plyomat's `Charlotte Velazquez` — one transposed
pair — **below 0.8**, so the importer would have created a second athlete record for
somebody already on the roster. Levenshtein scores it 0.95. A duplicate athlete is not
cosmetic: their history splits across two ids and neither is right afterwards.

Three bands, and the middle one is the point:

| similarity | behaviour |
|---|---|
| ≥ 0.90 | auto-linked — only spelling slips live here (`Oliva`/`Olivia`, `Brooklyn`/`Brooklynn`) |
| 0.70–0.90 | **held for a human decision**, imported under neither reading |
| < 0.70 | treated as a new person |

That middle band is not indecision, it is the only honest answer. In the real file it
caught `EllaKate Coleman` ~ `Ealla Kate Coleman` (0.89, the same person) **and**
`Rylee Bodenstein` / `Katy Bodenstein` ~ `JAKE BODENSTEIN` (0.75/0.80, siblings — three
different people) **and** `Clark McDonnel` ~ `CONNOR CLARK` (0.71, unrelated). Any rule
that auto-resolved that band would have filed one athlete's jumps under another's name.
Anything left undecided does not import: a missing row beats a row on the wrong athlete.

### The first real import (done, 2026-09-03)

The September export was imported to the live database. Final state: **182 athletes,
558 Plyomat results, 558 distinct session ids, 0 orphan rows, 0 duplicate names.** The
22 pre-existing manual results were untouched.

Four roster names were corrected in Supabase first, because Plyomat had them right and
the roster had them wrong: `Brooklyn`→`Brooklynn Henry`, `Charlorte`→`Charlotte
Velazquez`, `Ealla Kate`→`EllaKate Coleman`, `Oliva`→`Olivia Wilson`. All four had zero
weigh-ins, so nothing was at risk. **That fix alone took the import from 546 to 549 rows
and dropped the fuzzy-matched rows from 8 to 0** — worth doing before any future import,
because a name the roster spells wrong is a name every import has to guess at.

The four ambiguous names were resolved by the coach, and the answers are the reason that
review band exists — they did not go the same way:

| Plyomat name | decision | outcome |
|---|---|---|
| `Tibbs Abbygail` | same person as `Abby Tibbs` | 2 jumps merged onto her record |
| `Rylee Bodenstein` | different (Softball) | new athlete, 4 jumps |
| `Katy Bodenstein` | different (WBB) | new athlete, 2 jumps |
| `Clark McDonnel` | different (Baseball) | new athlete, 1 jump |

Three of the four were **not** the person they resembled. Note the sports: Jake
Bodenstein is Football, Rylee is Softball, Katy is WBB — the group column was the tell
that these were siblings rather than one athlete. An auto-merge on surname similarity
would have filed three people's jumps under one name.

`Schisler Hailey` was created with her name transposed, since Plyomat exported it that
way and there was no roster entry to flip it against. Corrected to `Hailey Schisler`
afterwards. Her sister Eden appears in the same file with the surname in the right
field, which is the signal a future version could use to catch this automatically.

### Known limits

- `athletes.sport` is single-valued, so a multi-sport group takes the **first** sport
  listed. The preview shows the full original group string so the collapse is visible.
- Matching is by name. There is no stable athlete id shared between Plyomat and this app,
  so a renamed athlete looks like a new one.
- Body weight (`Body Weight at Capture`) was populated on only 5 of 569 rows and is not
  imported; weigh-ins have their own pipeline and their own null-row hazards (§5).

---

## 16. 📈 Athlete comparison — plot Speed & Power results over time (v4.17.0)

`src/features/analytics/AthleteComparisonPanel.jsx`, reached via a **Compare** toggle
next to **Overview** at the top of Analytics (`AnalyticsScreen.jsx`'s `view` state).
Behind `settings.enableSpeedPower`, same gating as the rest of Speed & Power - off shows
the same "NOT ENABLED, here's where to turn it on" card the leaderboards use, not a
blank screen.

Pick a test type (10yd Fly / Vertical Jump / Board Jump) and up to 6 athletes; every
logged attempt for each is plotted on one line chart, plus a best/latest/trend summary
card per athlete underneath. Two decisions worth recording:

- **Every real attempt is plotted, not a bucketed average.** The dashboard's weight
  trend buckets by calendar day because weigh-ins are roughly daily; Speed & Power tests
  have no fixed cadence; averaging them into day-buckets would either sit mostly empty
  or blend two unrelated test sessions together. Two athletes tested on the same day do
  share one chart point (so the tooltip reads as "this day, these results"); the same
  athlete's attempts on different days never merge.
- **Capped at 6 athletes**, enforced in the selection state itself (not just the
  disabled checkbox) - a chart with more than 6 lines stops answering "who's ahead" and
  starts being decoration. `tests/athlete-comparison.js` proves the cap holds even when
  every roster row is clicked.

The trend arrow on each summary card compares an athlete's **two most recent attempts**,
not their two personal bests - same reasoning as Profiles' Fly 10 trend (§13): it
answers "is this person trending up right now," which only moves on a broken record if
scored the other way.

`TEST_TYPES` / `TEST_TYPE_BY_KEY` / `formatMetric` are imported from `SpeedPowerPanel.jsx`
rather than redefined, so a comparison always agrees with the leaderboard on units and
which direction counts as "better" for a given test.

---

## 17. 🏆 Leaderboard trend badges + per-athlete rankings on Profiles (v4.17.0)

Two more Speed & Power additions, both from the same coach feedback pass as §16.

**Leaderboard rows now show a red/green % trend badge** next to the PB
(`SpeedPowerPanel.jsx`). Same principle as the comparison panel's trend: it compares an
athlete's **two most recent attempts**, not two personal bests, so the badge moves every
testing session instead of only on a new record. The number displayed is still the PB -
only the badge is session-to-session. Arrow direction follows the raw number (down =
the value went down); color follows whether that direction is actually an improvement -
a faster (lower) fly time is a green down-arrow, a shorter (lower) jump is a red
down-arrow. Getting the color right independent of the arrow direction is the same
`better: 'asc'|'desc'` rule the leaderboard sort already uses.

**An athlete's profile page now has its own Speed & Power section**
(`ProfilesScreen.jsx`, gated on `settings.enableSpeedPower`), showing their PB per test
type plus two rankings: overall (against every athlete on the roster who has a result
for that test) and within their own sport. A percentile bar visualizes the overall
ranking, and a callout names the **weakest-ranked** attempted test as the focus area -
not the lowest raw number, since a 15in vertical and a 1.4s fly time aren't comparable on
their own terms, only their percentile standing is.

Both rankings and the leaderboards share `bestTestFor` (Profiles) and the boards reducer
(SpeedPowerPanel) - same reduction, so a rank surfaced on a profile always agrees with
where that athlete would land on the Analytics leaderboard for the same test.

Gender-based ranking was scoped out for this pass: `athletes` has no gender column
today, and adding one is a small migration best done deliberately (with the same
same-migration-as-the-table-write RLS discipline as §3) rather than folded into a UI
change. Sport ranking ships now; gender ranking is a follow-up if the field gets added.

---

## 18. 📝 Backdated entry, per-entry edit/delete, and a Profiles pass (still v4.17.0)

Same release as §16/§17, from a second round of coach feedback before the branch
merged - the trend/ranking work surfaced two gaps: no way to log a result for a day
that already happened, and no way to fix a mis-entered one without deleting and
starting over.

**The Analytics log form now has a Test Date field** (`SpeedPowerPanel.jsx`), defaulting
to today but editable to any past date, capped at today (`max={getCentralDateString()}`)
so a result can't accidentally land in the future. Saved with `centralWallTimeToISO(date,
'12:00')`, the same noon-on-that-day convention EntryScreen uses for a date-only log -
there's no real time-of-day for a test session, so an arbitrary time inside the chosen
day avoids a timezone rollover pushing it onto the wrong calendar date.

**Every performance_tests row can now be edited or deleted in place**
(`usePerformanceTests.updateTest` / `.deleteTest`, both optimistic - a failed delete
puts the row back rather than leaving the UI showing a delete that didn't happen). The
RLS policy from `db/006` (`for all`, not just insert/select) already covered UPDATE and
DELETE, so no migration was needed. The edit/delete controls live on the athlete's
Profiles page rather than the Analytics leaderboard, next to a new **per-test-type
history list** - every attempt for that athlete, not just the PB, so "did they go up or
down" is answered by the real numbers rather than only the current trend arrow. The PB
attempt is starred so it's clear which row the headline number above the list refers to.

**Profiles page reordering and cleanup**, all from explicit coach direction rather than
inference:
- The Speed & Power section now sits directly under the name card, ahead of the body
  weight and sleep trend charts - it's what gets checked first.
- The name card itself dropped the "ATHLETE BIOMETRIC DOSSIER" eyebrow and the
  tracking-mode badge; the subtitle is now just Sport · the program's org name. The KPI
  mini-grid (current mass, sleep, recovery score, RPE cards) stayed where it was, inside
  the same card - only the header text was asked to be cleaned up.
- The Average Sleep KPI card gained a trend line (last night vs. the night before,
  ▲/▼ in hours), matching the framing the Current Body Mass card already had (vs.
  baseline). The ask was "be sure we're showing increases or decreases on all metrics" -
  weight already had one, sleep didn't.

`tests/profile-speed-power-rankings.js` grew to 29 probes covering the history list,
edit (asserts the actual PATCH body), delete (asserts nothing fires before the confirm
modal is answered), section order, the cleaned-up name card, and the sleep trend.
`tests/speed-power.js` gained a backdated-entry probe. **Both suites correctly failed
against the pre-fix build** - notably by timing out waiting for `getByLabel('Test
Date')` and `getByRole('button', { name: /History/i })`, which don't exist without this
change, not by producing a wrong answer. One real bug caught this way, worth recording:
the new `AthleteSpeedPowerCard` component used `React.useState` without `React` ever
being imported in `ProfilesScreen.jsx` (the file only imports named icons, no default
React import) - it built and linted clean, then threw `ReferenceError: React is not
defined` on the client and put the athlete's entire profile behind the app's error
boundary. Fixed by importing `useState` from `'react'` directly instead of reaching
through a `React` namespace that was never in scope.

---

## 19. Versioning rollover, Analytics/Reports/Profiles polish, Team Entry (v4.18.0)

Six pieces of coach feedback in one release, none touching the data model:

1. **Versioning stops climbing forever.** `VERSIONING.md`'s minor number now rolls
   over into a major bump at `20` (`4.19.0` → `5.0.0`), a mechanical rule rather than a
   judgment call, so the second number doesn't run to `47` a year from now.
2. **Analytics 60/90-day windows now show real history.** `reportData` is normally
   fetched only `dataWindowDays` back (30 by default) - picking 60 or 90 Days on
   Analytics used to render trend buckets for days the app never loaded, which read as
   every athlete's data sliding forward with nothing behind it. `AnalyticsScreen` now
   calls a new `ensureReportWindow(days)` (`App.jsx`) whenever the range changes; it
   widens the fetch (`extraReportWindowDays`, `Math.max`'d against the dataWindowDays
   setting) for the rest of the session rather than changing the setting itself.
3. **Speed & Power profile cards show best *and* most recent**, not best alone -
   `AthleteSpeedPowerCard` now prints the PB and, on its own line, the latest attempt
   (labeled "Also their most recent" when the two are the same row) with the trend
   arrow next to it.
4. **Reports labels its time bases.** The dehydration/mass-drop section now says its
   numbers are measured from each athlete's baseline date, not week-to-week. The
   weight leaderboard is now *actually* week-to-week rather than season-long - it used
   to diff an athlete's very first logged weight against their latest, so "Top Weight
   Gains" on a team that had been logging for months read as their total off-season
   change, not their most recent week. It now diffs the latest weigh-in against the
   most recent one 7+ days before it, and the section headers say so.
5. **Daily Logging Compliance and Average Sleep collapse by default** on Analytics,
   each with its rolled-up number in the collapsed header (e.g. "DAILY LOGGING
   COMPLIANCE · 82%") so the summary is still visible without expanding.
6. **Team Entry mode for Sprint & Jump testing.** `SpeedPowerPanel` now has a
   SINGLE ENTRY / TEAM ENTRY toggle. Team Entry picks one test type and one date for
   the whole roster, then shows one small input per athlete and a single "Save All"
   button - built because a real testing day is "everyone ran a fly 10 today," not
   re-picking the athlete, type, and date one result at a time. Only rows with a
   filled-in value submit (via `Promise.all` over `addTest`); on partial failure the
   failed rows stay filled in so nothing silently vanishes, and successfully-saved
   rows clear so the sheet shows what's left to finish.

No schema changes. Existing regression suites were re-run against the build; new
dedicated probes for these six items are still owed (see §20).

---

## 20. Test protocol/technique tracking - test_variant (v4.19.0)

Raised before the roster grew further: some teams run vertical/board jump hands-on-hips,
others with a full arm swing, and the two aren't the same test - the arm swing adds real
height/distance on its own. Fly 10 is "10yd build + 10yd fly" today but is expected to
change distances later. Both needed a way to tag *which protocol* a result was measured
under, so two protocols never get silently averaged into one leaderboard, one PB, or one
athlete's trend line.

**Schema** (`db/007_performance_tests_variant.sql`): a nullable `test_variant` text
column on `performance_tests`, same "text, not an enum" reasoning as `test_type` in
db/006 - a new protocol should be a data value, not a migration. Backfilled against the
real table:
- Every existing `10yd_fly` row → `build10_fly10` (today's only protocol, tagged now so
  a future distance change becomes a new variant rather than a silent redefinition).
- `vertical_jump`/`board_jump` rows for **Football** and **Volleyball** →
  `hands_on_hips`; for **WSOC**, **WBB**, and **Baseball** → `arm_swing` (the coach's
  team assignments as of 2026-09-08).
- **78 rows** for MBB, Softball, and Cheer & Dance were **not** covered by that
  instruction and were deliberately left `null` rather than guessed at - same review-
  don't-guess discipline as the Plyomat name-matching queue (§4). These need the coach to
  say what technique those teams actually used; until then they render as "Untagged
  (pre-tracking)" everywhere rather than silently joining either technique's numbers.

**Where the variant lives in code**: pulled out of `SpeedPowerPanel.jsx` into a new pure-
data module, `src/features/analytics/testVariants.js` (`TEST_TYPES`, `JUMP_VARIANTS`,
`FLY_VARIANTS`, `VARIANT_LABEL`, `UNTAGGED_VARIANT_LABEL`, `TEAM_VARIANT_DEFAULTS`,
`formatMetric`) - `plyomatImport.js` is deliberately React-free (its own header says so),
so it imports these directly rather than reaching into a component file.
`SpeedPowerPanel.jsx` re-exports them so every existing `from './SpeedPowerPanel'` import
elsewhere kept working untouched.

**Everywhere a jump/Fly-10 result is ranked, compared, or displayed now scopes by
`test_type` + `test_variant`** (untagged rows bucket under the key `'untagged'`, never
silently merged into a real variant):
- **SpeedPowerPanel leaderboards**: one board per test type *per variant actually present
  in the data* - e.g. "Vertical Jump — Hands on Hips" and "Vertical Jump — Arm Swing" as
  separate boards, each with its own ranking and latest-vs-previous trend. A variant with
  no data doesn't render an empty board.
- **Profiles' `AthleteSpeedPowerCard`**: one card per test type *per variant that
  athlete has actually attempted* - an athlete tested under both techniques (a technique
  change mid-season) gets two Vertical Jump cards, not one number mixing both.
- **AthleteComparisonPanel**: a technique picker appears next to the test-type picker for
  any test type with more than one variant; the chart and the empty state require a pick
  before plotting anything, rather than defaulting to "all techniques."
- **Entry forms** (`SpeedPowerPanel`, both Single and Team Entry): a Technique field
  appears for jump types only (Fly 10 tags its one value silently, no picker shown).
  Defaults from `TEAM_VARIANT_DEFAULTS[athlete.sport]` once an athlete/sport is known -
  still overridable, and required (submit is disabled) when it can't be defaulted, e.g.
  Team Entry filtered to "ALL" sports at once, which have no single team default.
- **Plyomat importer**: every imported jump/Fly-10 row is tagged the same way a manual
  entry would be, via the same `TEAM_VARIANT_DEFAULTS` lookup.

Roster-card "Best Vertical / Best Fly 10 / Best Board Jump" quick-glance stats
(`ProfilesScreen`'s list view, not the detail page) were deliberately left unscoped by
variant - they're a single number per athlete already, and threading a technique picker
into a compact roster row wasn't worth it for what is explicitly a "quick glance," not a
cross-athlete comparison. `bestTestFor`/`rankAthleteForTest` both take an optional
`variantKey` (default `null` = no filtering) so that one remaining unscoped call site is
an explicit choice, not an oversight.

**Fixing a jump's technique after the fact**: the per-entry edit control on an athlete's
Profiles page (§18) now includes a Technique field for any jump result, alongside the
existing date/value fields - a coach can correct a mis-tagged or untagged attempt without
deleting and re-entering it. Same "don't guess" rule as new entry: SAVE stays disabled
until a technique is picked for a multi-variant test type. `tests/profile-speed-power-
rankings.js` grew two probes for this (§G now also asserts the PATCH carries
`test_variant`; new §G2 covers the disabled-until-picked state) - both correctly failed
against the pre-fix build, timing out waiting for `getByLabel('Technique')`, which didn't
exist yet.

---

## 21. Math and data-integrity audit (v4.20.0)

A deliberate sweep of every arithmetic site and the live table contents, rather than a
feature. Seven code defects and three data problems; the two most serious were both
regressions shipped in the two releases immediately before this one, which is the useful
lesson here — **both passed their own tests, because the tests asserted the behaviour the
code already had rather than the behaviour the feature promised.**

### Code

1. **`test_variant` never reached the database on manual entry** (v4.19.0 regression,
   live in production). `usePerformanceTests.addTest` builds its insert by naming columns
   explicitly, and the new column wasn't added to that list. The optimistic local row got
   the technique (it spreads `rec`), so the UI showed the entry saved correctly and it
   came back **untagged after any reload** — the whole v4.19.0 feature was half-working
   for every hand-logged jump. The Plyomat importer was unaffected: it spreads the row, so
   it never lost the field. `tests/speed-power.js` now asserts the value on the wire; the
   pre-fix build reports `test_variant=undefined` in the POST body.
2. **The change-probe counted a narrower window than the fetch** (v4.18.0 regression,
   live). `ensureReportWindow` widened `fetchReportData` to 60/90 days but
   `probeCloudForChanges` still counted `dataWindowDays`, so once a coach opened a 60- or
   90-day range the probe's count could never match the fingerprint from the last full
   fetch. Result: a **full table pull on every heartbeat for the rest of the session**,
   with `pollIdleStreak` never backing off — silently undoing the adaptive-sync egress
   work. Both now go through one `effectiveWindowDays()`.
3. **The acute:chronic ratio existed twice and the copies disagreed.** Alerts and the
   athlete profile card each had their own implementation. The profile's (a) always
   multiplied by `session_minutes`, so with `rpeTrackDuration` off every load came out 0
   and the card showed `--` while Alerts reported a real spike; and (b) divided by the
   full 4-week window instead of the weeks the athlete had actually trained — the exact
   "first week looks like a 4x spike" bug Alerts had already fixed. An athlete two weeks
   into the season read up to **2x higher on their profile than on Alerts**. Now one
   `computeAcuteChronicLoad` in `athleteData.js`, used by both.
4. **The A:C ratio was inflated ~10% for everyone** — found by writing the unit test, not
   by reading the code. The acute window used an inclusive `<= 7 days` boundary, so a
   once-daily athlete had *eight* sessions in a "7-day" numerator while the denominator
   was still whole weeks. Perfectly steady training read **1.10 instead of 1.00**, which
   moved the effective spike threshold from the configured 1.3 down to about 1.18. Fixed
   to a half-open window plus an inclusive day count for `weeksOfHistory`.
   `tests/acwr-math.js` (20 probes) pins this down as pure arithmetic — no browser.
5. **The comparison chart silently dropped renamed athletes.** `AthleteComparisonPanel`
   keyed its chart series on `performance_tests.athlete_name` (denormalized at write
   time) while the `<Line>` used the current roster name. The four athletes renamed during
   the Plyomat import (§4) therefore had their attempts **vanish from the chart while
   still counting in the summary card directly underneath it** — no error, just two
   readouts disagreeing. Series are keyed on `athlete_id` now, with `name` supplying the
   legend label. The pre-fix build draws zero lines and zero dots for that fixture.
6. **The Recovery Index card contradicted itself.** The percentage counted nights above
   `sleepRecoveryHours` (7.0) while its own subtitle counted nights above `sleepThreshold`
   (6.5), so the card could read "50%" directly above "12 / 12 sessions optimal". Both now
   use one threshold. Latent with today's settings, not with a different pair.
7. **Dead code removed.** A "Hydration & Mass Stability Watch" list was computed on every
   dashboard render and never rendered anywhere — an O(todayLogs × allLogs) scan for
   nothing, and it compared raw weights without excluding post-practice sweat checks, so
   it would have re-introduced the §5 bug class the moment anyone displayed it.
   `ensureReportWindow` is also memoised now; a fresh identity each render was re-running
   the Analytics effect continuously.

### Data (`db/008`, applied)

Referential integrity was already clean: **0** orphan rows in either table, 0 implausible
weights or sleep values, 0 future-dated rows, 0 duplicate athlete names, and every one of
the 53 athletes with weigh-ins had exactly one baseline. What was wrong:

- **141 duplicate weigh-ins — 8.9% of the table.** Every group was exactly two rows
  agreeing on athlete, timestamp, weight, sleep *and* session type. They fall on precisely
  three days (2026-07-07, 07-14, 07-21) at midnight Central, ~46-49 athletes each: a
  historical seed script run twice, not coach double-taps. They inflated every row-counted
  average — Analytics' daily mean weight, Groups' avg sleep/RPE, Reports' alert tallies.
- **3 duplicate `performance_tests`**, all hand-entered. Nothing on the entry form hinted
  the value was already there, so the form now warns ("Already logged for this athlete on
  <date>") without blocking — an athlete genuinely can hit the same number twice.
- **4 stale `athlete_name` values** left behind by the roster renames, the data half of
  finding 5.

Deleted rows were copied to `weigh_ins_dupe_backup_20260908` /
`performance_tests_dupe_backup_20260908` first, so this is reversible with one
`INSERT ... SELECT`; drop those tables once the numbers look right in the app. After:
1,448 weigh-ins, 647 tests, 0 duplicates, 53 baselines intact, 0 name mismatches.

### Reviewed and found correct

Compliance and participation percentages (athlete-set based, so duplicates never affected
them), the dehydration/mass-drop baseline comparisons, the week-to-week weight leaderboard,
percentile and ranking maths, the variant-scoped leaderboards and profile cards, timezone
handling in `centralWallTimeToISO`/`getCentralDateString`, and the offline queue's
merge/dedup rules.

### Known, deliberately not changed

- `getAthleteBaseline`'s last-resort fallback (step 5) returns the athlete's *second-to-last*
  weigh-in when no explicit baseline, season-start log, or stored baseline exists. For
  those athletes "drop vs baseline" is really "drop since last weigh-in". It affects nobody
  today — all 53 athletes with weigh-ins have an explicit baseline — but it is a surprise
  waiting for the first new team that starts logging.
- Analytics' average weight is a mean of daily means, so a day with one weigh-in counts as
  much as a day with fifty.
- `getAthleteBaseline` step 3 matches the season-start day with a raw substring test
  against a UTC ISO string, so an evening weigh-in on season-start day is missed. Every
  other date comparison in the app goes through the program timezone.
- Vertical jumps of 7-11 inches exist in the Plyomat data (Evelyn Fryer, Reese Wakefield,
  Maya Hey and others), consistently across multiple sessions per athlete rather than as
  one-off spikes. They look like real submaximal reps rather than corrupt readings, so
  they were left alone — worth a coach's eye, not a script's.

---

## 22. Analytics polish: Team Trend chart, Recovery tile, one leaderboard per jump (v4.21.0)

Coach feedback on the Overview tab, three changes:

1. **Daily Logging Compliance removed entirely** - chart and top KPI tile both. It
   wasn't something coaches were checking day to day. The underlying per-day
   `Compliance`/`Logged` fields stay in `model.trend` (cheap to keep, nothing else reads
   them today) in case a future screen wants them; only the display is gone.
2. **Recovery (average sleep) now lives in the top KPI tile row**, replacing the
   Compliance tile's slot. `model.totals.avgSleep` is a new value alongside the existing
   `avgWeight` - same "average of the day-bucketed averages" shape. The detailed sleep
   chart is unchanged and still collapses by default; the top tile is the number a coach
   actually glances at, the chart is the detail view for whoever wants it.
3. **A new Team Trend chart** (`JumpTrendsPanel`, defined in `AnalyticsScreen.jsx`)
   averages Speed & Power results across the roster per test day - the same "one number
   per day" framing Average Body Weight already uses, extended to Fly 10, Vertical Jump,
   and Board Jump. Test type is picked via the same tab-button row the leaderboard and
   comparison panel use; a jump type with more than one technique requires a technique
   pick before it plots anything (the familiar "don't silently average two protocols"
   rule from §20), with an explicit "Pick a technique" empty state rather than defaulting
   to all techniques mixed together. Gated behind `settings.enableSpeedPower`, same as
   the leaderboard and Plyomat importer below it.

**SpeedPowerPanel's leaderboard also changed**: a jump with more than one technique
used to render as separate side-by-side boards (Hands on Hips / Arm Swing / Untagged) -
three columns competing for the same row of space, most of them empty for any given
roster. It's now ONE board per test type with a technique dropdown inside it
(`aria-label="<Test Type> technique"`), defaulting to whichever technique has the most
results so opening the panel leads with real data. Switching the dropdown swaps the
whole visible group - rank numbers, trend badges, and the expand/collapse state all key
off the selected technique's group, not the test type alone (an athlete's "Show all"
state for Hands on Hips doesn't leak into Arm Swing's).

New `tests/analytics-jump-trends.js` (14 probes) covers the Compliance removal, the
Recovery tile, and the Team Trend chart's default/technique-picker/empty states.
`tests/speed-power.js` gained probe [I] for the one-board-with-a-dropdown behavior -
scoped to the text between the two board headings, since Chromium's `innerText` leaks a
closed `<select>`'s option list into the page body and both athlete names appear there
regardless of which technique the board is actually showing. Both new suites, plus the
updated `tests/analytics.js` and `tests/tooltip-units.js` (which no longer expect a
Compliance card to expand), were verified to fail against the pre-fix build before the
change: analytics-jump-trends' probes throw immediately (Recovery tile and Team Trend
chart don't exist yet), and speed-power's [I] times out waiting for the technique
dropdown, which the pre-fix build never renders.

---

## 24. Lift Tracker (v4.26.0)

Off by default (Settings → Lift Tracker → toggle on). New sidebar item once enabled;
same "opt-in feature, invisible until turned on" convention as RPE and Speed & Power.

**Flow:** pick an athlete from the roster grid → pick a lift (Bench, Squat, Deadlift,
Hang Clean, Power Clean by default) → enter weight (lbs) and reps → Log Lift. The
modal doesn't close after saving - fields reset so a second lift (bench, then squat)
logs without re-picking the athlete.

**Custom lifts:** Settings → Lift Tracker → Lift Types is a comma-separated list
(same "type: 'list'" field already used for RPE's Session Labels) - a coach adds
"Front Squat" once and it shows up as an option for every athlete from then on.

**Leaderboard:** ranks by estimated 1RM (Epley: `weight * (1 + reps/30)`), not raw
weight - a 225x8 set (est. 285) correctly outranks a 275x1 single (est. 275). The
actual best set (weight × reps) is still shown alongside the estimate; only the
ranking uses the formula. Same "one PB per category, not a mix of protocols" instinct
as Speed & Power's `test_variant`, applied to rep ranges instead of technique.

**Data model:** new `lift_logs` table (`db/009_lift_logs.sql`) - separate from
`weigh_ins`/`performance_tests`, same reasoning as `performance_tests` itself (§9):
a lift result is tied to a lift session, several can be logged per visit, and
`lift_type` is text rather than an enum so a new lift never needs a migration. RLS
policy written in the same migration that creates the table (the rule `alert_status`
violated for four releases, §3). Raw `weight_lbs`/`reps` are stored as entered; the
1RM estimate is computed in the app, never persisted, so it can be re-derived if the
formula ever changes.

**Not built yet:** profile-card "Best Lift" tiles (Speed & Power has these for
jumps/sprints; lifts don't yet) and a Lift Tracker kiosk mode - this shipped as its
own dedicated screen instead, per the coach's request. `tests/lift-tracker.js` covers
the toggle, entry flow, custom lift types, and the 1RM leaderboard ranking (22 probes).

---

## 25. Kiosk search pills, and RPE/Speed & Power/Lift Tracker default ON (v4.27.0)

**Kiosk search:** typing a name used to still render every match as a full-size
`AthleteCard` below the search box. On an iPad's kiosk viewport a single match looked
like its own oversized floating box, and often pushed the entry modal's action buttons
below the fold - exactly the "everything fits without scrolling" complaint. A non-empty
search now renders matches as compact pills (name + sport, tap to open) instead; the
full card grid is unchanged when the search box is empty. `tests/kiosk-search-pill.js`
covers both states plus the "no match -> add athlete" fallback while searching.

**Feature flags default ON:** `enableRpe`, `enableSpeedPower`, and `enableLiftTracker`
all defaulted to `false` in `DEFAULT_SETTINGS`, which meant a fresh device (or adding
the app to a new iPad) always needed a trip to Settings to turn all three back on
before the kiosk showed them. They now default to `true` - the toggle in Settings
still exists for a program that wants one of them off, but a new install ships with
the full feature set active immediately.

Caveat: this only changes what a **fresh** `localStorage` starts with.
`normalizeSettings` keeps whatever is already stored (including an explicit `false`
saved earlier), so an existing coach device that already has these flags off will
keep them off until toggled - the new defaults only take effect where nothing is
stored yet.

Three tests relied on the old defaults implicitly (no explicit seed for the flag they
were checking) and needed an explicit `false` seed to keep testing the disabled state
on purpose: `tests/analytics.js` (Speed & Power's "not enabled" empty state) and two
probes in `tests/rpe-settings.js` (the toggle-reachability and survives-a-refresh
checks). The refresh-survival probe also needed its seed moved off `addInitScript`
entirely, since that re-injects on every navigation and would have silently masked
whether the toggle's own click-driven write survived the page's reload.

---

## 26. Dashboard focus + collapsible load metrics + sticky Lift Tracker entry (v4.28.0)

Three space/scroll fixes, all iPad-driven feedback:

1. **Pre-Session Action Banner** (`DashboardScreen.jsx`) - dropped the "Start today's
   session" / "All Athletes Weighed In Today!" heading and its subtext line. A coach
   glances at this banner to tap Start Weigh-Ins / Session RPE / Post-Practice, not to
   read a status line the icon (gold vs. green) and a small uppercase marker already
   cover. The three action buttons are now the first thing that reads.
2. **Internal Load Metrics** now collapses behind a chevron, closed by default -
   the exact pattern the Session Accountability Tracker below it already used
   (`accountabilityOpen` state, `ChevronUp`/`ChevronDown`, `role="button"` header). New
   `loadMetricsOpen` state gates the outliers strip, the team-picker dropdown, and the
   "no logs yet" message; the roll-up pill in the header (e.g. "2 of 5 REPORTED · 40% ·
   AVG 6.0") still tells a coach the headline number without opening it.
3. **Lift Tracker's search bar and sport filter buttons** (`LiftScreen.jsx`) are now
   `position: sticky; top: 0` in the "Log a Lift" view. Previously, once a full roster
   was on screen, searching for the next athlete or switching to the Leaderboard tab
   meant scrolling all the way back to the top - especially painful on an iPad with a
   whole team's roster grid below it. The controls now stay pinned while the roster
   scrolls underneath.

New test file `tests/dashboard-focus-and-sticky-lifts.js` covers all three: the removed
banner copy plus the buttons still being present, the load-metrics chevron opening and
closing, and (via a `boundingBox()` comparison before/after `page.mouse.wheel`) that the
Lift Tracker's search box doesn't move on scroll. `tests/rpe-dashboard.js` needed one
added line - clicking "INTERNAL LOAD METRICS" open before its probes - since those now
run against a panel that starts collapsed.

---

## 27. Lift Tracker "Log a Lift" redesign (v4.29.0)

Replaced the alphabetical 183-athlete card grid with a recency-first flow, per a
design handoff (`docs/uploads` reference: `README.md` + `lift-tracker-redesign.html`,
Shiloh Athletics design system). All in `LiftScreen.jsx`:

- **"Today's session" recent row** - horizontally-scrolling cards for whoever this
  coach has already logged a lift for today (any lift type), most-recently-logged
  first, capped at 8. Tapping one calls `openEntry` directly, same as any other
  athlete - skips search/filter entirely for the common "log a second lift for
  someone I just saw" case.
- **Row list replaces the card grid.** Each row: avatar, name, a meta line
  (`{weight} lbs · last logged {date}` or `never logged`), a Current/Stale badge,
  and a "Log Set" button. Clicking anywhere on the row (not just the button) opens
  the entry modal - kept intentionally, since `tests/lift-tracker.js`'s original
  probes click the athlete's name text directly and that had to keep working.
- **Group pills replace the old sport-filter button row** - functionally identical
  (`sportFilter` state, `'ALL'` default) just restyled as single-select pills
  (`999px` radius, navy fill when active) per the design tokens.
- **Stale/Current badge** reuses `settings.baselineExpiryDays` (default 14) - the
  same "how long since we've seen you" threshold `EntryScreen.jsx` already uses for
  baseline-testing prompts, rather than inventing a second staleness constant. No
  lift log ever, or the most recent one further back than that window, reads "Stale"
  (amber); anything more recent reads "Current" (neutral).
- **Row weight** comes from `reportData` (now passed into `LiftScreen`, wasn't
  before) - the athlete's most recent real weigh-in (`hasWeight` +
  `!isPostPracticeLog` + `!isRpeLog`, same filter chain `getAthleteBaseline` uses),
  not anything lift-related. An athlete with no weigh-in yet just omits that part of
  the meta line instead of showing "0 lbs" or a placeholder.
- The sticky top bar from v4.28.0 (search box pinned while the roster scrolls)
  carries forward and now also pins the recent-session row and group pills, since
  they sit above the roster list in the redesign too.

New test file `tests/lift-tracker-redesign.js` (17 probes) covers the recent row,
the weight/last-logged/badge logic (including the never-logged edge case), group-pill
filtering, and the row-level "Log Set" button. The original `tests/lift-tracker.js`
(22 probes, entry modal + leaderboard + logging flow) needed zero changes - the modal,
leaderboard, and underlying `addLift`/`useLiftLogs.js` flow are untouched.

---

## 28. Fix: Lift Tracker modal drifting with the roster scroll on iPad (v4.29.1)

Reported right after the v4.29.0 redesign shipped: tapping "Log Set" opened the entry
modal, but on an iPad it kept sliding along with the roster list underneath instead of
popping up in place, forcing the coach to chase it.

Root cause: the app's actual scroll container isn't `window`/`body` at all - the
whole shell (`.app-layout`) is `height: 100vh` + `overflow: hidden`, and every screen
scrolls inside a single `.scroll-area` div that uses
`-webkit-overflow-scrolling: touch` for iPad momentum scrolling. Mobile Safari has a
long-standing bug where a `position: fixed` element nested inside a
touch-scrolling container doesn't stay pinned to the viewport - it drifts with that
container's scroll instead. The Lift Tracker's entry modal is rendered from inside
`LiftScreen`, which is a descendant of `.scroll-area`, so it hit this exactly.
(App.jsx's own modals - the confirm dialog, the recovery station - never had this bug,
because they're rendered as siblings of `.scroll-area`, not descendants of it.)

Fix: the entry modal now renders through `createPortal(..., document.body)` instead of
inline, escaping `.scroll-area` (and its `-webkit-overflow-scrolling: touch`) entirely.
`position: fixed` on a portaled node is relative to the real viewport with nothing
between it and `<body>`, so it can't drift.

**Lesson for any future full-screen modal added inside a scrollable screen body**:
check whether it's a descendant of `.scroll-area` - if so, portal it to `document.body`
rather than relying on `position: fixed` alone. `tests/lift-tracker-redesign.js`
section [E] covers this: scrolls `.scroll-area` (not `window.scrollY`, which is always
0 in this app - a mistake worth flagging since it's an easy trap when writing a
scroll-behavior test here), opens the modal, and asserts both that it sits at the top
of the viewport and that it's not a DOM descendant of `.scroll-area`.

---

## 29. Fix: Lift Tracker modal clipped on short/mobile viewports (v4.29.2)

Screenshot from a coach right after v4.29.1 shipped: the entry modal's bottom edge -
including the Log Lift button and the card's rounded corner - was cut off the bottom
of the screen, with the roster page visible underneath through the gap.

Cause: the modal card had no `maxHeight`, and the overlay centered it with
`alignItems: 'center'` and no scroll fallback. On a short viewport (a phone, or an
iPad once the keyboard opens for the weight/reps inputs and shrinks the visible
area), a card with a full 8-row "Recent Lifts" history is taller than the screen -
the flex-centered card simply overflowed above and below the viewport with nothing
to scroll it back into view.

Fix: the card now has `maxHeight: '90vh'` and `overflowY: 'auto'` (Log Lift button
included in the scrollable area, so it's always reachable), and the overlay itself
got `overflowY: 'auto'` as a second line of defense.

`tests/lift-tracker-redesign.js` section [F] covers it: gives one athlete a full
8-row lift history (needed to reliably push the card past a 620px-tall viewport -
a fresh athlete with no history wasn't tall enough to reproduce it), opens the modal
at that viewport size, and asserts the card's bounding box fits inside the viewport
and the Log Lift button stays visible. Confirmed fail-before (reverted just the
`maxHeight`/`overflowY` addition - card height 629 in a 620 viewport) / pass-after.

---

## 30. Athletes screen: Roster + Profiles merge (v4.30.0)

Per a design handoff (Shiloh Athletics design system, `roster-profiles-redesign.html`):
consolidated the standalone Roster grid (`RosterScreen.jsx`, now deleted) and
Profiles' own athlete-picker mode into one new screen, `src/features/athletes/AthletesScreen.jsx`.

**What's new:**
- Two-column layout (list `1fr` + profile panel `360px`, stacks under 960px).
  Left: search + single-select sport pills + a row list (avatar, name/team, a
  needs-attention badge, and a right-aligned metric - weight delta if flagged,
  else best vertical/fly 10, matching whatever `ProfilesScreen`'s old picker
  cards already showed per athlete). Right: a compact profile panel for
  whichever row is selected - badge, a 2x2 metric grid (current weight,
  baseline + date, best vertical, most recent RPE), a 3-row recent log
  history, and Log Entry / View Full Trends / Edit Info buttons.
- **Default sort is "needs attention"**, not alphabetical: danger (a real
  weigh-in drop at/past `settings.dehydrationThreshold`) → warning ("Needs
  baseline" - has logs but never a real weigh-in, e.g. sleep-only) → neutral
  ("No logs" - nothing logged at all) → success ("Current"). Alphabetical
  within each group. Selecting a row is local UI state
  (`selectedAthleteId`) - it does not touch the global `selectedProfileId`
  Profiles/Alerts/etc. already use, so clicking around this list can't leak
  into what those other screens show.
- **"View Full Trends" opens the existing deep-dive `ProfilesScreen`
  unchanged** (`setSelectedProfileId` + `setScreen('profiles')`) - that huge
  ~1250-line screen (charts, log editing, Speed & Power rankings) was left
  completely untouched. Its own picker-grid branch (`!selectedProfileId`) is
  now dead code, reachable only if something navigates to `'profiles'`
  without a profile id - harmless, but worth knowing it's an orphaned path.
  `profileEntryScreen` gained a new `'athletes'` value so the deep-dive's
  back chevron (`handleBackFromProfile`) returns to Athletes instead of
  falling through to that orphaned picker.
- **Nav**: "ATHLETES" replaces "PROFILES" in the sidebar and bottom nav
  (same slot, same `User` icon). "TEAMS & ROSTERS" (`GroupsScreen`) is
  untouched - it's a team-level dashboard (bulk baseline tool, per-sport avg
  cards), a different concept from the athlete list. Its sport-card click,
  and the Dashboard's own team cards, now navigate to `setScreen('athletes')`
  (with the sport filter set) instead of the retired `'roster'` screen.
  `handleEditClick`'s "EDIT INFO" button (still on the deep-dive Profiles
  screen) and the expired-baselines modal's "Inspect Profile" link were
  repointed the same way.
- Reused rather than reinvented: `bestTestFor` (exported from
  `ProfilesScreen.jsx` for this - it was a private helper before),
  `formatMetric`/`TEST_TYPE_BY_KEY` (`SpeedPowerPanel.jsx`), and
  `getAthleteBaseline`/`hasWeight`/`isRpeLog`/`isPostPracticeLog`
  (`athleteData.js`) - so a badge or metric shown here can never disagree
  with the same number on the Analytics leaderboard or the deep-dive profile.

**Not built** (not in the design spec): a dedicated per-row edit affordance in
the list itself - editing goes through the panel's "Edit Info" button, which
reuses the same inline add/edit form Roster used to have.

New test file `tests/athletes-screen.js` (23 probes) covers the nav change,
needs-attention sort order (all four badge tones), in-place row selection,
search/pill filtering, Log Entry pre-selection, and the View Full
Trends → back-chevron round trip. All pre-existing suites that touch
Profiles, Groups, or the Dashboard's team-card links were re-run and pass
unchanged.

**Known pre-existing issue found during this regression pass, not caused by
this change and not fixed here**: `tests/tooltip-units.js` section [C]
("ProfilesScreen tooltips unchanged") fails on `main` before this change too
(confirmed via `git stash`) - the deep-dive profile's weight-trend tooltip
doesn't say "lbs" in this test's fixture. Worth a look separately.

---

## 31. RPE, Lift Tracker, and Settings fixes (v4.31.0)

Five coach-reported items, all in one pass:

1. **RPE no longer prompts for a baseline.** `EntryScreen.jsx`'s `requiresBaseline`
   gate only counted weight-bearing logs to decide "is this athlete's first entry",
   so an athlete who had only ever logged RPE (no weight logs at all) read as
   `isFirstEntry` regardless of track mode, and got "🎯 This is my baseline" /
   "Save as regular entry" on an RPE-only save that carries no weight to baseline in
   the first place. Added `kioskTrackMode !== 'rpe'` to the gate, and to the separate
   Baseline Testing Mode banner/button styling a few lines down (same bug, different
   trigger - a program running its whole-station "Baseline Testing Mode" toggle while
   in RPE mode hit the same nonsensical prompt).
2. **Session Duration is tiles, not a number pad.** New setting
   `rpeDurationQuickPicks` (default `[15,20,25,30,35,40,45,50,60,75,90]`, exposed in
   Settings → Session RPE as a `type: 'list'` field like Session Labels). The
   duration field in `EntryScreen.jsx` now renders these as tap buttons, same
   pattern as the sleep quick-picks already used. RPE itself keeps its manual
   number-pad entry - only duration changed, per the request that RPE stay the one
   typed field.
3. **Lift Tracker Weight/Reps overlap fix.** The two-column grid used bare `1fr 1fr`
   tracks; a `type="number"` input's intrinsic min-content width doesn't shrink
   below itself inside a grid track by default, so on a narrow screen both boxes
   could overflow their column and overlap. Fixed with `minmax(0, 1fr)` tracks plus
   `minWidth: 0` + `boxSizing: 'border-box'` on both inputs - the standard CSS Grid
   "min-width: auto" trap fix. (Note: could not reproduce the overlap in headless
   Chromium at any viewport tested to confirm a fail-before/pass-after on this one
   specifically - the fix is still correct and worth keeping, but if the overlap
   persists on a real device it may be a different/additional cause, e.g.
   browser-native number-input spinner rendering outside the box model on iOS
   Safari specifically.)
4. **Lift entries can be edited, including moving them to the right exercise.**
   `useLiftLogs.js` already had `updateLift`/`deleteLift` fully implemented but
   wired into nothing - added a pencil icon per row in "Recent Lifts" (the entry
   modal) that opens an inline edit form: the same lift-type button row as the main
   entry form (so a set logged as Squat can be moved to Bench), plus weight/reps
   inputs, Save and Delete. Delete goes through the app's existing custom confirm
   modal (`setConfirmModal`), not a native `window.confirm`, to match every other
   delete flow in the app.
5. **Settings comma-separated list fields couldn't have a new item typed in.**
   `Lift Types`/`Session Labels`/the new `Duration Tiles` field derived their input's
   `value` straight from `settings[key].join(', ')` on every keystroke. Typing a
   comma to start a second item produces a trailing empty array entry
   (`"Bench,".split(',') -> ["Bench", ""]`) that gets filtered out before the next
   render - so the comma (and anything typed after it) visibly disappeared
   immediately, and a coach could never actually add a new exercise. Fixed with a
   new `ListField` component holding its own local text buffer, only committing the
   parsed/cleaned array to `settings` on blur or Enter - typing itself is now
   completely free-form.

New test files: `tests/rpe-fixes.js` (10 probes - no-baseline-prompt +
duration tiles), `tests/lift-edit.js` (13 probes - overlap check + edit/delete),
`tests/settings-list-field.js` (8 probes - types character-by-character via
`pressSequentially`, the only way to actually exercise the bug, since `.fill()`
sets the value in one shot and never round-trips through the buggy per-keystroke
`onChange`). Confirmed fail-before/pass-after on 1, 2, and 5; could not reproduce 3
in headless Chromium (see above); 4 is new functionality with no prior behavior to
compare against. `tests/rpe.js` updated - its two `getByLabel('Session Duration').fill(...)`
calls now click the equivalent duration tile.

---

## 32. Lift Tracker CSV export (v4.32.0)

Added a coach-only export of every logged set to `LiftScreen.jsx`'s header, next to
the Log a Lift / Leaderboard tabs. Deliberately icon-only (`Download`, no text label,
muted/outline styling, separated from the tabs by a 1px divider) per explicit request -
those two tabs are large labeled buttons an athlete taps through on the kiosk, and a
third labeled button in the same row risked being tapped the same way. A bare icon
with no caption doesn't read as part of that flow.

`handleExportCSV` exports every row in `liftLogs` (not just the currently-filtered
roster), newest first: Date, Athlete, Sport, Lift, Weight (lbs), Reps, Est. 1RM - the
Epley estimate (`estimate1RM`, already exported from this file for the leaderboard),
not just the raw weight, so the export answers "how strong is this lift really" the
same way the leaderboard does. `csvCell`/`downloadCSV` are a local copy of the same
helpers `ReportsScreen.jsx` already uses for its own exports (no shared module exists
for these yet - every screen with an export duplicates this small pair).

New test file `tests/lift-csv-export.js` (9 probes): confirms the button has no visible
text and isn't styled as an accent CTA, and that clicking it downloads a CSV with the
correct filename, header row, both fixture lifts, and a computed (not raw) 1RM value.

---

## 33. Lift Tracker CSV export sorts by last name (v4.32.1)

Follow-up to §32: the export was newest-first; changed to sort by athlete last name
(`athlete_name`'s last whitespace-separated word), then first name, then newest-first
within one athlete's own sets. `tests/lift-csv-export.js` section [C] added: two
fixture athletes ("Adam Zed" and "Zach Adams") deliberately chosen so a first-name or
date sort would misorder them, confirming the export actually sorts on the last name
and not on whatever a naive full-string compare would produce.

---

## 34. Lift Tracker leaderboard sport filter + est. 1RM on the Athletes profile (v4.33.0)

Two small additions:

1. **Leaderboard sport filter.** New `leaderboardSportFilter` state (default `'ALL'`),
   rendered as the same pill row the roster list already uses. `leaderboardRows` now
   scopes its roster-id set to the selected sport before ranking, so "All" behaves
   exactly as before and picking a sport narrows the board to just that team. Empty
   state names the sport too ("No Bench results logged yet for Football").
2. **"Best est. 1RM" on the Athletes profile panel.** `AthletesScreen.jsx` now takes
   a `liftLogs` prop (passed from `App.jsx`, same array `LiftScreen` already
   consumes) and imports `estimate1RM` from `LiftScreen.jsx`. For the selected
   athlete, it reduces every one of their lift logs to whichever single set produced
   the highest Epley estimate, across all exercises - not scoped to one lift type -
   and shows it as a sixth tile in the biometric/performance grid, labeled with
   which lift it came from (e.g. "Best est. 1RM (Squat)"). Reuses the exact
   `estimate1RM` function the leaderboard ranks on, so this number can never
   disagree with that board. An athlete with no lift logs reads "No lifts logged"
   rather than a blank tile.

New test files: `tests/lift-leaderboard-sport-filter.js` (9 probes),
`tests/athletes-est-1rm.js` (5 probes, including the "raw heaviest single loses to a
higher-rep estimate" case already established for the leaderboard itself). Full Lift
Tracker + Athletes regression suites re-run and pass unchanged.

---

## 35. Collapsible Post-Practice Sweat Loss & Historical Log Ledger cards (v4.34.0)

The athlete profile's two longest cards - the Post-Practice Sweat Loss & Hydration
Tracker and the Historical Log Ledger (full chronological attribute timeline) - now
collapse behind a chevron, closed by default, same pattern the dashboard's Session
Accountability Tracker and Internal Load Metrics cards already use. A coach opening a
profile lands on a much shorter page and expands either card only when they actually
need it.

Two new `useState` toggles (`postPracticeOpen`, `logLedgerOpen`) live on
`ProfilesScreen`, declared above its early "no athlete selected" return to satisfy the
rules of hooks. Each card's outer flex `gap` drops to `0` while collapsed so no dead
space is left behind, and the body content is gated behind the open flag.

The two headers use different click targets, matching what's inside each:
- **Post-Practice** keeps its "Log Post-Practice Weight" button as an independent
  sibling action, so only the icon+title block toggles the collapse - clicking it never
  opens the manual-entry modal.
- **Historical Log Ledger** has no header action button, so the whole header row
  (chevron, title, and the static "Chronological Order" pill) is the click target.

`tests/edit-log.js` clicks row-level Edit buttons inside the now-collapsed ledger, so
it now expands the ledger once, right after opening the athlete, before looking for
those buttons - the collapse state lives on `ProfilesScreen` itself, so it stays open
across that test's mid-run athlete switch with no second click needed.

New test file `tests/profile-collapsible-sections.js` (10 probes): both cards collapsed
by default with headers still visible, the Historical Log Ledger expands and
re-collapses on repeated clicks, and the Post-Practice header expands without
triggering the manual-entry modal. Full regression sweep re-run across
`tests/edit-log.js`, `tests/dashboard-profile-team.js`, `tests/data-integrity.js`,
`tests/rpe.js`, `tests/tooltip-units.js`, `tests/profile-speed-power-rankings.js`, and
`tests/settings-live.js` - all pass unchanged.

---

## 36. Full audit: dropped stale backup tables, documented an intentional SECURITY DEFINER, fixed a baseline-chart disagreement (v4.34.1)

A full audit (regression sweep + Supabase/Vercel production health + a manual code-quality
pass) turned up three real, actionable items. All three are done:

1. **Dropped `performance_tests_dupe_backup_20260908` (3 rows) and
   `weigh_ins_dupe_backup_20260908` (141 rows).** These were the RLS-enabled-but-no-policy
   backup copies from the v4.20.0 duplicate cleanup (db/008), over a month old. Row counts
   were confirmed against that changelog entry before dropping. Clears both
   `rls_enabled_no_policy` advisories.
2. **Documented `is_approved_coach()`'s `SECURITY DEFINER` as intentional**, not an
   oversight, via `comment on function`. It has to run as definer because the `coaches`
   table's own RLS policies call it - running it as invoker would re-trigger those same
   policies on its internal query and recurse infinitely. `search_path` is already pinned
   to `public` (the real mitigation for the classic SECURITY DEFINER exploit), it takes no
   arguments and only ever evaluates `auth.uid()` for the calling session (no cross-user
   data exposure), and `anon` has no EXECUTE grant on it. The security advisor will likely
   keep flagging this - it's a generic lint, not comment-aware - but the reasoning is now on
   the function itself for the next person who checks it.
3. **Fixed `ProfilesScreen.jsx`'s weight-trend chart disagreeing with its own stat tiles
   on an athlete's baseline.** The chart's reference line re-derived the baseline by hand
   (`is_baseline` flag first, override map second) instead of calling the same
   `getAthleteBaseline()` the tiles above it use (override map first, flag second). A coach
   correcting a baseline via "Make Baseline Marker" after an older log was already flagged
   `is_baseline` would see the tiles show the correction while the chart kept plotting the
   stale flagged value as "Baseline: X lbs" a few hundred pixels below. New test
   `tests/profile-baseline-chart-agreement.js` reproduces the exact scenario (a flagged
   190 lb log vs. a 170 lb override) and was confirmed to fail against the pre-fix build
   before passing against the fix. Full regression sweep (all 35 files) re-run and passes.

A manual RLS review across every athlete-data table (`athletes`, `weigh_ins`,
`performance_tests`, `lift_logs`, `alert_status`) turned up nothing else - each has exactly
one `is_approved_coach()`-gated policy restricted to `authenticated`, no `anon` access
anywhere. Vercel production had zero runtime errors in the trailing 7 days.

Two items from the audit were deliberately left alone: the bulk-baseline-set's one-`UPDATE`-
per-athlete pattern (`App.jsx`) is inefficient but not a correctness bug at current roster
sizes, and the various dead-code/unused-import findings are cosmetic. Leaked-password
protection (§35's carryover, and the original security audit's) is still open - it's a
Supabase dashboard toggle, not something this session's tooling can flip.

---

## 37. Quick Entry (Kiosk Mode) redesign (v4.35.0)

A designer handoff (static HTML reference, not shipped code) asked for a condensed,
tap-first redesign of the Quick Entry screen - the one coaches actually stand in front of
during practice. The old screen had grown a header row, two conditional mode/baseline
banners, a 4-column Sport/Grade/Team/Position filter-select grid, a sort toggle, and a
roster that rendered two *different* ways depending on whether search was active (a full
`AthleteCard` grid when empty, a separate compact pill-button list when searching, which
didn't use `AthleteCard` at all).

What changed in `EntryScreen.jsx`:
1. **Search collapses behind an icon button** that opens an overlay on demand, instead of
   a persistent full-width bar - kiosk interaction favors tapping over typing. Closing the
   overlay (via its X or Escape) also clears the query.
2. **Grade, Position, and the Varsity/JV Team filter are dropped from this screen** - sport
   grouping already does that job here, and a coach can still see grade/team elsewhere
   (Athletes screen). This only removed dead plumbing: `selectedGradeFilter`/
   `selectedTeamFilter`/`selectedPositionFilter` and their setters, grepped across the
   whole app, were used by nothing except this screen's own now-removed `<select>`s.
3. **A new single-select sport-filter pill row** ("All" + one pill per sport), styled to
   match the existing gold-fill/navy-text active convention from `LiftScreen.jsx`'s
   leaderboard filter. Deliberately **local** state (`localSportFilter`), not the shared
   `selectedSportFilter` `AthletesScreen`/`ProfilesScreen` also read - switching sports on
   Quick Entry no longer silently changes what those screens show next.
4. **The roster is grouped into one section per sport** (header: sport name + "`n` of
   `total` logged"), computed once via a `useMemo` that also folds in the unweighed-only
   filter - replacing two separate copies of that same `.filter()` call the old bimodal
   code had.
5. **Search and the sport pill both filter the same card grid now.** The old
   dual-rendering split (cards vs. a separate pill-button list while searching) is gone.
6. **`AthleteCard` redesigned**: 44px rounded-square avatar (was circular) colored by
   *sport* now, not a per-name hash - a new shared `getSportColor()`/`SPORT_COLORS` export
   in `athleteData.js` replaces two previously-duplicated `AVATAR_COLORS` arrays (the
   card's own copy, and a second hand-rolled one in the entry modal's header avatar, now
   also using the shared helper). Dropped the sport/position/team subtext line and the
   "DONE"/"TAP TO LOG" text pill in favor of a small checkmark badge shown only when
   logged today, plus ~55% card opacity - the card stays in place and stays tappable, so a
   coach can still correct an entry.

Everything else - Baseline Testing Mode toggle+banner, the unweighed-only priority
filter+banner, the sort-by-name toggle, and the RPE/sleep-only mode banners - was kept
exactly as it worked before, just relocated below the new compact top bar/pill row rather
than removed. The entry modal, `KioskNumpad`, and entry-submission logic are untouched;
this was a discovery/filtering redesign only. (`KioskNumpad`'s pre-existing `onEnter`
prop being silently ignored - it only destructures `{ value, onChange }` - was noted
during planning as a real gap, but is explicitly out of scope here.)

`tests/kiosk-search-pill.js` was fully rewritten (the dual-rendering behavior it tested no
longer exists) - 6 scenarios, 21 probes, covering the unified grid, the sport pill, and
the search-overlay open/close/clear cycle. `tests/entry-perf.js` needed a scoped selector
swap: it used `text=TAP TO LOG` as both an assertion and a click target in three places,
which cannot survive that text's removal - replaced with a new `data-testid="athlete-card"`
hook on `AthleteCard`'s root, and its "ADD ATHLETE" button match updated for the
shortened "+ Add" label.

A full regression sweep surfaced three more collateral breaks the plan hadn't listed,
fixed the same way: `tests/data-integrity.js` and `tests/stress.js` both filled the search
box directly without opening the new icon-gated overlay first - both patched to click
`[title="Search athletes"]` before filling. `tests/stress.js` specifically needed an
*idempotent* open helper (`ensureSearchOpen`), not a plain click: it calls
`page.goto('#entry')` repeatedly on a page already sitting on that hash, which doesn't
force a real SPA reload, so the search overlay's local state can carry over between
calls - a second blind click was toggling an already-open overlay closed. `tests/rpe.js`'s
kiosk mode-check scenario asserted literal `/DONE/` text against `.card-glass` - genuinely
broken by the redesign's move to a checkmark-only badge, not a real regression - fixed by
adding a `data-testid="athlete-done-badge"` hook and asserting on its presence instead.
Full 35-file regression sweep re-run clean after all of the above.

---

## 38. Sync from Plyomat: live API integration (v4.36.0)

Plyomat published a real Partner API (OpenAPI 3.1, Bearer-key auth, read-only at v0.1) since
the manual CSV importer (§4/§15) was built. Analytics' Plyomat panel now offers a "PLYOMAT
SYNC" mode alongside "UPLOAD CSV" - a "Sync from Plyomat" button that pulls new jump results
directly, reviewed through the exact same preview-before-write UI (stat tiles, ambiguous-name
decisions, new-athlete disclosure) the CSV path already used, since both now produce the same
plan shape.

**New infrastructure - first Supabase Edge Function in this repo**: `supabase/functions/
plyomat-sync/`. It is a thin authenticated proxy only - it verifies the caller via the same
`is_approved_coach()` RPC every RLS policy already relies on, then pages Plyomat's
`GET /sets?since=` and `GET /athletes`, handles 429/Retry-After backoff, and returns raw JSON.
All product/matching logic (fuzzy name matching, sport inference, dedup) stays client-side in
`plyomatImport.js`'s new `buildImportPlanFromApiSets()`, sharing every reusable piece with the
CSV path's `buildImportPlan()` rather than duplicating it in Deno. Deploy with
`supabase functions deploy plyomat-sync`; set the secret once with
`supabase secrets set PLYOMAT_API_KEY=pk_live_...` (never committed, never touches the browser
or a database table - this app is single-tenant, one school, one Plyomat org).

**Mapping decisions**: only `display_mode: 'vertical'` sets import (parity with the CSV path's
jump-height-only support today) - everything else lands in `unsupported`, same as an
unrecognized CSV metric. Best-of-kept height is the max `jump_height_cm` among `is_kept` reps,
converted to inches (`× 1/2.54`) to match the unit every other `vertical_jump` row in this app
already uses - worth calling out because a silent unit mismatch here would corrupt every
leaderboard, not error loudly. Dedup keys on the immutable per-capture `set.id` (not
`session_id`, which groups multiple sets), embedded in `notes` exactly like the CSV path's
Session ID. **v1 is create-only**: a set whose `version` later increments (a coach edited the
capture inside Plyomat's own app) is not detected or re-imported - matches the CSV path's
existing "a known id is a pure duplicate, full stop" behavior, and avoids silently clobbering a
coach's local correction with an unreviewed "newer" value. `Athlete.external_id`/
`external_source` are read and carried through plan rows for visibility only (not written
anywhere, not used for matching) - the API can't write them from our side yet, so any real use
of that field waits on a future Plyomat API revision.

**New checkpoint table** `db/010_plyomat_sync_state.sql`: a singleton row (`last_synced_at`,
`last_synced_by`), RLS-gated by the same `is_approved_coach()` pattern as every other table.
The client reads it before syncing (passes `since:` last_synced_at, or omits it entirely on a
first-ever sync - the panel warns this may take a minute or two) and only advances it after a
confirmed, **non-partial** import - a rate-limited sync must not skip the tail it never actually
retrieved, so it shows an informational message instead and leaves the checkpoint alone for the
next attempt to re-cover.

**Testing**: `tests/plyomat-import.js` gained §H/§I covering `buildImportPlanFromApiSets`
(unsupported display modes, no-kept-reps, cm→in conversion, external_id pass-through, re-sync
no-op) with the same adversarial-fixture style as the CSV suite. New
`tests/plyomat-api-sync.js` (Playwright) stubs the client's call to the Edge Function itself
(`**/functions/v1/plyomat-sync**` is a browser-side network request, fully interceptable, unlike
the function's own outbound call to Plyomat) and covers the full sync→preview→confirm→checkpoint
flow, a partial/rate-limited response, and a 401. Fixed a real bug found while writing that
test: `supabase.functions.invoke()` throws a generic error on any non-2xx response instead of
handing back the function's own JSON body - `onPlyomatApiSync` in `App.jsx` now recovers the
real `{ok:false,error}` payload from `error.context` so the panel can show Plyomat's actual
reason instead of a generic network failure.

**Not covered by this session's tooling - explicit pre-launch checklist, not done here**:
`supabase/functions/plyomat-sync/sync.test.ts` (a Deno unit test mocking `fetch`, pinning down
the pagination/backoff/error-shape logic in `sync.ts`) was written but could not be *run* in
this sandbox - no network access to install Deno. Before this ships: run that test suite, and do
at least one manual end-to-end sync against Plyomat's real API (or a sandbox key if they offer
one) to confirm real pagination envelopes and rate-limit behavior match what the tests assume.

**Verified 2026-09-16**: deployed to production, ran a real sync against Plyomat's live API.
Confirmed working as designed - 752 previously CSV-imported rows correctly recognized as
duplicates (validating that the CSV export's Session ID and the API's `set.id` really are the
same identifier), unsupported test types (`drop_jump`, `pps`) correctly flagged rather than
imported wrong, new athletes created with sport left blank rather than guessed, and one
"(unknown) - athlete not found in Plyomat response" row correctly held out rather than crashing
(an archived/deleted Plyomat athlete referenced by an old set). Import confirmed and written
successfully.

---

## 39. Fixed: "Sports Offered" couldn't have a new sport typed into it (v4.36.1)

The exact bug `tests/settings-list-field.js` documents fixing for Lift Types/Session Labels in
v4.31.0 was still present on Settings' "Sports Offered" field - it was never migrated to the
shared `ListField` component the other comma-separated list fields already use. Its `<textarea>`
derived `value` straight from `settings.sportsList.join(', ')` on every keystroke, so typing a
comma to start a second sport produced a trailing empty entry that got filtered out before the
next render - the comma (and anything typed after it) visibly vanished immediately, making it
impossible to add a new sport by hand.

Fixed by extending `ListField` with a `multiline` option (it now renders a `<textarea>` when
asked, using the exact same local-text-buffer-until-blur pattern) and routing "Sports Offered"
through it, matching Lift Types/Session Labels exactly. New `tests/settings-sports-list.js`
confirmed the bug against the pre-fix build (couldn't even find `#setting-sportsList` - the field
had no id at all before this) and passes against the fix. Full regression sweep re-run and
passes.

---

## 40. Removed a redundant header button (v4.36.2)

The main header had a "LOG ENTRY" button sitting next to "ACTIVATE KIOSK MODE" that just
navigated to the same `#entry` screen the sidebar's own permanent "LOG ENTRY" nav item already
reaches - a third path to a place already two clicks (or one, via the sidebar) away, alongside
the dedicated "EXIT KIOSK" button that already appears once a coach is actually in kiosk mode.
Removed per direct request after noticing the redundancy; the sidebar nav item is unaffected and
remains the way to reach the entry screen outside of kiosk mode. No test referenced this
specific button (`tests/athletes-screen.js`'s "Log Entry" click is a different, case-sensitive
button on the Athletes panel, unaffected). Full regression sweep re-run and passes.

---

## 41. Lift Tracker visual polish (v4.36.3)

The coach is using Google Stitch (an external AI design tool) to explore redesigns,
starting with the Lift Tracker screen. Stitch's generated mockup included several
fabricated new-capability items (a bodyweight/strength-to-weight metric, a "+lbs vs
prev" comparison chip, date-range filtering, a three-tier badge, fake "Verified
Kiosk"/"Form Authenticated"/latency copy) and an unrelated sidebar restructuring -
none of that shipped; the coach explicitly chose reskin-only, dropping every
fabricated element and leaving the real nav alone.

Two purely visual changes were adopted, both hand-integrated against the real
component (not the Tailwind markup Stitch produced, which used different prop
names, a hardcoded lift/sport list, and a delete flow bypassing the existing
confirm-modal convention):

- The leaderboard row layout now shows a numbered rank badge, the athlete's avatar,
  and a right-aligned Est. 1RM figure, styled with the app's real tokens (no new
  colors, no Tailwind).
- The Log Set modal's Weight and Reps inputs each gained +/- stepper buttons
  (5 lbs / 1 rep), useful on a kiosk/iPad where tapping beats typing.

No props, handlers, data flow, or the portal-based modal changed. Full lift-tracker
regression suite (`lift-csv-export.js`, `lift-edit.js`,
`lift-leaderboard-sport-filter.js`, `lift-tracker-redesign.js`, `lift-tracker.js` -
82 checks) re-run and passes.

---

## 42. Fixed: leaderboard crash from a missing athlete name (v4.36.4)

The v4.36.3 leaderboard restyle (§41) added `<Avatar name={row.athlete_name} />` to
each row, where `athlete_name` comes from `lift_logs` - a denormalized column, not
guaranteed non-empty the way `athletes.name` is. `colorFor`/`initialsOf` called
`.split()` directly on whatever they were given with no guard, so any row with a
null or blank `athlete_name` threw and crashed the leaderboard's render - reported
by the coach as "the app crashed" right after the v4.36.3 deploy. None of the local
Playwright fixtures happened to exercise a blank name, so the regression suite
passed at the time and this only surfaced against real production data.

Fixed both helpers to fall back to `''`/`'?'` instead of dereferencing a possibly-
missing name. Full lift-tracker regression suite (82 checks) re-run and passes.
Checked Vercel's runtime error log for the affected window - nothing recorded,
confirming this was a client-side render crash (a white screen), not a server
error, which is why it didn't show up there.

---

## 43. Fixed: a normal refresh didn't pick up a new deploy (v4.36.5)

After the v4.36.4 crash fix shipped, the coach reported a hard refresh showed
it but an ordinary refresh didn't - a real PWA update bug, not a caching
inconvenience. `vite.config.js` has had `registerType: 'autoUpdate'` since the
PWA was first set up, but that setting only controls what the generated
service worker does once told to activate - it doesn't by itself make the
page notice a new one exists. Nothing in the app ever imported
`virtual:pwa-register`, so Vite silently fell back to injecting its own bare
`navigator.serviceWorker.register('/sw.js')` with no update-checking or
reload logic at all. A hard refresh bypasses the service worker entirely
(straight to network), which is why it always "worked"; a normal refresh
goes through the still-active old worker, which had no reason to ever check
for or hand off to a new one.

Fixed in `src/main.jsx`: now actually calls `registerSW()` from
`virtual:pwa-register` with `immediate: true`, plus an hourly
`registration.update()` poll so a tab left open in a kiosk for hours still
notices a new deploy without needing to be closed and reopened. Also made
`vite.config.js`'s `workbox.skipWaiting`/`clientsClaim`/`cleanupOutdatedCaches`
explicit rather than relying on `autoUpdate` to imply them. Confirmed in the
production build: `dist/index.html` no longer injects the old bare
`registerSW.js`, and the real `workbox-window` update/reload logic is bundled
into the app's own JS. Full 37-file Playwright regression suite re-run and
passes (`data-integrity.js` and `stress.js` print labels containing the
literal substring "FAIL" as part of their own log tags, e.g. `NET-FAIL`,
`QUEUE-DROP` - not real failures; both report `pageErrors: 0`).

---

## 44. Lift Tracker: real features scoped down from a Stitch mockup (v4.37.0)

A second Stitch-generated mockup (a fuller Lift Tracker/roster redesign, not just
the leaderboard from §41) mixed genuinely real, buildable ideas with a lot of
fabricated capability - rack station assignments, bar-velocity (VBT) telemetry,
workout-block/protocol assignments, rest timers, "fatigue beacons," rack
utilization %, and scheduled/check-in session states. None of that has any real
system behind it in this app, so it was dropped outright, same standing rule as
the leaderboard pass.

What *did* get built for real, confirmed item-by-item with the coach first:

1. **Three-tier roster status.** `isStale` was a straight boolean before - a
   never-logged athlete and a genuinely-gone-stale one both just read "Stale".
   Split into `current`/`stale`/`never` in `LiftScreen.jsx`; "Never Logged" gets
   its own dashed/muted badge style, pointing a coach toward onboarding rather
   than re-testing. `tests/lift-tracker-redesign.js` updated to assert the new
   distinct badge (previously it explicitly asserted the old "reads Stale
   either way" behavior - that assertion is now the wrong behavior on purpose).
2. **Session Tonnage.** Total lbs lifted today (sum of weight x reps across
   today's real `lift_logs`), shown next to the "Today's session" header. Pure
   arithmetic over data already being fetched - no new schema.
3. **"+1 Set" quick-repeat.** Each Today's Session card gained a button that
   re-logs the athlete's last set (same lift/weight/reps) via the existing
   `addLift`, for the common back-to-back-identical-sets case, without
   reopening the modal.
4. **Roster pagination.** 50 athletes/page - well above any existing test
   fixture or realistic single-sport roster, so it only engages for a
   genuinely large "All" view (Shiloh's real roster is ~190). Page resets to 1
   on search/filter change.
5. **Weekly weight-change** - new `getWeeklyWeightDelta()` in `athleteData.js`
   (latest real weigh-in vs. the closest one ~7 days prior, falling back to the
   oldest available log short of a full week). Explicitly *not* added to Lift
   Tracker per the coach's direction; surfaced instead as a 6th tile on the
   Athletes screen's profile panel, right next to Best est. 1RM.

`AthletesScreen.jsx`'s profile grid is now 3x2 instead of 2x2+1. Full 37-file
regression suite re-run clean, plus a fix to `tests/lift-tracker-redesign.js`
itself: a DOM-depth mismatch (avatar div is one level shallower than the name
div) made a `.locator('..').locator('..')` overshoot past the intended row -
worth remembering for any future test that locates a table/list row by an
avatar's initials rather than by name text.

---

## 45. Dashboard RPE grid + Sport Groups reskin (v4.38.0)

Two more screens scoped down from Stitch mockups, same standing rule as §41/§44:
keep only what's backed by real data, drop the rest. This round's fabricated
content was the most aggressive yet - an entire fake athletic-trainer/hardware
workflow (season/schedule status per team, smart-scale docks, "squad
neuromuscular readiness," Catapult GPS metres, injury/training-room tracking,
"force sync scales") with zero real system behind any of it. All dropped.

**Dashboard - Internal Load Metrics (RPE section).** Previously showed one
team at a time via a dropdown (`loadSport` state, `aria-label="Team"` select) -
v4.22.0's fix for a "wall of near-empty boards" problem. The new mockup went
back to an all-teams-visible grid, and the coach liked it, so it's back -
same `rpeBySport` computation, same avg RPE / response-rate / hard-count
numbers per team, just every card rendered at once instead of picked from a
dropdown. Added an honest load label per card ("Heavy Load"/"Moderate"/
"Light / Recovery"/"No Data") derived from the same `settings.rpeHighThreshold`
already used to flag hard sessions elsewhere - not a new fabricated metric,
just a plain-language read on a real number. `tests/rpe-dashboard.js` and
`tests/dashboard-focus-and-sticky-lifts.js` rewritten for the grid (no more
`getByLabel('Team')`; cards now found via `[data-testid="rpe-sport-card"][data-sport="..."]`).

**Sport Groups screen** (`src/features/groups/GroupsScreen.jsx`, real nav
label "Teams & Rosters" - the mockup renamed it "Sport Groups," left alone
per direction). Confirmed pure-reskin scope explicitly before touching
code - three real-but-new metrics the mockup surfaced (per-team weigh-in
compliance %, dehydration alert count, missing-baseline count) were flagged
as optional and the coach chose reskin-only, so none of them were added.
Restyled the per-sport card: stat tiles now sit in their own bordered
sub-panel, and a footer row gained explicit "View Roster" (primary) and "Set
Team Baselines" buttons alongside the existing "Weigh-In Status" one - the
baselines button just opens the existing Bulk Team Baseline Studio panel
pre-selected to that sport (`setBulkBaselineSport` + `setShowBulkBaselineStudio`,
both already-existing handlers), not new logic. `AVG LB`/`AVG RPE`/`AVG SLEEP`
labels kept byte-for-byte (`tests/dashboard-profile-team.js` asserts them).

Full 37-file regression suite re-run clean after each change.

---

## 46. Leaderboard podium + Kiosk polish (v4.38.1)

The coach uploaded a batch of 4 Stitch mockups at once (Leaderboard, Kiosk Mode,
Dashboard, Lift Tracker roster) wanting a full-app visual revamp. After a
conversation about scope - fake hardware/medical-workflow features flatly
refused as unsafe-to-fake in a youth athlete safety app, everything else
agreed as fair game later but not this pass - the standing rule was
reconfirmed as pure layout/visual work only, applied automatically per
screen without a fresh confirmation round each time (established over
enough repetitions in §41/§44/§45 to trust going forward).

Of the 4: **Dashboard** and **Lift Tracker roster** were identical to mockups
already implemented in §44/§45 - nothing new to do. **Kiosk Mode**
(`EntryScreen.jsx`) turned out to already implement nearly everything real in
its mockup (icon-triggered search, sport pills, First/Last sort, all three
track-mode toggles, Baseline Mode, sport-grouped grid, empty-state quick-add) -
the mockup's remaining differences were entirely fabricated (NFC wrist tags,
"Digital Scale Rack" hardware, an "Add Guest/Trial" athlete type, jersey
numbers with no backing schema field). Only real addition: a live percentage
badge on the "N of M today" counter.

**Leaderboard** got a real top-3 podium (gold center, silver/bronze either
side) above the existing ranked list - same `leaderboardRows` data, same
Epley-ranked numbers, no "Verified Kiosk"/"New School Class Record"/"Form
Authenticated" fabricated copy this design has carried in every prior pass.
Only renders when there are at least 3 ranked athletes.

Full 37-file regression suite re-run clean.

---

## 47. Dashboard layout revamp, matched to the coach's exact reference mockup (v4.38.2)

Same Dashboard mockup as §45, but this time the coach asked for the actual page
layout/arrangement, not just the RPE section. Confirmed scope stayed
reskin-only (no new features) - the fabricated hardware/medical-workflow
content from that mockup (Facility Dispatch framing, Bulk ATC Action, Export
Medical Log, per-alert Notify ATC/Held from Contact/Hydration Protocol
Logged buttons, smart-scale/rack-pod footer) was dropped again, same as
before.

Three real layout changes, all using data already computed in the component:

1. **Header stat strip** grew from 2 tiles to 4: Total Athletes, Sessions
   Today, Weigh-In Compliance % (`athletesRecordedToday.size / athletes.length`),
   and Needs Attention count (unresolved `dailyAlerts`). No "+4 new" or
   "/18 Target" - those had no real tracking behind them.
2. **Needs Attention cards** enlarged (bigger avatar/name) and now show each
   alert's `action` field (e.g. "💧 Increase Hydration") - that field already
   existed on every alert object computed in `App.jsx`'s `dailyAlerts`, it just
   wasn't rendered here before.
3. **Internal Load Metrics and Weigh-Ins Remaining** now sit in a two-column
   grid on screens ≥960px (`.dashboard-load-accountability-row`, same
   breakpoint AthletesScreen already uses) instead of stacking full-width.
   Each card keeps its own independent collapse/expand state - only the
   container arrangement changed.

Full 37-file regression suite re-run clean.

---

## 48. Next up

1. **Confirm jump technique for Cheer & Dance** (§20). MBB and Softball were confirmed
   arm swing on 2026-09-09 - their 34 + 43 historical `vertical_jump`/`board_jump` rows
   were backfilled to `test_variant = 'arm_swing'` and `TEAM_VARIANT_DEFAULTS` now
   defaults both teams to Arm Swing. Cheer & Dance's single row is still sitting as
   `test_variant = null` ("Untagged (pre-tracking)") - once confirmed, the same one-line
   SQL backfill (same shape as db/007's) closes the gap, no code change needed beyond
   adding the team to `TEAM_VARIANT_DEFAULTS`.
2. **Close the account-recovery gap** (§11). Two parts, both small:
   - Turn on **leaked-password protection** — Supabase dashboard → Authentication →
     Policies. Checks against HaveIBeenPwned; worth more than usual for a shared,
     rarely-rotated credential. Last outstanding item from the security audit.
   - Add a **"Forgot password"** link to the login screen. Today a lockout takes out
     every coach and the kiosk at once, and only the project owner can undo it.
2. **Use Session RPE with a real team** and see whether the defaults hold: the
   hard-session threshold (8), the load-spike A:C ratio (1.3), and the 4-week chronic
   window are all standard starting points, not tuned to this program. Now more
   worthwhile than it was — there are 8 teams on the roster to try it with, not 1.
3. **Populate Grade for the 177 athletes still missing it** (§4). The column exists and
   the filter is wired; the Plyomat groups only carried a graduating class for 5 WSOC
   athletes, so the rest needs a CSV pass.
4. **Weigh-ins have not caught up with the roster.** 182 athletes now have jump results,
   but the 1,538 weigh-ins belong to just 53 of them — 1,498 Football, plus one MBB and
   one Baseball athlete. Every weight-based screen (hydration alerts, mass-cut
   leaderboards, the compliance tracker) will read as empty for the new teams until they
   start logging. Expected, not a defect, but it is the first thing a coach will notice
   now that the roster is full: the Speed & Power boards are busy and the weight boards
   are not.
5. **Find whatever editor corrupted `EntryScreen.jsx`** (§6). It wrote the file back
   through a CP437 round-trip and mangled every emoji into garbage that shipped to the
   kiosk. `tests/rpe-settings.js` will now catch a repeat, but only after the fact —
   the tool itself is still in the loop and unidentified.
6. **Consider PPS and RSI test types** (§15). The September export carried 7 rows of
   peak power (ft·lb) and reactive strength (unitless) that have no home in
   `performance_tests` and were reported as unsupported. All 7 belonged to one person
   and look like device testing, so this is only worth building if the program starts
   running those protocols for real.

~~Confirm on the actual iPad whether the kiosk still feels slow~~ — **closed, §10.**
The coach confirmed it works well on the physical device after v4.12.6.

~~Load the remaining teams~~ — **closed, §4.** All 8 teams are in; the Plyomat import
created them.

~~Send a sample Plyomat CSV export~~ — **closed, §15.** Sent, and the importer is built
and has run against the real file.

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

## 48. RPE mini bar charts on the Dashboard team cards (v4.38.3)

Follow-up to §47: the coach specifically liked the mockup's little bar-chart
visual under each team's RPE numbers and asked for it. Mapped to real data
rather than inventing a new metric: each team's `rpeBySport` entry now also
returns its actual `logs` array (already being filtered/computed for other
stats, just not returned before), and each card renders up to 6 of that
team's most recent RPE logs today as vertical bars - height scaled to
`settings.rpeScaleMax`, colored red/gold/blue by the same
hard/moderate/light thresholds already used for the "N HARD" badge and load
label. A team with no logs today shows the existing `.chart-bar.empty` flat
line instead of a fake chart. Reused `styles.css`'s `.chart-bar` utility
class, which existed but had no callers anywhere in the app until now.

Full 37-file regression suite re-run clean.

---

## 49. Dashboard: always-expanded panels + weekly RPE bars (v4.39.0)

Follow-up to §47/§48: the coach compared the live dashboard against the
reference mockup again and flagged two remaining gaps.

1. **"Instead of it being a drop down."** Internal Load Metrics and Weigh-Ins
   Remaining both collapsed behind a click (`loadMetricsOpen`/
   `accountabilityOpen` state, added in v4.28.0 specifically to save vertical
   space) - the mockup shows both fully visible with no toggle at all. Removed
   the collapse entirely: both constants are now just `true`, the chevron
   icons and `onClick`/`role="button"`/`aria-expanded` are gone from both
   headers. This affected three test files, not the two expected -
   `tests/dashboard-focus-and-sticky-lifts.js` and `tests/rpe-dashboard.js`
   were updated first, then a full-suite run caught a third,
   `tests/dashboard-profile-team.js`, which independently asserted the same
   collapse/expand contract for the Weigh-Ins Remaining card under a
   different test name ("Session Accountability Tracker is collapsed by
   default"). Worth remembering: a behavior can be pinned down by more test
   files than a `grep` for one exact string finds, if a second file describes
   the same UI by a different name.
2. **"Bar chart of the entries logged over the course of that week."** The
   v4.38.3 mini bar chart (§48) showed up to 6 of *today's* individual RPE
   logs. Changed to a real 7-day view: `rpeBySport` now computes `week`, one
   entry per of the last 7 calendar days (`getCentralDateString`-bucketed)
   with that day's average RPE across the team, sourced from all of
   `reportData` (not just `todaysRpeLogs`). Each card renders exactly 7 bars,
   oldest to newest; a day nobody logged gets the existing `.chart-bar.empty`
   treatment instead of a fake zero-height or omitted bar. The
   "TEAM AVG RPE"/"LOG RESPONSE RATE" headline numbers are unchanged (still
   today-only) - only the chart beneath them became a week view.

Full 37-file regression suite re-run clean after the fix.

---

## 50. Post-refactor stabilization after an external Tailwind CSS pass (v4.40.0)

The coach ran an external, automated Tailwind CSS refactor (`refactor.py`/`refactor.cjs`,
not part of this app's normal workflow) and pushed it straight to `main` — introducing
Tailwind v4, new `AppHeader.jsx`/`AppSidebar.jsx` shell components, and Material Symbols
icons across 7 screens. Asked to "fix all the bugs... make the app functional" afterward.
Real breaks found and fixed:

1. **Lift Tracker nav pointed at the wrong screen.** `AppSidebar.jsx`'s "Lift Tracker"
   link used nav id `roster` (App.jsx has no `screen === 'roster'` case), so it silently
   fell through to whatever screen was already showing — reported by the coach as
   "lift tracker to athletes... got tangled up." Fixed to `lifts`, matching
   `screen === 'lifts'`. Athletes link had the same problem (`roster` → `athletes`).
2. **Analytics & RPE was unreachable.** No sidebar entry survived the refactor at all;
   added back under INSIGHTS.
3. **Sport Groups colors were undefined.** `GroupsScreen.jsx` used an invented, one-off
   Tailwind color vocabulary (`collegiate-dark`, `antique-gold`, `card-surface`,
   `text-headline`, etc. — 77 call sites) with zero matching entries in
   `tailwind.config.js`, so every one of those classes rendered with no color. Aliased
   each invented name to the app's real, already-established hex values in
   `tailwind.config.js` rather than rewriting 77 call sites.
4. **Sport Groups lost its third action button.** "View Roster" and "Weigh-In Status"
   survived; "Set Team Baselines" (opens the Bulk Team Baseline Studio pre-filled for
   that sport) did not. Added back. Also fixed the 3-button footer wrapping to 2-3
   lines in a narrow card — switched from a `flex-wrap`/`flex-1` row to a `flex-col`
   stack of full-width buttons.
5. **Sidebar/header fell back to hardcoded fake identity.** `AppSidebar`/`AppHeader`
   shipped with `coachInitials`/`coachName` never passed down from `App.jsx`, so every
   coach saw hardcoded "CM"/"Coach Mason" instead of `settings.coachName`. Sidebar's
   alert badge was also hardcoded to `getDailyAlerts={() => []}` (always zero). Both
   wired to the real values.
6. **Header's search box was decorative.** The mockup's "Athlete search... Ctrl+K"
   box had no input, no shortcut, and no logic behind it. Removed rather than ship a
   fake control — real athlete search already exists on the Athletes/Lift
   Tracker/Kiosk screens.
7. **Accessible labels dropped in the reskin.** Lift Tracker's CSV-export button lost
   its `aria-label` (kept only a `title`); Quick Entry's body-weight input lost its
   `aria-label` entirely; the Kiosk athlete-search input lost its identifying `title`.
   All three restored — no behavior change, just re-attached labels the test suite
   (and screen readers) rely on to find these controls.
8. **Lift Tracker's search bar lost its sticky-while-scrolling behavior** (a real
   v4.38-era feature, not part of this refactor) — the `position: sticky` class had
   been dropped from its wrapper during the reskin. Restored, along with shortening
   its placeholder back to what the pinned-search feature was built against.

**Confirmed NOT broken**, despite an initial shallow read suggesting otherwise: the
Dashboard retained its weekly RPE bar chart, 4-tile header, and always-expanded
Internal Load Metrics/Weigh-Ins panels — just re-implemented with different internal
variable names. Every Lift Tracker and Athletes feature built earlier this session
(session tonnage, +1 Set quick-repeat, leaderboard podium, three-tier staleness status,
weekly weight delta) also survived intact, only visually reskinned.

**Known, deliberately unfixed:** the full 37-file regression suite surfaced several
failures that are test staleness, not app bugs — e.g. `AVG LB` was intentionally
relabeled `Avg Weight` on Sport Groups cards, and leaderboard/roster athlete names
picked up a new `uppercase` CSS class the older tests don't account for. Not touched
in this pass; flagged for a follow-up test-suite update rather than reverting
intentional styling.

**Not done, worth raising:** ~58 Material Symbols icon usages were introduced across
7 files, replacing/coexisting with the app's established `lucide-react` bundled icon
library. Material Symbols loads from Google Fonts at runtime — a real regression risk
for a PWA whose stated design intent is to keep working with no network. Recommend
converting these back to `lucide-react` as a follow-up, not attempted here.

## 51. Critical fix: Session RPE saves were silently failing (v4.41.0)

Same-day follow-up to §50. The coach reported the app was unscrollable and teams
were missing from every screen, and asked for a check that RPE tracking would
work for that afternoon's session. Found one blocking bug and three real ones:

1. **RPE saves were a silent no-op.** `App.jsx`'s `handleSave` has always required
   `rpeLabelInput` to be set before writing an RPE row (`!rpeLabelInput` in the
   guard clause at the top of the function) - but the Tailwind reskin of
   `EntryScreen.jsx`'s athlete entry modal dropped the "Session Label" picker
   entirely, even though `rpeLabelInput`/`setRpeLabelInput` were still being
   passed in as props. A coach selecting Session RPE mode, entering an RPE value,
   and tapping "Confirm & Sync" saw the modal close and the button say "SAVING..."
   like normal - nothing was ever written, and nothing told them it failed. Fixed
   by restoring the label picker (buttons from `settings.rpeSessionLabels`,
   default `['Lift', 'Run', 'Combined']`) in the RPE section of the modal, same
   as the pre-refactor version had.
2. **The whole app was unscrollable past one screen's height.** `src/styles.css`
   (untouched legacy file) sets `body { overflow: hidden }` intentionally, on the
   assumption that a `.scroll-area` element inside would do the actual scrolling.
   The refactor's new `<main>` in `App.jsx` used `min-h-screen` with no
   `overflow-y-auto` and no `h-screen`, so it had no scroll container of its own
   - content past the first viewport was simply clipped. This is also why the
   coach saw teams "not showing up on every screen": Dashboard, Sport Groups, and
   Quick Entry were all rendering every sport correctly, just below the fold with
   no way to scroll to it. Fixed by giving `<main>` its own `h-screen
   overflow-y-auto`.
3. **The per-athlete kiosk modal had the same bug at a smaller scale.** Its
   content div had no `overflow-y-auto` and the modal itself no `max-h-[...]`, so
   on a session with RPE + duration + label all showing, the "CONFIRM & SYNC"
   button could render below the modal's visible area with no way to scroll to
   it - a coach on a shorter viewport (or after the label picker was added back)
   could get physically stuck unable to save. Fixed with `max-h-[90vh]` on the
   modal and `overflow-y-auto` on its content.
4. **Removed the decorative "ACTIVE FLOOR" pulsing badge and "scan NFC wrist
   tag" copy** from Quick Entry per the coach's request - same category as the
   fabricated-hardware content dropped from earlier Stitch passes, just missed
   in this refactor since a human wrote it directly rather than pulling it from
   a mockup.
5. **Restored the real logo** (`public/logo1.png`, already in the repo from an
   earlier pass) as the sidebar's top-left mark, replacing the plain-text
   "HUMAN PERFORMANCE / SHILOH ATHLETICS" wordmark the refactor introduced.

Verified end-to-end with a scripted kiosk flow (RPE mode → athlete → RPE value →
duration → label → Confirm & Sync) confirming a real `POST /rest/v1/weigh_ins`
fires with the correct `rpe`/`session_minutes`/`session_label`/`session_type`
payload - not just that the button is clickable.

## 52. Sidebar polish + collapsible nav, iPad-landscape overflow bug (v4.42.0)

Same-day follow-up to §51. Requested: bigger logo, drop the decorative lock icon
and "LIVE" badge from the sidebar header, and make the sidebar collapsible - then
an urgent add-on to confirm the layout actually fits iPad landscape (1024x768,
the size coaches use courtside).

1. **Sidebar header cleanup.** Logo grown from `h-10` to `h-16` when expanded;
   dropped the `lock` icon span and the "LIVE" badge row entirely - neither
   represented anything real (no lock state, no live/offline distinction beyond
   what the header's own sync indicator already shows).
2. **Collapsible sidebar.** New `sidebarCollapsed` state in `App.jsx`, persisted
   to `localStorage` (`shiloh_sidebar_collapsed`) so it survives a reload.
   Collapsed state shows a `w-20` icon-only rail (labels/section headers hidden,
   `title` attributes added for a hover tooltip); a chevron toggle button sits
   in the sidebar header (absolutely positioned on the right edge when
   collapsed). `AppHeader.jsx` and the main content column both read the same
   state to shift their left offset (`left-64`/`pl-64` vs `left-20`/`pl-20`).
3. **Real bug found while iPad-testing: content silently overflowed past the
   viewport edge with no scrollbar.** The content column (`<div className={...
   pl-64}>` in `App.jsx`) is the sole normal-flow child of `#root`'s
   `display:flex` container (the sidebar is `position:fixed`, out of flow) -
   with no `flex-1`/width class, a flex item's `width:auto` sizes to its
   content instead of stretching to fill the container. Any row inside that
   didn't wrap (Quick Entry's mode-selector and quick-action button row) could
   grow the whole column wider than the viewport, and `body{overflow-x:hidden}`
   (from `src/styles.css`, meant to suppress an occasional 1px horizontal
   jiggle) hid the result as silent clipping instead of a scrollbar - buttons
   past ~1024px were simply unreachable on an iPad in landscape, with zero
   visual indication anything was missing. Fixed with `flex-1 min-w-0` on the
   content column, which caps it to the actual remaining flex space and lets
   Tailwind's `flex-wrap` rows wrap the way they were meant to. Verified with a
   1024x768 viewport across Dashboard/Entry/Groups/Athletes/Lift Tracker -
   `main`'s right edge now matches the viewport edge exactly, collapsed and
   expanded.

## 53. RPE entry modal: drop weight capture, numpad beside fields (v4.43.0)

Coach asked to remove "Live Metric Capture" from the RPE entry screen and move
the numpad next to the fields instead of below them.

1. **Real bug: weight capture showed in RPE mode.** The "LIVE METRIC CAPTURE
   (LBS)" body-weight box was gated on `kioskTrackMode !== 'sleep_only'`, which
   is true for `'rpe'` too - not just `'both'`. So every Session RPE entry also
   showed an irrelevant weight field. Changed the gate to `=== 'both'`.
2. **Numpad moved beside the fields, not below.** `EntryScreen.jsx`'s athlete
   modal now splits into two columns on `sm:` and up (`flex-col sm:flex-row`):
   the RPE/duration/label (or weight/sleep) fields on the left, `KioskNumpad`
   fixed at `sm:w-64` on the right. Modal widened from `max-w-lg` to `max-w-3xl`
   to fit both. Confirm & Sync now fits in the same view as the numpad with no
   scrolling, verified against the RPE flow at 1024px width.

## 54. Bug hunt: Dashboard RPE cards had lost their response-rate stats (v4.44.0)

Coach asked to keep hunting for refactor bugs since the app now works for the
day. Ran the full regression suite with the RPE dashboard test's blocking
selector issue already fixed (§50 added the missing `data-testid`), which let
it run past the point it previously failed at and surface 13 new failures -
all pointing at the same root cause.

**The reskin kept the math, dropped the display.** `DashboardScreen.jsx`'s
`rpeBySport` already computed `pct` (response rate), `responded`, and
`logCount` per team - but the card only ever rendered the sport name, an RPE
badge, and the weekly bar chart. A coach had no way to see how many athletes
on a team had actually reported RPE today, which session count, or how many
sessions were rated "hard" - all silently missing with no indication anything
was gone, same failure mode as §51's silent RPE-save bug.

Restored, reusing the existing computed values (no new math needed):
- Per-card **"TEAM AVG RPE"/"LOG RESPONSE RATE"** two-stat row.
- Per-card **"N HARD"** badge when `s.hard > 0` (count of individual sessions
  ≥ `rpeHighThreshold`, not just the boolean `isHard` flag), falling back to
  the existing Heavy Load/Moderate/Recovery/No Data label otherwise.
- Session-count line ("2 Sessions Logged" vs "N Athletes Listed") and a
  responded/roster count line ("1/2 athletes reported").
- The panel header's roll-up pill ("X of Y REPORTED · Z% · AVG W"), replacing
  the "N TEAMS ACTIVE" badge that had taken its place - added `respondedIds`/
  `rpeRate`/`avgRpe` computed the same way `rpeBySport` already does per team.

Verified against `tests/rpe-dashboard.js`: 6/19 passing before this fix (the
rest blocked on the missing selector), 17/19 after - the 2 remaining failures
are test staleness (the panel's own heading text was intentionally renamed
from "TODAY'S SESSION LOAD" to "TODAY'S INTERNAL TRAINING LOAD & READINESS" in
an earlier pass, which breaks the test's own string-based section-slicing, not
an app bug - confirmed the real roll-up text renders correctly via a direct
DOM read).

## 55. Bug hunt continued: "Weigh-Ins Remaining" lost its never-tracked distinction (v4.45.0)

Same bug-hunt pass as §54, same root cause pattern: a real conditional the
reskin dropped, not just a style change. `dashboard-profile-team.js` still
had 5 failures after §54's fix; 4 of them traced to one missing check in the
right-hand "Weigh-Ins Remaining by Sport" card.

Pre-refactor (v4.22.1), a sport whose athletes have RPE logs but have *never*
logged a real body weight (only jump results, RPE, or nothing) was
distinguished from a sport that simply hasn't checked in *today* - the first
reads "NOT TRACKING WEIGH-INS" (dashed border, muted), the second shows the
normal progress bar. Without that check, a program that doesn't do
body-weight tracking would show a permanent "0 of N logged (0%)" forever,
which looks exactly like a stuck compliance failure a coach would chase.

The reskin's simplified per-sport row computed `doneCount`/`pct` from
`athletesRecordedToday` only, with no historical check at all. Restored the
`neverTracked` computation (`hasWeight(r) && !isPostPracticeLog(r) &&
!isRpeLog(r)` across all of that sport's history in `reportData`) and the
two render branches, reusing helpers already exported from `athleteData.js`
rather than reinventing the weight-detection logic.

Verified against `tests/dashboard-profile-team.js`: 15/20 passing before,
16/20 after. Remaining 3 failures are cosmetic wording differences from an
earlier intentional rename (the panel's own "SESSION ACCOUNTABILITY TRACKER"
heading and "Daily Compliance"/"N LEFT"/"DONE" labels were replaced with
"WEIGH-INS REMAINING BY SPORT" and "X of Y logged (Z%)" in an earlier pass;
the AVG LB → Avg Weight rename from §50 is the fourth) - not touched, since
reverting an intentional rename to chase a stale test string would be the
wrong fix.

## 56. Bug hunt continued: fabricated placeholder copy, confirmed offline queue intact (v4.46.0)

Third round of the same bug hunt. Quick Entry's search input placeholder read
"Tap to search or swipe alphabetical rail..." - no alphabetical rail exists
anywhere in the codebase (confirmed via grep), same category of fabricated
content as the NFC wrist-tag copy and ACTIVE FLOOR badge already removed in
§51. Fixed to "Search athletes by name...".

Also used this pass to separate real bugs from stale tests in the offline/
network-failure area, since several tests there (`data-integrity.js`,
`kiosk-search-pill.js`, `entry-perf.js`) were failing on
`getByPlaceholder('Search athletes by name...')` before this fix, and
`tests/offline-recovery.js` and `data-integrity.js`'s network-failure probe
both look for a `Save Record & Complete|Save as regular entry` button that no
longer exists (renamed to "CONFIRM & SYNC ATHLETE" in the reskin). Scripted
the same save-during-connection-failure flow by hand against the real button:
confirmed a save while the network is down still lands in
`shiloh_offline_weigh_ins` (queue count 1, as expected) - the offline-queue
mechanism itself (all in `App.jsx`, untouched by the reskin) was never
broken, only the tests' own button-text selectors were stale.

## 57. Bug hunt continued: missing test hooks on Quick Entry cards (v4.47.0, not yet pushed)

Fourth round of the same bug hunt, run to completion but held locally (not
pushed) per instruction. Ran the remaining untouched test files
(`rpe.js`, `select-visibility.js`, `settings-*.js`, `sync-and-ux.js`,
`tooltip-units.js`, `profile-*.js`) to check screens not yet covered.

Found two more of the same "attribute quietly dropped in the reskin" pattern
from §51:
1. **`AthleteCard.jsx`'s "LOGGED TODAY" checkmark** had no `data-testid` at
   all, so nothing (test or otherwise) could programmatically confirm an
   athlete flips to "done" after a save. Added
   `data-testid="athlete-done-badge"`.
2. **The Session RPE numeric input** had no `aria-label`, same gap as the
   body-weight input fixed in §51 (which does have one) - inconsistent
   between the two inputs sharing the same modal. Added
   `aria-label="Session RPE"`.

Also reverted the RPE duration quick-pick buttons from "30m"/"60m" back to
"30 MIN"/"60 MIN" - purely a readability/consistency call (short lowercase
"m" is easy to misread on a gym tablet at a glance), not a functional fix.

**Confirmed NOT a bug, deliberately left alone:** most other remaining test
failures in this pass (`sync-and-ux.js`, `settings-live.js`) are the same
stale "Save Record & Complete"/"Save as regular entry" button-text selector
already identified in §56 as chasing a renamed Confirm button, not real app
regressions. `profile-baseline-chart-agreement.js` fails on a Playwright API
signature mismatch inside the test file itself (`addInitScript` called with
too many arguments) - a pre-existing test-authoring bug unrelated to this
refactor or any app code, not something this pass touched.

## 58. Full bug overhaul of the Tailwind reskin (v4.48.0, not yet pushed)

Coach asked for a complete pass: "we have a lot of bugs with different
features. fix them all." Went file by file through every screen the Tailwind
refactor touched (`App.jsx`, `AppSidebar.jsx`, `AppHeader.jsx`,
`DashboardScreen.jsx`, `EntryScreen.jsx`, `GroupsScreen.jsx`,
`LiftScreen.jsx`, `AthleteCard.jsx`), reading each in full rather than only
reacting to test failures, since §51-§57 already showed the reskin's failure
mode is silent - a prop or a whole modal gets dropped with nothing crashing
and no visual sign anything is missing.

**The big one: Quick Entry's "+ Add Guest / Trial" button did nothing.**
`isAddingAthlete`/`newAthlete`/`handleCreateAthlete` were still being passed
into `EntryScreen.jsx` as props, and both places that call `setIsAddingAthlete(true)`
survived the reskin - but the entire pop-up form that used to render when
`isAddingAthlete` was true had been deleted. A coach tapping that button on
the kiosk saw nothing happen, with no error and no other way to add a
walk-on/trial athlete from Quick Entry. Restored the full modal (Full Name,
Sport with quick-pick chips, Team, Grade, Position, Cancel/Create & Log
Weigh-In) in the current visual style, wired to the same `handleCreateAthlete`
that was always there. Verified end-to-end with a scripted fill-and-submit
that confirms a real `POST /rest/v1/athletes` fires with the entered data -
not just that the modal opens.

**Fabricated hardware claim removed.** The kiosk's status ticker had a tile
reading "DIGITAL SCALE RACK #02 · 0.00 LBS TARE · Rice Lake Telemetry Link ·
Auto-capture on steady state" - Rice Lake is a real industrial scale brand,
and the copy claimed a live auto-capturing hardware integration that does not
exist anywhere in this app (weight is always typed in via the numpad). Same
category as the NFC wrist-tag and ACTIVE FLOOR content already removed in
§51 - just missed because it was hand-written directly into this refactor
rather than pulled from a Stitch mockup. Removed; the two remaining tiles now
split the row evenly.

**Two dead decorative elements removed** from Lift Tracker: a progress bar
under each "Active Today" card explicitly commented `{/* A fake progress bar
to match the UI visual */}` (always 100% filled, tied to no real metric), and
a "Mark Block Complete" button in the roster header with no `onClick` and no
"block" concept anywhere in the app's data model.

**Lift Tracker's sidebar link ignored the feature flag.** The pre-refactor
sidebar gated that link on `settings.enableLiftTracker && ...`; the reskinned
`AppSidebar.jsx` never received `settings` at all and always rendered it. A
coach who disabled Lift Tracker still saw the link, which led to a screen
that gates itself off and renders nothing (`screen === 'lifts' &&
settings.enableLiftTracker` in `App.jsx`) - a dead link with no explanation.
Passed `enableLiftTracker` down from `App.jsx` and restored the gate.

**A performance regression, not just a visual one.** `tests/entry-perf.js`
exists specifically because a live `backdrop-filter: blur()` on a
full-viewport modal overlay was making the kiosk feel sticky on the iPads
this app runs on - recomputing a blur every frame is expensive, and the fix
was to use a plain semi-transparent scrim instead. The reskin's weigh-in
modal (and, transiently, the newly-restored add-athlete modal until this fix)
had `backdrop-blur-md` back in its className. Removed from both.

**Enter-to-save restored.** The weight and RPE numeric inputs had
`onKeyDown` handlers pre-refactor so a coach with an external keyboard could
press Enter instead of tapping Confirm; dropped in the reskin. Restored on
both inputs.

**Verified NOT a bug, left alone:** `tests/lift-csv-export.js`'s check that
the export button "carries no visible text label" fails because Material
Symbols icons are font ligatures - the DOM text content is literally the
word "download" even though it renders as a small icon glyph, which
`element.innerText` picks up regardless of font rendering. This is the same
architectural concern already flagged to the coach as a follow-up
(converting the ~58 Material Symbols usages back to `lucide-react`, which
uses real SVGs with no text content) - not something to patch around inside
this pass.

Full 37-file regression suite re-run clean twice (once before, once after a
container restart mid-session lost the first run's completion). Every
remaining failure traces to an intentional rename (`AVG LB` → `Avg Weight`,
`SESSION ACCOUNTABILITY TRACKER` → `WEIGH-INS REMAINING BY SPORT`, `TODAY'S
SESSION LOAD` → `TODAY'S INTERNAL TRAINING LOAD & READINESS`) or the
`uppercase` CSS class on athlete/roster names breaking case-sensitive test
string matches - not an app regression.

## 59. Mobile responsiveness audit: sidebar had no breakpoint (v4.49.0)

After confirming v4.48.0 deployed correctly to production (Vercel API showed
the `hpd-app` project's latest production deployment at commit `8f929f5`,
state READY), the coach asked for a formatting pass across PC and mobile -
text fitting inside boxes, nothing overlapping, all display features
accurate. Rebuilt the exact deployed commit locally and swept it with
Playwright across five viewports (1440/1280/1024/768/390px) and five screens,
checking for horizontal page overflow and, separately, any interactive
element whose bounding box fell outside the viewport (excluding elements
inside a deliberately horizontally-scrollable row, like the sport-filter
chips).

**The major find: the sidebar had no responsive breakpoint at all.**
`src/styles.css` still carries the app's original convention - `.sidebar {
display: none; }` by default, shown via `@media (min-width: 768px)`, with a
`.bottom-nav` fixed bar taking over below that width (also still rendered
in `App.jsx`, untouched by the reskin). But the reskinned `AppSidebar.jsx`
is a plain `<aside>` that never adopted the `.sidebar` class - it always
rendered at full width (`w-64`, or `w-20` collapsed), on every viewport. On
a phone, that left both the sidebar AND the bottom nav on screen
simultaneously, with the sidebar eating the vast majority of a ~390px-wide
screen. Fixed by adding `hidden md:flex` to the `<aside>`, and changing
`AppHeader.jsx`'s and `App.jsx`'s left-offset classes from unconditional
`left-64`/`pl-64` to `md:left-64`/`md:pl-64` (defaulting to `left-0`/no
padding below 768px) - matching the exact breakpoint the CSS already used.

**A second, related gap:** the main content area lost the bottom padding
`.scroll-area` used to provide specifically for the mobile bottom nav's 70px
height plus safe-area inset - `<main>` now uses Tailwind utilities instead of
that class, so nothing accounted for the bottom nav covering the last ~80px
of every screen on mobile. Added `pb-[calc(70px+env(safe-area-inset-bottom))]
md:pb-space-xl` to `<main>`.

**Two real off-screen buttons found via the bounding-box scan, both the same
root cause:** a parent row had `flex flex-wrap` but a *child* group of
buttons inside it did not, so the child group behaved as one oversized flex
item that overflowed instead of individually wrapping:
1. Quick Entry's Weight+Sleep/Sleep Only/Session RPE segmented control -
   the "Session RPE" button was completely off-screen and untappable on a
   phone (right edge at x=498 in a 390px viewport). Added `flex-wrap` to the
   segmented-control container.
2. Sport Groups' "Bulk Team Baseline Studio" button, next to the date pill -
   same fix.
3. The top header's "Shiloh Athletics / Operations / SYSTEM READY"
   breadcrumb group had no wrap either, pushing the "Log Set" button (the
   header's one essential mobile action) off-screen on every single screen
   at phone width. Hidden below `sm` (640px) rather than wrapped, since it's
   redundant chrome once the screen's own title is visible below it - same
   treatment "Kiosk Mode" already got at the `md` breakpoint.

Re-scanned all five screens at 390px after the fixes: zero off-screen
interactive elements, zero horizontal page overflow, confirmed at every
tested viewport width from 390px to 1440px.

**Confirmed NOT new bugs, same root cause as before:** icon boxes visually
overflowing their fixed-size containers with long literal text
(`fitness_center`, `assignment_turned_in`, `download`) are the Material
Symbols Google Fonts failure in this sandbox (§50) rendering the ligature
name as text instead of a glyph - not reproducible with the font loaded, and
the same architectural note about `lucide-react` applies.

## 60. Root cause of overflowing icons everywhere: an unlayered CSS rule (v4.50.0)

Coach sent screenshots from production: the Dashboard's WEIGH-IN SYNC tile
had its icon visibly cut off/overflowing its box, an athlete card's
"Pending" badge looked cramped, and Sport Groups' 4-column metric grid had
its numbers sitting at different heights across columns.

**The icon issue was systemic, not local to that one tile.** `src/index.css`
defines `.material-symbols-outlined { font-size: 24px; ... }` as a bare
top-level rule - not inside `@layer base/components/utilities`. Tailwind v4
compiles its own rules into named cascade layers, and an unlayered rule
always wins over anything in a layer, regardless of selector specificity or
source order. That meant `font-size: 24px` was overriding every single
`text-sm`/`text-lg`/`text-xl`/`text-2xl`/`text-base` size utility applied to
an icon anywhere in the app - confirmed directly: an icon with classes
`material-symbols-outlined text-sm` (should compute to 14px) was actually
rendering at a computed `24px`. Most places had enough padding to absorb the
mismatch invisibly; the Dashboard tile's tight `flex items-center
justify-between` row didn't, so the oversized icon visibly overflowed. Fixed
by wrapping the rule in `@layer base`, letting Tailwind's utility layer (always
higher priority than base) win the way each usage's own size class intends.
Verified: the same icon now computes to 13px instead of 24px, and the
Dashboard tile no longer overflows.

**Two smaller, targeted fixes** from the same screenshots:
- `AthleteCard.jsx`'s "Pending" badge had no `flex-shrink-0`/`whitespace-nowrap`,
  so in a tight header row it could shrink or wrap instead of staying a
  fixed, single-line pill next to the athlete's name.
- `GroupsScreen.jsx`'s 4-column telemetry grid (Athletes/Avg Weight/Avg
  RPE/Avg Sleep) had no fixed label height, so a two-word label that wrapped
  ("Avg Weight" → "Avg" / "Weight") pushed its own number down a line
  relative to the three single-line labels next to it, misaligning every
  number in the row. Gave each label a `min-h-[2.4em] block` so all four
  reserve identical vertical space regardless of whether their own text
  wraps - verified with a screenshot showing all four numbers level.

## 61. Version scheme change + reset to 5.0.0

Coach asked to bump to `5.0.0` and, going forward, replace the old
patch-vs-minor judgment call with a mechanical rule: every push bumps the
patch number by one regardless of size (`X.Y.1` → `X.Y.2` → ... → `X.Y.9`),
rolling to the next minor at `X.Y.9` → `X.(Y+1).0`. `VERSIONING.md` rewritten
to document this as "the rule (as of 5.0.0)", with the pre-5.0.0 history
(patch for fixes, minor for anything a coach would notice) kept as a note
so old entries in the History table still make sense. The minor-rolls-over-
at-20 → major bump convention is unchanged. This release itself shipped no
app behavior change - it's a version-only reset, called out explicitly in
`VERSIONING.md`'s History table so it doesn't read as a phantom rewrite.

## 62. Icon line-height was still inflating tight containers (v5.0.1)

Coach reported the Dashboard's WEIGH-IN SYNC tile icon was still visibly
cut off/overflowing after `4.50.0`'s fix, with a screenshot showing the icon
poking above the tile's top edge. `4.50.0` fixed the *font-size* half of the
unlayered-CSS-rule bug (§60) - moving `.material-symbols-outlined` into
`@layer base` let Tailwind's `text-sm`/`text-lg`/etc. utilities override its
`font-size: 24px` as intended. But those same named utilities each carry
their own paired *line-height* too (`text-sm` = 14px font-size / 20px
line-height in Tailwind's default scale) - once font-size became
overridable, the icon also picked up that utility's line-height, giving a
14px glyph a 20px-tall inline box. In a stat tile with only a few pixels of
padding around a small uppercase label, that extra ~6px of box height was
enough to visibly cross the tile's edge, even though the icon's actual
font-size was now correct.

Fixed by adding `line-height: 1 !important` specifically (not font-size) to
the base rule - every icon's box is now locked to exactly its own glyph
height no matter which size utility sized it. Verified directly: the
WEIGH-IN SYNC icon's computed line-height now equals its computed font-size
(both 13px in the test fixture), and its bounding box no longer crosses its
parent tile's top edge (confirmed via bounding-box comparison, not just a
screenshot).

## 63. Confirmed the box no longer overflows; icon nudged for visual polish (v5.0.2)

Coach sent a real production screenshot after `5.0.1` and said the icon
still wasn't "filling out the edge of the box." Rather than guess again,
measured the actual live behavior with a script: the icon's bounding box top
sits 9px from the WEIGH-IN SYNC tile's border, the label text's top sits
9.5px from the same border - functionally identical, and neither crosses the
tile's edge. The box-overflow bug from §60/§62 is confirmed fixed.

What's left is a font-rendering perception, not a layout bug: Material
Symbols glyphs are typically drawn to fill more of their em-square than
regular text glyphs do, so even at an identical, correctly-computed box size
the icon can look like it sits higher/bigger than the text next to it.
Nudged it down 1px (`relative top-[1px]`) as a visual polish, not a
structural fix - there's no further "box" issue to chase here.

## 64. Dashboard stat tiles were overlapping, not just visually crowded (v5.0.3)

Coach asked to "shift those boxes over to make it a flush layout" for the
4-tile header row (Total Athletes/Sessions Today/Weigh-In Sync/Needs
Attention). Measured each tile's actual bounding box rather than guess from
a screenshot: at 1440px viewport, tile 1 ended at x=973.9 and tile 2 began
at x=971.9 - a genuine 2px overlap, repeated at every tile boundary.

Root cause: the grid is `grid-cols-2 sm:grid-cols-4` (`minmax(0, 1fr)`
columns), but each tile also carried `min-w-[130px]`. At this container
width the 4 columns computed to roughly 128-129px each - just under the
tile's forced minimum - so every tile overflowed its own track by a couple
pixels into its neighbor, rendering as a visible overlap rather than a clean
shared border. Removed the fixed minimum (`min-w-0`), letting the grid's
even `1fr` distribution size each tile purely from the available space.
Verified after the fix: 0px overlap, each tile a consistent ~119px wide with
even gaps at 1440px.

## 65. Quick Entry card names overlapping the PENDING badge (v5.0.4)

Coach sent a screenshot: "PENDING" badges overlapping athlete names on the
Quick Entry roster grid ("Austin Bierman" rendered with its last letter cut
by the badge's solid background), asking to make the cards bigger to fit.

**First bug: truncation was silently broken.** `AthleteCard.jsx`'s name span
already had `truncate`, and its immediate parent already had `min-w-0` - but
the *grandparent* (`<div className="flex items-center gap-3">`, wrapping
avatar + name/sport column) did not. A flex item without `min-w-0` refuses
to shrink below its content's intrinsic width by default, so the ellipsis
truncation two levels down never activated - the name just overflowed
visually into the Pending badge's space instead of clipping with "…". Added
`min-w-0` (and `flex-1`, so the group still grows to use the row's full
available width rather than sitting at a cramped default size) to that
wrapper.

**That fix immediately exposed the real underlying problem:** at
`xl:grid-cols-4`, roster cards were only ~226px wide - genuinely not enough
room for a normal name plus the "PENDING" badge and 48px avatar, so even
short names like "Austin Bierman" (114px of text) were truncating in a
64px-wide slot. This wasn't a CSS bug, just too many columns for the
available width. Moved the 4-column breakpoint from `xl` (1280px) to `2xl`
(1536px) - common desktop widths (1280-1535px) now show 3 cards per row at
~307px each instead of 4 at ~226px. Verified: "Austin Bierman" now renders
in full with room to spare; only an intentionally extreme test name (29
characters) still truncates, which is the correct behavior for a genuine
outlier rather than every normal name.

## 66. PENDING badge moved to its own row (v5.0.5)

Follow-up to §65: instead of narrowing the truncation problem further, the
coach asked to move "PENDING" off the name row entirely - onto its own line
between the name/sport and the "TAP TO LOG" button. `AthleteCard.jsx`
restructured: the avatar+name row is now its own flex row with nothing
competing for width, wrapped together with the Pending badge in a
`flex flex-col gap-2` group (so they sit close together at the top of the
card rather than getting spread apart by the card's own `justify-between`),
with "TAP TO LOG" unchanged below. Verified: a normal name ("Austin
Bierman") now renders with room to spare, and even a deliberately extreme
29-character test name shows significantly more of itself before
truncating, since it no longer shares its line with the badge.

## 67. Athletes-tab sport filter was leaking into Kiosk Mode's roster (v5.0.6)

Coach reported: filter Athletes down to one team, activate Kiosk Mode, and
Kiosk Mode only shows that same team - searching for anyone on a different
team says "athlete not found in roster," with nothing in the UI suggesting
a filter is even active. Their own diagnosis was exactly right.

**Root cause.** `selectedSportFilter` and `search` (`App.jsx` lines ~75-76)
are single pieces of state shared across the Athletes tab, Profiles, *and*
Quick Entry/Kiosk Mode - all three read the same `filteredAthletes` memo
that applies both filters. `EntryScreen.jsx` has its own separate
`localSportFilter` for narrowing the roster *within* Kiosk Mode (by design,
confirmed by its own comment: "deliberately does NOT touch the shared
selectedSportFilter") - but that comment only describes one direction. It
never *writes* to the shared filter, but it still *reads* `filteredAthletes`,
which the Athletes tab had already narrowed. A coach who filtered Athletes to
Volleyball and then opened Kiosk Mode inherited that same narrowing with zero
indication why - Kiosk Mode's own "All" pill still said "All," just over an
already-shrunk roster.

**Fix:** added `handleActivateKioskMode` in `App.jsx` - a single entry point
that resets `selectedSportFilter` to `'ALL'` and `search` to `''` before
flipping `isKioskMode` on and switching to the entry screen. Wired both real
activation buttons (`AppHeader.jsx`'s "Kiosk Mode" and `AppSidebar.jsx`'s
"ACTIVATE KIOSK MODE") through it instead of their own inline
`setIsKioskMode`/`setScreen` calls.

**Second bug found while tracing every activation path:** the sidebar's gold
"ACTIVATE KIOSK MODE" button - a new element added in the Tailwind reskin,
no pre-refactor equivalent existed to compare against - only ever called
`setScreen('entry')`. It never called `setIsKioskMode(true)` at all, so
clicking it just opened the ordinary (non-kiosk) Quick Entry screen with the
full sidebar/header still showing, contradicting its own label. Fixed as
part of the same `onActivateKioskMode` wiring.

Verified end-to-end with a scripted repro of the coach's exact steps: filter
Athletes to Volleyball, click the header's Kiosk Mode button - Kiosk Mode
now shows both Volleyball and Baseball athletes. Repeated with the sidebar
button (filtered to Baseball this time) with the same result, and confirmed
it now genuinely enters Kiosk Mode (EXIT KIOSK button present).

## 68. Sport-pill rows didn't scroll with a mouse on desktop (v5.0.7)

Coach: "this slider works great on the ipad but does not slide on the PC
version," referring to the horizontally-scrolling sport-filter pill row
(Quick Entry's roster search: ALL ROSTER/BASEBALL/CHEER & DANCE/...).

These rows use `overflow-x-auto` with the scrollbar hidden globally
(`::-webkit-scrollbar { display: none }` / `scrollbar-none`, for a cleaner
look than a visible scrollbar under a pill row). Touch swipe scrolls a
horizontal-overflow container natively, which is why it worked on iPad. A
desktop mouse's vertical wheel does not translate to horizontal scroll for
a container by default, and with the scrollbar invisible there was nothing
to click-drag either - pills past the visible edge were completely
unreachable on desktop.

Added an `onWheel` handler to each affected row - Quick Entry's roster
sport filter (`EntryScreen.jsx`) and both of Lift Tracker's sport filters
(the roster search bar and the leaderboard, `LiftScreen.jsx`, sharing one
`handleHorizontalWheelScroll` helper) - that redirects vertical wheel delta
into `scrollLeft`, only when the row actually overflows. Verified directly:
dispatching a wheel event on the row moves `scrollLeft` from 0 to the
expected offset.

## 69. Sport-pill "slider" needed click-and-drag, not just wheel scroll (v5.0.8)

Follow-up to §68: coach said the fix still didn't work - "still no scroll
feature." Their own word for the row, "slider," was the tell: a mouse user
doesn't reach for the scroll wheel over a pill row that looks like a
slider, they click and drag it sideways, the direct mouse equivalent of the
touch swipe that already worked on iPad. The `onWheel` fix from §68 was
real and still correct (verified again it does move `scrollLeft`), but it
solves a different interaction than the one a "slider" invites someone to
try.

Added `src/hooks/useDragScroll.js` - a small reusable hook exposing a ref
and a set of mouse handlers: `mousedown` records the start position and
`scrollLeft`, `mousemove` (while pressed) moves `scrollLeft` to follow the
cursor, `mouseup`/`mouseleave` end the drag. Kept the wheel redirect from
§68 in the same hook so both interactions work. The one wrinkle: these rows
are full of clickable sport-filter buttons, so a naive mousedown/mousemove/
mouseup would also fire a button's `onClick` after every drag. Guarded with
a `moved` flag and a small pixel threshold (6px) - only past that threshold
does a capture-phase `onClick` handler swallow the click, so an intentional
drag never accidentally re-selects whatever sport happened to be under the
cursor when the mouse came back up, while a normal tap-to-select still
works exactly as before.

Wired into all three affected rows: Quick Entry's roster sport filter
(`EntryScreen.jsx`) and both of Lift Tracker's sport filters (roster search
and leaderboard, `LiftScreen.jsx`) - removed the standalone
`handleHorizontalWheelScroll` helper from §68 in favor of the shared hook.
Added `cursor-grab`/`active:cursor-grabbing` so the drag affordance is
visible, and `select-none` so dragging doesn't select the pill labels'
text. Verified both behaviors survive together: a simulated press-drag-
release moves `scrollLeft` from 0 to 200, and a plain click on "Baseball"
still applies that sport filter (confirmed via the button's own active/gold
styling class appearing after the click).

## 70. Drag-scroll affordance was invisible; full regression-suite triage after the overhaul (v5.0.9)

Follow-up to §69: the click-and-drag interaction worked, but nothing on
screen told a coach these rows could be dragged - no scrollbar, no visual
cue, just a bare row of pills. Added `DragScrollBar`, a small custom
scrollbar component exported alongside `useDragScroll` from the same hook
file (renamed `useDragScroll.js` -> `useDragScroll.jsx` since it now
contains JSX - Vite/Rolldown reject JSX inside a plain `.js` file). It reads
live scroll metrics (`scrollWidth`/`clientWidth`/`scrollLeft`, kept in state
via a `scroll` listener and a `ResizeObserver`) to size and position a thin
gold thumb under the row, hides itself entirely when the row doesn't
overflow, and is itself draggable to scrub the row's `scrollLeft` directly.
Wired under all three sport-pill rows (Quick Entry's roster filter, Lift
Tracker's roster and leaderboard filters). Verified with a real drag
gesture (`scrollLeft` moved from 0 to 17 after a 170px drag) and confirmed
the thumb's bounding box renders at the expected width/position for a
20-athlete, 7-sport roster.

**Full regression-suite triage, same session.** The coach asked for the
complete 40-file suite to be re-run after a container restart and every
failure triaged - fix real bugs, confirm the rest are already-known test
staleness rather than re-asserting that from memory. Re-ran the full suite
against this build and checked every failing file's actual DOM/network
behavior directly (not just re-reading old notes):

- `entry-perf.js`'s `Add` button and `kiosk-search-pill.js`'s `All` button
  timeouts are exact-name mismatches against real, intentional labels
  (`+ Add Guest / Trial`, `All Roster`) - the buttons exist and work, the
  test's `exact: true` selector doesn't match the fuller label.
- `rpe.js`/`rpe-fixes.js` (`SAVE RPE`) and `rpe-settings.js` (`RPE Only`)
  are the same already-documented button/label renames from §56-§58
  (`CONFIRM & SYNC ATHLETE`, `Session RPE`) - confirmed by grepping the
  current source, not reprinting the old note on faith.
- `lift-tracker-redesign.js`'s `Recent Bencher` button timeout: the "Active
  Today" recent-athlete cards are `<div onClick>`, not `<button>` elements,
  so `getByRole('button', ...)` can never match them - a pre-existing
  accessibility/test mismatch in code this session didn't touch, not a new
  regression.
- `dashboard-focus-and-sticky-lifts.js`'s "typing still filters the roster"
  and the several roster-name-matching failures in `lift-tracker.js` /
  `lift-leaderboard-sport-filter.js`: confirmed directly with a scripted
  page read that `element.innerText` returns the CSS `text-transform:
  uppercase` roster names as literally uppercase ("ROSTER ATHLETE 20"), so
  a test's mixed-case regex against `innerText` never matches - the exact
  "uppercase class breaks case-sensitive test matches" issue flagged as
  known back in §58, reconfirmed against live rendering rather than assumed.
- `rpe-dashboard.js`'s "2 of 5 REPORTED"/"40%" checks slice the page text
  between `TODAY'S SESSION LOAD` and `SESSION ACCOUNTABILITY TRACKER` -
  both headings were intentionally renamed in §54/§55, so the slice
  indices are `-1` and the check reads garbage. Same known heading-rename
  staleness, not new.
- `lift-csv-export.js`'s "no visible text label" check is the Material
  Symbols ligature-text issue from §58 (`element.innerText` sees the
  literal word "download").
- `profile-baseline-chart-agreement.js` still fails on its own
  `addInitScript` called with too many arguments - a pre-existing
  test-authoring bug (§57), unrelated to app code.
- `data-integrity.js`'s `NET-FAIL` and `offline-recovery.js`'s queue checks
  still look for a `Save Record & Complete` button that was renamed to
  `CONFIRM & SYNC ATHLETE` back in §56 - same known stale selector.

No new failures traced to this session's changes. Re-confirmed the specific
overhaul items from earlier this session are all still present in source
(not just documented as done): the fabricated "Digital Scale Rack"/Rice
Lake copy and the fake progress bar/"Mark Block Complete" button stay
removed, the "+ Add Guest / Trial" modal still exists and is wired to
`handleCreateAthlete`, the Lift Tracker sidebar link is still gated on
`enableLiftTracker`, Enter-to-save is still wired on both the weight and
RPE inputs, and no `backdrop-blur` classes have crept back into the
weigh-in/add-athlete modals.

## 71. RPE trend bars: a real "hard" week and a "no data" week looked identical (v5.1.0)

Coach sent a screenshot: WSOC's mini RPE trend bars on the Dashboard's readiness
panel were blank/uncolored compared to MBB's, and said WSOC had actually logged
RPE Monday, Wednesday, and Friday that week - asked why it wasn't showing.

**Verified against the real database first, not assumed.** Queried the production
`athletes`/`weigh_ins` tables directly: all 25 WSOC athletes carry a consistent
`sport = 'WSOC'`, and the three days in question had real, correctly-tagged
`session_type = 'rpe'` rows (18/15/16 logs respectively) with team averages of
roughly 5.1-5.8 out of 10. So the data and the athlete-to-sport matching in
`sportOf()` were both fine - ruled out before touching any code.

**The actual bug was a color-contrast bug, not a logic bug.**
`DashboardScreen.jsx`'s per-day trend bar only turns gold once that day's average
RPE sits within 2 points of `settings.rpeHighThreshold` (default 8, so ≥6);
anything below that rendered `bg-[#172338]` - a dark navy blue almost identical in
luminance to the card's own background, `bg-[#0e182a]`. A team training at a
completely normal RPE of 5-6 (WSOC's actual week) was rendered visually
indistinguishable from a team that logged nothing at all, while a team whose
week happened to average ≥6 (MBB) lit up gold and looked "normal" - purely a
coincidence of that week's numbers, not a difference in whether the app tracked
them.

Gave the "logged but moderate" tier its own visible color (`bg-[#3b82f6]/60`, a
muted blue) distinct from both the empty-day placeholder (a small transparent
stub) and the existing gold/red tiers, so any day with a real log always renders
visibly regardless of how moderate the average is. Verified directly: seeded a
WSOC-shaped fixture (RPE ~5.5 on 3 of the last 7 days, nothing today) and
confirmed exactly those 3 days render the new blue bar while the other 4 render
the untouched empty-day stub - no change to the gold/red thresholds or to any
other team's existing coloring.

## 72. Sleep "recovery" claims needed a minimum sample before speaking with confidence (v5.1.1)

Coach flagged a real trust problem, separate from any data bug: body-weight
tracking already correctly distinguishes "not tracking" from "0%" (§55), but
sleep tracking is barely used by the program yet, and the Profile page's
"AVERAGE SLEEP DURATION" card would call a single stray sleep log an
"🟢 Optimal Rest Standard" - a confident, standard-setting claim built on a
sample of one. Coach's words: it "will just be lying" once someone actually
looks at that card while sleep data is this sparse.

Checked every other sleep-derived label first, since a couple of these are
already properly gated: the per-session table badges (added §57/58 area)
already correctly show `--` instead of a false "Sleep Deficit Warning" when
a specific session has no sleep entry, and the Recovery Index Score already
returned `--` at exactly zero logs. The gap was specifically the *aggregate*
badge and score treating "at least one log exists" as good enough to assert
a trend, with no floor on sample size.

Added `MIN_SLEEP_SAMPLE = 3` in `ProfilesScreen.jsx` and gated three things
on it: the qualitative band text under "AVERAGE SLEEP DURATION" (now reads
"Not enough check-ins yet (N/3)" below the threshold, in muted gray rather
than the alarming red the "deficit" fallback color used to apply even to the
no-data case), the Recovery Index percentage (was `> 0`, now `>= 3`), and its
color coding. The raw average itself still displays as soon as there's at
least one log - only the confident qualitative claim on top of it waits for
a real sample. Verified with two fixtures: an athlete with exactly 1 sleep
log now shows "Not enough check-ins yet (1/3)" and a `--` recovery score; an
athlete with 3 logs still shows the full "Optimal Rest Standard" badge and a
real percentage, unchanged from before this fix.

## 73. Real production error monitoring (v5.1.2)

Coach asked whether an agent could monitor for bugs going forward, now that
the app is in "polish everything we have" mode rather than active feature
work. The app had zero error visibility until now - every bug this session
found came from a coach noticing something looked wrong and sending a
screenshot, never from the app itself surfacing a crash.

**New `db/011_app_errors.sql`.** A plain triage table (`message`, `stack`,
`source`, `url`, `user_agent`, `app_version`, `coach_email`, `created_at`) -
deliberately no status/resolved workflow, since this is meant to be read and
acted on, not tracked through a lifecycle. RLS follows the same
`is_approved_coach()` gate as every other table (insert/select/delete, all
coach-scoped) - locked in the same migration that creates it, per the
standing rule.

**New `src/errorReporting.js`**, wired into `main.jsx`:
- `installGlobalErrorReporting()` attaches `window.onerror` and
  `window.onunhandledrejection` listeners - the two error classes a React
  `ErrorBoundary` structurally cannot see (anything thrown outside a render,
  e.g. an event handler or a timer callback, and any rejected promise
  nobody caught).
- The existing top-level `ErrorBoundary` in `main.jsx` (already present,
  previously just rendered a fallback screen and did nothing else) now also
  calls `reportError()` from `componentDidCatch`, covering the third class:
  actual render-time React crashes.
- `reportError()` is fire-and-forget and always wrapped in its own
  try/catch - reporting a bug must never itself throw or block the coach's
  UI. Capped at 20 reports per browser session (`MAX_REPORTS_PER_SESSION`)
  so a genuinely looping error (e.g. a bad render loop) can't flood the
  table with hundreds of identical rows in seconds; a flat cap was chosen
  over per-message dedup as simpler and good enough for a triage feed - the
  first several occurrences of anything are already enough to diagnose it.

Verified directly (not assumed): stubbed the network in Playwright and
threw a synthetic `window.onerror` and a synthetic unhandled rejection,
confirmed both actually reach `POST /rest/v1/app_errors` with the correct
shape, including the signed-in coach's email and the running app version.

**New daily Routine** ("HPD App - production error check", 9am Central,
`trig_011nH3UqdiY4aPGyzk2qRpct`) checks `app_errors` for anything new each
morning, tries to diagnose and fix real bugs found there (committing
locally, never auto-pushing per this session's standing workflow), and
only messages the coach if there's something worth reporting - silent on a
clean night. **Caveat flagged to the coach directly, not glossed over:**
the trigger's creation response warned it stores no MCP connectors, so
there's a real chance tomorrow's first automated run can't reach the
Supabase MCP tools it needs to query the table, depending on how the fired
environment resolves tool access. Won't be certain this actually works
end-to-end until it fires once for real.

## 74. Lift Kiosk Mode + bulk lift-type reassignment (v5.1.3)

Coach asked for two Lift Tracker features, inspired by how Perch.fit lets an
athlete pre-select themselves before logging: "select the athlete before the
lift... they roll in to the weight room and can pre-select their name... instead
of having to scroll for their name."

**Lift Kiosk Mode.** The gap wasn't the logging flow itself - clicking an
athlete already opened a modal that's just "pick a lift type, log weight/reps,"
functionally identical to what Perch.fit does. The gap was *finding your name*:
the only roster view was the coach's dense admin table (search + sport filter +
bodyweight/status/last-set columns + pagination), not something an athlete would
want to use themselves standing at a rack.

Reused the app's existing global `isKioskMode` flag (previously only wired to
Quick Entry) rather than inventing a second kiosk concept - `App.jsx` already
hides the sidebar/header/bottom-nav whenever it's true, regardless of which
`screen` is active, so a new `handleActivateLiftKioskMode` just sets
`isKioskMode` and `screen: 'lifts'`. Unlike Quick Entry's kiosk activation (§ on
the Athletes-filter-leak fix), Lift Tracker's `search`/`sportFilter` are already
local component state, not shared globally, so there was no cross-screen filter
to reset.

In `LiftScreen.jsx`, `isKioskMode` now swaps: the coach's hero header/action
toolbar (LOG A LIFT, LEADERBOARD, CSV export, the segmented view buttons) for a
one-line "find your name, tap it" header; and the dense roster **table** for a
big-tile grid (name, sport, initials avatar, last lift as a light hint) - same
search bar and sport-pill filter above it either way, same `openEntry()` on tap
opening the identical lift-entry modal a coach's "LOG SET" button always used.
A "LIFT KIOSK MODE" button in the normal (non-kiosk) toolbar activates it;
`AppHeader`'s existing "EXIT KIOSK" button (already generic, not tied to Quick
Entry) works unchanged. Verified the full flow end-to-end with Playwright: kiosk
activation hides the sidebar and coach toolbar, the tile grid renders and is
tappable, the resulting `POST /rest/v1/lift_logs` carries the correct
athlete/lift/weight/reps, and exiting kiosk restores the sidebar.

**Bulk Edit lift type.** New `bulkUpdateLiftType(ids, newLiftType)` in
`useLiftLogs.js`, alongside the existing single-row `updateLift` - updates local
state for every matching id and issues one
`supabase.from('lift_logs').update({lift_type}).in('id', ids)` call rather than
one request per row. A new "BULK EDIT" button opens a modal: pick a date, pick
the currently-logged (wrong) lift type, see a live count of exactly how many
sets match, pick the correct lift type, confirm through the same
`setConfirmModal` pattern every other destructive-ish action in this app uses.
Weight/reps/athlete/timestamp are never touched - only `lift_type`. Fixes the
common real case (a whole session logged under the wrong lift name) without
deleting and re-logging every set by hand, which would also lose the original
timestamps. Verified end-to-end: seeded 2 "Bench" sets and 1 "Squat" set on the
same day, confirmed the preview correctly counted 2, and the resulting PATCH's
`id=in.(...)` list contained exactly those 2 ids with the Squat set untouched.

## 75. Lift Kiosk Mode: pinned athlete card instead of a per-set modal (v5.1.4)

Same-day follow-up to §74. Coach's exact words: "I want to be able to have my
names be selected and just hang out at the top of the 'card' until the lift is
over, then once we add the actual program feature the athlete will be
pre-selected and they can see their workout below." Two distinct asks bundled
together: (1) the selected athlete's identity should persist visually at the
top of the screen across multiple sets, not live inside a modal that visually
implies "one popup, one action, done" - and (2) whatever UI holds that
persistent selection needs to be the same place a future assigned-workout list
renders, once that feature exists.

**Refactored, not rebuilt.** `handleSave` already kept the athlete selected
after logging (only `weight`/`reps` reset, `entryAthleteId` untouched) -
multi-set logging for one athlete already worked functionally in §74's modal.
The actual gap was presentation: a `position: fixed` overlay modal reads as a
transient interruption, not a home base a coach hands to an athlete for their
whole set.

Extracted the entry panel's JSX (name/sport header, lift-type pills,
weight/reps steppers, Log Lift button, Recent Lifts list, inline edit/delete)
into a single `entryPanelInner` expression, referenced by two completely
different wrappers instead of two copies of ~200 lines of JSX:
- **Non-kiosk (coach):** unchanged - the same centered `createPortal` modal,
  same "BACK" chevron + X close button, same everything. Zero behavior change
  here, verified directly.
- **Kiosk:** no portal, no fixed overlay. Renders inline, `sticky top-0 z-20`,
  as the first element inside the log view - above the search bar (itself
  `sticky top-0 z-10`) and the tile grid, which **stays visible and tappable
  the whole time** rather than disappearing behind a modal. The close button
  is relabeled "Done" (icon: `Check`) instead of an X, since dismissing it now
  means "finished this athlete's turn," not "cancel an accidental tap."

Chose "reuse the existing global kiosk chrome, branch the wrapper" over
"design a new kiosk-only component," since the coach's stated end goal (a
future workout-program view rendering below the pinned name) is a smaller,
additive change against this same `entryPanelInner` block than it would be
against a modal that has to be torn down and rebuilt as an inline surface
later anyway.

Verified end-to-end with Playwright: selecting an athlete in kiosk mode shows
the pinned card AND leaves the tile grid (including that same athlete's own
tile) visible underneath; logging two different lifts back-to-back for the
same athlete needs no re-tap and produces two correctly-attributed
`lift_logs` rows; tapping "Done" clears the pinned card while the tile grid
remains; and the coach's non-kiosk modal still renders as a centered popup
with its original "BACK" label, confirming the shared-JSX refactor changed
nothing for that path.

## 76. Per-set bar chart in the entry panel, minus the VBT metrics (v5.1.5)

Coach sent a screenshot of Perch.fit's workout screen (a VBT app - bar-speed
sensor readings per rep, a "Set Avg" velocity stat, a target-zone band) and
asked for "something like this without the VBT metrics that could be filled
with the actual lift maybe."

Added, inside `entryPanelInner` (so both the coach's modal and Lift Kiosk
Mode's pinned card get it):
- A big current-value readout - the most recent set's weight/reps, in the
  same visual weight Perch gives its velocity number - plus a smaller "Best
  Today" stat on the right (the heaviest set logged today for this lift),
  mirroring Perch's "Set Avg" position without inventing a metric this app
  can't actually measure.
- A `recharts` `BarChart`, one bar per set logged **today** for whichever
  lift is currently selected (`todaysSetsForLift`, sorted oldest-first so
  bars read left-to-right as "Set 1, Set 2, Set 3...") - the same "bar per
  rep" visual Perch uses, except the bar height is the real weight lifted,
  not a bar-speed sensor reading this app has no hardware for. The most
  recent set's bar is highlighted gold (`#b89c5b`, matching the app's
  existing accent color used elsewhere in this file), earlier sets a muted
  blue (`#60a5fa`, the same blue `ProfilesScreen`'s sleep chart already
  uses) - confirmed a plain `var(--color-primary)` renders as solid black
  here, since that CSS custom property isn't actually defined anywhere in
  this codebase despite `bg-primary`-style Tailwind utility classes existing;
  fixed by using the same literal hex the rest of this file already hardcodes
  for gold accents rather than a CSS variable that doesn't exist.
- The chart is keyed off `liftType` (not a separate "which exercise" picker),
  so switching the lift-type pill immediately swaps which exercise's sets it
  shows - exactly the "Back Squat ▾" exercise-scoping behavior in Perch's
  screenshot, reusing the pill selector this screen already had rather than
  adding a second control that does the same job.

Verified end-to-end: seeded three ascending Squat sets (225→275→315) for one
athlete, confirmed the chart renders exactly 3 bars, the big number reads the
last set's weight, "Best Today" reads the heaviest, and the final bar renders
visibly gold rather than the black-fill bug caught in the first pass.

## 77. Lift Kiosk Mode: a multi-athlete "rack" instead of a single-picker grid (v5.1.6)

Coach: "I want to be able to select multiple athletes per rack, also I do not
need the active today portion of the page... you can select multiple athletes
then it just pulls up their names in boxes and once they hit their names it
will pop up the modal." Clarified three specifics before building (asked
directly rather than guessing on a UX decision this consequential): tapping a
rack box should reopen the persistent pinned card from §75/§76 (not revert to
a modal), no cap on rack size, and - per the coach's own follow-up answer -
selecting your name should take you to your own card without a pile of other
athletes' names sitting on screen the whole time.

**Removed entirely, per direct request:** the "Active Today" section
(`recentAthletes`) and its "+1 Set" quick-repeat button, along with the
now-orphaned `sessionTonnage`/`todaysLogs`/`repeatingId`/`handleQuickRepeat`
that existed only to support it. Confirmed nothing else in the file
referenced them before deleting - `todaysSetsForLift` (§76's chart) has its
own independent today-filtering logic and was untouched.

**New rack model**, kiosk-mode only (the coach's non-kiosk admin table and
workflow are completely unchanged):
- `rackAthleteIds` (array, no cap) - whoever has selected their own name this
  kiosk session. Local component state, not persisted - a same-session
  convenience, not a durable "who's assigned to this rack" record (that's a
  bigger feature for whenever the actual program/assignment system exists).
- `showFindAthlete` (boolean) - whether the full search+sport-filter+tile-grid
  "find your name" section is visible. Starts `true` (rack is empty, someone
  has to find themselves first); `openEntry()` now flips it to `false`
  whenever kiosk mode adds someone to the rack, addressing the coach's "they
  do not see a bunch of other athletes' names" concern directly instead of
  leaving the full roster grid permanently on screen once a group is set.
- A new "YOUR RACK" section (kiosk-only, shown once `rackAthleteIds.length >
  0`) renders each selected athlete as a small named box with an "×" to drop
  them from the rack (`removeFromRack`, which also closes their pinned card
  if they're the one currently open) and an "Add Another Athlete" / "Hide
  Roster" toggle that re-shows or re-hides the search+grid section.
- Tapping a rack box calls the same `openEntry(id)` every other selection
  path already used - no second code path for "reopen an existing rack
  member" vs "select someone new," since both cases are identical from the
  panel's point of view.

Verified end-to-end with Playwright: the grid shows initially with an empty
rack; selecting one athlete creates their rack box, hides the roster grid,
and shows "Add Another Athlete"; using that toggle and selecting a second
athlete grows the rack to two boxes without losing the first; re-tapping
either rack box reopens that exact athlete's pinned card (not the other
one's) with no roster grid visible; and the "×" button removes an athlete
from the rack while leaving the other one's box untouched. Confirmed "Active
Today" text is gone from both kiosk and non-kiosk views.

## 78. Fixed blank-screen bug when the rack empties out (v5.1.7)

Coach: "when I exit out of the athletes it goes completely blank, have it
return to the athletes page." Real bug in §77's rack model, not a vague
report - reproduced immediately: with exactly one athlete in the rack,
removing them (the "×" on their rack box) leaves `rackAthleteIds` empty
*and* `showFindAthlete` still `false` (it only gets set back to `true` by
the explicit "Add Another Athlete" toggle, which nobody had tapped). Both
the "YOUR RACK" section (gated on `rackAthleteIds.length > 0`) and the
roster grid (gated on `showFindAthlete`) disappeared at once - nothing left
on screen to tap, no path back except leaving Lift Tracker and returning.

Added a derived `gridVisible = !isKioskMode || showFindAthlete ||
rackAthleteIds.length === 0`, used everywhere the grid's visibility used to
check `showFindAthlete` alone - the grid now always shows whenever the rack
has nobody in it, regardless of *how* it got empty (removed the last
athlete, or a fresh kiosk session that never added anyone). Verified
directly: with one athlete in the rack, tapping their box's "×" now
re-shows the full "find your name" grid instead of a blank screen.

## 79. Lift Tracker header cleanup + real fix for "have to hard refresh every time" (v5.1.8)

**Header cleanup**, per direct request: `LiftScreen.jsx`'s title (both the
breadcrumb and the `<h1>`) shortened from "LIFT TRACKER & WEIGHT ROOM FLOOR"
to just "LIFT TRACKER," and the descriptive subtext paragraph beneath it
removed entirely. The Bulk Edit and Lift Kiosk Mode buttons (added §74)
changed from icon+label pills to icon-only squares matching the CSV export
button's existing style (`w-10 h-10`, `aria-label` + `title` carrying the
accessible name instead of visible text) - cleans up a toolbar that had
grown to 5 buttons plus a segmented control.

**The "have to hard refresh every time" bug - found via the error monitor
from §73, not guessed.** Queried `app_errors` directly and found the exact
cause: `"Failed to fetch dynamically imported module:
.../AthletesScreen-B9eCfU1E.js"`, caught by the React ErrorBoundary. Every
deploy gives every lazy-loaded screen a new content-hashed chunk filename and
the old ones stop existing on the server - a tab that loaded its shell
before (or across) a deploy fails exactly like this the first time it tries
to open a screen it hasn't visited yet. Before this fix, `main.jsx`'s
`ErrorBoundary` caught this and rendered a permanent plain "Something went
wrong" screen with no recovery. **A normal refresh doesn't fix it** because
the still-active old service worker's own `NavigationRoute` keeps
intercepting navigation and re-serving its own cached shell (the same stale
chunk references) regardless of what's actually on the server now - only a
hard refresh, which happens to bypass the service worker, ever worked,
which is exactly the coach's reported workaround.

Added `isStaleChunkError()`/`handleIfStaleChunk()` to `errorReporting.js`,
wired into all three error-catching paths (`window.onerror`,
`unhandledrejection`, and the `ErrorBoundary`'s `componentDidCatch`) so it's
caught regardless of whether the failure surfaces as a React render error or
an unhandled promise rejection. On match, `forceFreshReload()` unregisters
every service worker registration, clears every Cache Storage bucket, then
reloads - guaranteeing the next load bypasses the stale worker entirely and
fetches the current deployment's real `index.html` and chunk hashes, the
same effective outcome as a manual hard refresh, done automatically. Guarded
by a 30-second `sessionStorage` cooldown so a genuinely broken deployment
(not just a stale chunk) doesn't loop-reload forever - after one attempt
within that window it falls through to the normal error screen instead.

Verified end-to-end with Playwright: stubbed `serviceWorker.getRegistrations`
and `caches.keys`/`delete`, dispatched a synthetic `unhandledrejection` with
the exact production error message, and confirmed all three steps fire in
order - `unregister()` called, `caches.delete()` called, and the page
actually reloads (the `sessionStorage` guard key gets set) - rather than the
old dead-end error screen.

## 80. Maintenance pass: bundle split, stale-closure fixes, data-error reporting, cleanup (v5.1.9)

From a lint + Supabase-advisor review.

- **Bundle split** (`vite.config.js`): `build.rolldownOptions.output.codeSplitting.groups`
  puts React (`react-vendor`) and Supabase (`supabase-vendor`) in their own chunks. The
  main app chunk went from 555 kB to 157 kB, and because vendor code rarely changes, a
  deploy now only invalidates the app chunk. `normalizeName` moved to
  `src/features/analytics/normalizeName.js` (re-exported from `plyomatImport.js`) so
  `usePerformanceTests` no longer drags the whole importer into the main bundle.
- **Stale closures in App.jsx**: the mount-once realtime/online effect called
  `fetchReportData` and `syncOfflineCache` from the first render's closure. Both now go
  through latest-value refs (`fetchReportDataRef`, new `syncOfflineCacheRef`), as does
  the profile loader effect (`fetchProfileDataRef`). Same pattern `ensureReportWindow`
  already used.
- **Data-error reporting**: new `reportDataError(err, source)` in `errorReporting.js`.
  It logs server-rejected Supabase calls to `app_errors` and skips offline/network
  failures, which the local caches already handle. Wired into every fetch/write in
  `useLiftLogs`, `usePerformanceTests`, and the profile history fetch. Sources look like
  `lift_logs:write`, so the daily error routine will now see these.
- **Dead code**: ~100 unused `catch (e)` bindings became `catch {`; unused imports
  removed; deleted `getLast7DaysActivity`, `renderSidebarItem`, `downloadCSV`/`csvCell`
  (Reports), the unused team/grade/position lists, `showTeamSummary`, and
  `chronicAvgWeeklyLoad`. Fixed an always-true expression in `tests/rpe.js`'s exit code.
  Unused props and state in Settings/Entry were left alone. They are harmless and are
  part of the component contracts.
- **db/012_index_tuning.sql** (applied): added `plyomat_sync_state_last_synced_by_idx`
  and dropped `alert_status_status_idx`, because the app never filters alert_status by
  status. The other "unused" indexes (the FK indexes and `app_errors.created_at`) are
  kept on purpose; the migration file explains why.

## 81. Next up

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

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
- **Tests** — `tests/` + `tests/README.md`. Sixteen suites: `analytics`, `auth`,
  `dashboard-profile-team`, `data-integrity`, `edit-log`, `entry-perf`,
  `offline-recovery`, `rpe`, `rpe-dashboard`, `rpe-settings`, `select-visibility`,
  `settings-live`, `speed-power`, `stress`, `sync-and-ux`, `tooltip-units`. A full pass
  takes ~10 minutes, almost all of it deliberate waiting — the offline-queue and
  heartbeat probes only catch what they catch after real elapsed time.
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

## 16. Next up

1. **Close the account-recovery gap** (§11). Two parts, both small:
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

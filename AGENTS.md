# HPD App — agent handoff (for Google Antigravity and any other coding agent)

Current as of **v5.15.0, 2026-10-30**. Read this whole file before
changing anything. `docs/HANDOFF.md` has the full history (one `## N.` section per change,
with the reasoning); `VERSIONING.md` has one row per release.

---

## 0. Ground rules (non-negotiable)

1. **Never push to `main` unless the owner says "push it".** `main` auto-deploys to
   production (Vercel) and the rack iPads pick it up on reload.
2. **Start every session with `git pull`; end it with commit + push.** This repo is also
   worked on by Claude Code. One tool "has the keyboard" at a time (see `CONTRIBUTING.md`).
   Work on your own branch (e.g. `antigravity/<topic>`). Don't use `preview-cleanup`: the
   Claude sessions force-push it.
3. **Don't change layouts without a design from the owner.** Adding a small control is fine;
   rearranging a screen is not.
4. **The database is production data about real high-school athletes.** No deletes, bulk
   updates or destructive SQL without the owner confirming. Schema changes go in a new
   numbered file `db/0NN_<name>.sql`, with the RLS policy in the same file, and get applied
   to Supabase.
5. **Keep Supabase egress low (Free plan: 5 GB/month).** A refetch loop once burned 40 GB in
   one night. Every bulk download goes through `allowFetch()` / `loadHistoryTable()` in
   `src/utils/fetchBrake.js`. Never add polling or unthrottled refetches, and prefer applying
   a saved row over re-downloading a table.
6. **No secrets in the repo.** The app uses Supabase's *publishable* key, which is built into
   `src/supabaseClient.js`; that's intended. Never commit `.env` or a service-role key.
7. **No AI model names or identifiers in code, docs or commits.**

---

## 1. What this is

Shiloh Christian Athletics **Human Performance Dashboard (HPD)**: a coach-facing PWA used
on laptops and on iPads at the weight-room racks. It covers:

- weigh-ins and hydration alerts, session RPE and training load
- lift tracking, including a rack-tablet "Lift Kiosk" with the day's program
- jump and sprint testing (Plyomat import)
- program building, upload and periodization
- printable reports

The owner is a strength & conditioning coach, not a developer. Write to them in plain
language: what changed, what they'll see, what they need to do.

## 2. Where things live

| What | Where |
|---|---|
| Code | GitHub `dalemel3-cmd/clever-kepler`; `main` = production |
| Hosting | Vercel project `hpd-app` (`prj_ncps8jvmPs6dxRsOKgj8In4Pj2sI`), live at `clever-kepler.vercel.app` |
| Previews | Any pushed branch gets a Vercel preview: `hpd-app-git-<branch>-dalemel3-cmds-projects.vercel.app` |
| Database / auth | Supabase project `cwfpjlomlvkburugolky` (Postgres + RLS + realtime + one edge function) |
| Schema | `db/001…015_*.sql`, numbered and applied in order |
| Edge function | `supabase/functions/plyomat-sync` (deployed copy imports `./_shared/cors.ts`; the repo has `../_shared/cors.ts`) |
| Errors | `app_errors` table (client and boot errors from `src/errorReporting.js`; fetch-brake trips use `source='fetch-brake'`) |
| Owner's runbook | `docs/RUNBOOK.md` (accounts, yearly checklist, symptom → fix) |

Stack:
- React 19 + Vite 8 PWA (`vite-plugin-pwa`, autoUpdate), Tailwind 4 plus inline styles.
- Recharts, lucide-react, `html-to-image`, `@supabase/supabase-js` 2.111.
- Fonts: Oswald + Manrope, plus Material Symbols icons from Google Fonts.

## 3. Run it locally

```bash
npm install
npm run dev          # http://localhost:5173 (.claude/launch.json has the same config)
npm run build        # must pass before any push
npm run lint         # oxlint; a few existing warnings, no errors
```

- `.env` is optional. The Supabase URL and publishable key fall back to built-in values.
- **The app needs a login.** Supabase auth, and the account must be an approved coach (a
  row in `coaches` with `approved = true`; RLS checks `is_approved_coach()`). Ask the owner
  if you need to see real screens. The tests never need a login (see §4).

## 4. Tests

76 standalone scripts in `tests/`: `node tests/<name>.js`, each printing `N passed, M failed`.

- **Browser tests** drive the **built** app with Playwright against
  `npx vite preview --port 4173 --strictPort`. They stub Supabase completely
  (`tests/lib/auth-stub.js` plus per-test `page.route` stubs), so they never touch the
  real database. Most honour `APP_URL=http://127.0.0.1:<port>`; `tap-targets.js` is hard-wired
  to 4173.
- **Node-only tests** (no browser) import source through `tests/lib/src-resolve.mjs`:
  `program-week-cards`, `program-grid`, `program-csv`, `season-rollover`, `workout-timer`.
- **Setup on your machine:** `npm i --no-save playwright && npx playwright install chromium`.
  Playwright isn't in `package.json`, and `npm install` removes it.
  `CHROMIUM_PATH=/path/to/chrome` overrides the browser.
- `tests/lib/make-xlsx.js` builds real .xlsx files for upload tests.
- **Already failing before current work** (don't chase unless asked):
  - `data-integrity` looks for a button removed in v5.4.5.
  - `polish` reports sideways scroll on #entry/#reports.
  - `rpe` has one assertion.
  - `tap-targets` flags the Reports checkboxes at 13×13.
- Run the area's tests after a change:
  - **Programs:** `program-builder`, `program-template-periodization`, `program-grid`,
    `program-csv`, `program-week-cards`, `program-week-cards-upload`.
  - **Rack tablet:** `workout-tablet`, `lift-kiosk-multi`, `lift-tracker-redesign`,
    `workout-timer`.
  - **Usage guards:** `usage-guards`, `save-no-refetch`.
  - **Reports:** `readiness-report`, `perf-readiness`, `print-leaderboard`, `progress-card`,
    `body-weight-report`.

## 5. The release workflow every change has followed

1. Implement → `npm run build` → run the relevant tests (above), and add or extend a test
   for new behaviour.
2. Bump the version in **3 places**:
   - `APP_VERSION` in `src/utils/athleteData.js`
   - `package.json`
   - `package-lock.json` (2 occurrences)

   Use minor for features and patch for fixes.
3. Add a row to `VERSIONING.md`.
4. In `docs/HANDOFF.md`, replace the trailing `## N. Next up` with `## N. <what changed>
   (vX.Y.Z)`, then a new `## N+1. Next up` that carries the open list forward. The last
   numbered section is currently **§144**, and **§145 is Next up**.
5. Commit with a plain message (what and why), push your branch, and give the owner the
   preview URL.
6. Merge or push to `main` **only after the owner says "push it"**. Fast-forward only; don't
   rewrite `main`.

## 6. Code map

- `src/App.jsx` (~3,100 lines): auth gate, the main data pipeline and routing.
  - The pipeline covers `athletes` + `weigh_ins`, realtime (with the twin-row rules:
    `opt_` / `offline_` / `broadcast_` ids), the focus/visibility refresh (throttled to once
    per 30 s) and saves that apply the returned row instead of refetching.
  - It's large; touch it carefully.
- `src/navigation.js` is the nav. `src/settings.js` holds the defaults and `normalizeSettings`
  bounds. **Settings are per device** (localStorage), not shared.
- `src/utils/`:
  - `athleteData.js`: `APP_VERSION`, `getCentralDateString`, `isRpeLog`,
    `isPostPracticeLog`, `hasWeight`, baselines, A:C load.
  - `fetchBrake.js`, `insertQueue.js` (offline insert queue), `xlsx.js` (a dependency-free
    .xlsx reader).
- `src/features/`:
  - `entry/`: weigh-in and RPE kiosk.
  - `lifts/`:
    - `LiftScreen.jsx`: Lift Tracker plus Lift Kiosk mode, including the rack.
    - `WorkoutPanel.jsx`: today's workout on the rack tablet.
    - `useLiftLogs.js`, `liftRanking.js` (est. 1RM = Epley `w × (1 + reps/30)`).
  - `programs/`:
    - `ProgramsScreen.jsx`: builder, upload, download, periodization.
    - `programData.js`: program shape, `maxesFor`, `workingWeight`, `isBarbell`.
    - Upload readers: `programCsv.js` (row-per-set template), `programGrid.js` (weeks across,
      days down), `programWeekCard.js` (one tab per week, days side by side).
    - `periodization.js` + `PeriodizationPanel.jsx`: the volume / intensity overview.
    - Rack-tablet data: `workoutSession.js` (tablet session in localStorage),
      `sessionCloud.js` (saves sessions to `workout_sessions`), `useTodaysWorkouts.js`
      (the tablets' programs).
    - `WeightRoomCard.jsx`: printable cards and per-program "Edit maxes".
  - `reports/`: Readiness, Perf vs Readiness, Progress Card, Body Weight.
  - `leaderboard/`: printable leaderboard.
  - `analytics/`: Plyomat import, Speed & Power.
  - `rpe/`, `alerts/`, `athletes/`, `profiles/`, `dashboard/`, `groups/`, `settings/`.

**Printables** render into a portal, add a body class (`lb-`, `rr-`, `pr-`, `pc-`, `wr-`,
`bw-printing`) and hide `#root` with `html body.<class> > #root { display:none !important }`.
They inject `@page` only while open, and are sized for US Letter.

## 7. Data model

| Table | Notes |
|---|---|
| `athletes` | name, sport (team, e.g. `WSOC`, `MBB`, `Football`), position, grade, baseline/target weight, `archived_at` |
| `weigh_ins` | weigh-ins, post-practice checks (`session_type='post_practice'`) **and** session RPE (`session_type='rpe'`, `rpe`, `session_minutes`, `session_label`). Use the `athleteData.js` helpers; never hand-roll these checks |
| `lift_logs` | `lift_type`, `weight_lbs`, `reps`, `source` (`manual` or `kiosk`), `notes` |
| `performance_tests` | `test_type` + `test_variant` (broad jump is stored as `board_jump`) |
| `programs` | one row per week. `days` is JSON: `[{id, date, focus, warmTitle, warm[], blocks:[{id, code, name, note, maxKey, rx, sets:[{reps, pct, tempo}], velocity}], finTitle, fin[]}]`. `max_map` = which Lift Tracker lift each %-key (`clean`, `bench`, `squat`, `dl`, `ohp`) reads from, plus `window` and `overrides[athleteId][key]` (entered maxes, which win). `archived_at` hides from the list and the tablets, but still counts in Periodization |
| `workout_sessions` (v5.13.0) | one row per athlete × day done × program day: `session_date` (Central), `program_id`, `day_id`, `planned_date`, `sets` (which logged lift_logs belong to which set), `done` (checked-off work), `items_done` / `items_total`, start/finish, minutes, RPE. Unique `(athlete_id, session_date, day_id)`. Shown in Periodization: completed vs prescribed, and a Completed workouts table (v5.14.0) |
| `coaches` | access control (approved coaches only) |
| `alert_status`, `plyomat_sync_state`, `app_errors` | |

- **RLS is on for every table** (approved coaches).
- RPC `programs_for_tablets(d_from, d_to, undated_since)` (db/015, security invoker) feeds
  the rack tablets this week's and next week's team program days.
- **All dates are America/Chicago.** Use `getCentralDateString()`; never use UTC dates for
  "today".

## 8. Behaviour you must not break (and why it's that way)

- **Working weight** = `max(45 lb bar, round5(max × %))` for barbell work. Dumbbell or
  each-hand work keeps its own number (min 5), and on the tablet it's checked off rather than
  logged as the main lift (`isBarbell`).
- **Maxes:**
  - A program's max is the best est. 1RM in the chosen window.
  - The owner's entered maxes are stored as **per-program overrides**. Since v5.14.0 an
    import copies them from the latest program with the same name or team, and Edit maxes
    has "Copy maxes from…".
- **Rack tablet (Lift Kiosk):**
  - Building the rack (including "Select multiple" → Done adding) **doesn't open anyone's
    workout**. Each athlete taps their own name.
  - Today's dated day opens by default, and "Change workout" picks any team day this week or
    next.
  - Switching days is locked while the open day has anything logged or checked off.
  - The session lives in `localStorage` (`hpd_workout_<athleteId>_<date>`) and is saved to
    `workout_sessions` (batched; queued offline in `hpd_ws_pending`). It is restored on
    another rack.
  - The timer stops at the cap (`workoutTimerCapMin`, default 60).
- **Periodization:**
  - Counts every exercise: text prescriptions like "3x 8 ea" count as sets × reps; holds
    ("3x 20s") are sets but not reps; rep-outs and complexes ("6+", "2+1") count their reps.
  - Load and intensity use only sets with a %.
  - Main lifts are picked by name. RDLs are never "Deadlift"; split squats, DB bench and
    step-ups are never main lifts.
- **Uploads:**
  - .csv or .xlsx; the .xlsx reader needs no library.
  - Weekly-card workbooks import every tab at once; the tab name's date wins over dates
    copied from another week.
  - An athlete's own weights on a card are never copied.
  - PDFs and photos are refused on purpose.
- **Speed charts** (10yd Fly, lower is better) plot raw times, so faster sits lower, with a
  dashed least-squares trend line (`utils/trendLine.js`) that slopes down as the athlete
  gets faster. Never flip the axis. Jumps and lifts stay "up = better" with no trend line.
- **Progress Card:**
  - It must stay one Letter page; the content shrinks to fit (floor 0.7).
  - Charts are 150 × 60, and a PR is one "PR · date" tag.
  - Training counts every session RPE unless a range is picked. All RPE rows are fetched
    separately (`reports/rpeHistory.js`), because the app only holds `dataWindowDays`.
- **Usage:**
  - Fetch brakes on every bulk load.
  - The focus refresh is throttled.
  - Saves apply the returned row.
  - Realtime handlers are debounced.

## 9. Owner preferences and standing decisions

- Don't change layouts without a design. Keep strength & conditioning views at full detail.
- The dehydration threshold stays in **pounds** (2.0 lb). The exception is Perf vs Readiness,
  which uses % of body weight because the owner asked for it.
- Lifts display as the set ("225 × 3"); est. 1RM is an optional toggle. High-rep sets still
  count toward est. 1RM and PRs.
- Roster spellings: Ryleigh McClure, Anna McDowell. Wyatt Fryer is a TE.
- Workflow phrases: "push it" = deploy to `main`. "Check the errors" = query `app_errors`
  for rows newer than the last check.

## 10. Current data state (as of 2026-10-29)

- **WSOC FALL 26:**
  - Weeks 10–13 (10/26–11/20) are active, with per-athlete back squat and bench overrides
    from the owner's 10/28 maxes sheet.
  - Weeks 1–9 (8/17–10/12, 9/21 off) are archived, phases Capacity (Weeks 1–5) and
    Strength (Weeks 7–9).
- **MBB FALL 26:**
  - Weeks 1–9 are archived (same dates and phases).
  - **Weeks 10–13 haven't been uploaded yet.** When they are, set "Clean" → Power Clean and
    add the owner's maxes as overrides (power clean = 135 for every MBB athlete). The
    owner's maxes sheet isn't in the repo; ask the owner for it.
- A Football "Sample · Strength + Power" program is dated 10/28 (likely a test).
- Unconfirmed roster questions:
  - Logan Nottingham is on the owner's MBB roster but not in the app.
  - The app has "Nathan Folts"; the owner's sheet says "Foltz".
- `app_errors`: nothing new since 2026-10-26 12:40 UTC (fetch-brake trips on `athletes`).

## 11. Open items / next up (most useful first)

Done in v5.14.0 (from Antigravity): completed vs prescribed volume and a Completed workouts
table in Periodization, max carry-over on import plus "Copy maxes from…" on Edit maxes, the
egress and speed pass, and 44 px checkboxes / no sideways scroll on #entry and #reports.

1. **Intensity for non-% weeks.** The owner asked about August. Options already proposed: a
   per-week planned intensity (hollow dot), actual intensity from logged sets ÷ max, or time
   under tension for capacity blocks. Waiting on the owner's choice.
2. Optional: split front and back squat in the Periodization main lifts (offered, not asked).
3. Older open items are in `docs/HANDOFF.md` §145 (Next up): leaked-password protection and
   a "Forgot password" link, grades for athletes missing them, the Cheer & Dance jump
   technique, PPS/RSI test types, and a nicer Vercel domain.
4. Sustainability: deactivate Supabase's legacy anon key now that the publishable key is in
   use. The owner may move to Supabase Pro: the Free plan pauses after about 7 days of
   inactivity and has no backups.

## 12. Operations

- A **daily error check** runs as a Claude Code scheduled task around 14:10 UTC. It queries
  `app_errors` and only messages the owner when something is new. If you check errors
  yourself, compare against §10.
- Supabase Free plan watch-outs: 5 GB egress per month, pausing after inactivity, no
  backups. Usage dropped to about 0.1–0.3 GB/month after the v5.8 usage guards; keep it
  there.
- Rack iPads run the PWA in Lift Kiosk mode. After a deploy, reload each iPad once.

## 13. Docs index

- `docs/HANDOFF.md`: full change history (§1–§144) and the live Next-up list (§145).
- `VERSIONING.md`: one row per release.
- `docs/RUNBOOK.md`: the owner's runbook.
- `docs/PROJECT_HANDOFF.md`: older summary (v5.7.5). This file supersedes it.
- `docs/RLS-RUNBOOK.md`, `docs/RPE-PLAN.md`, `docs/plans/`, `docs/brand/`: background.
- `CONTRIBUTING.md`: multi-tool rules (commit and push before switching tools).

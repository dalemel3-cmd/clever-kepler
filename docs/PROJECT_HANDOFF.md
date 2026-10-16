# HPD App — Project Handoff (v5.7.5, Oct 16 2026)

Shiloh Christian Athletics **Human Performance Dashboard**. A coach-facing PWA for weigh-ins,
session RPE, lifts, jump/sprint testing and printable reports. This is the short version.
`docs/HANDOFF.md` has the full history: 125 numbered sections, one per change, with the reasoning.
`VERSIONING.md` has a one-line row per release.

## 1. Where things live

| What | Where |
|---|---|
| Code | GitHub `dalemel3-cmd/clever-kepler`, branch **`main`** (deploys to production) |
| Hosting | Vercel project `hpd-app` (`prj_ncps8jvmPs6dxRsOKgj8In4Pj2sI`); live at clever-kepler.vercel.app |
| Previews | push to branch **`preview-cleanup`** → Vercel preview URL |
| Database / auth | Supabase project `cwfpjlomlvkburugolky` (Postgres + RLS + realtime) |
| Schema | `db/001…014_*.sql` (numbered migrations, RLS policy in the same file as each table) |
| Errors | `app_errors` table (client + boot errors reported from `src/errorReporting.js`) |

Stack: React 19 + Vite PWA (vite-plugin-pwa, autoUpdate), Tailwind + inline styles, Recharts,
lucide-react, `html-to-image` (PNG export). Fonts: Oswald (display) + Manrope (body) from Google Fonts.

## 2. Working on it (the established workflow)

1. Implement → `npm run build`.
2. Test with Playwright against the built preview:
   - `npx vite preview --port 4173 --strictPort` (run in the background)
   - `CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/<name>.js`
   - `npm install` removes the untracked Playwright, so reinstall with `npm i --no-save playwright@1.56`.
   - Tests stub Supabase (`tests/lib/auth-stub.js`) and never touch the real DB.
3. Bump the version one patch step in **3 places**: `APP_VERSION` in `src/utils/athleteData.js`,
   `package.json`, and `package-lock.json` (2 occurrences).
4. Add a row to `VERSIONING.md` and a `## N.` section to `docs/HANDOFF.md`, then `## N+1. Next up`.
5. Commit, then `git push -qf origin HEAD:preview-cleanup` and get the preview URL from Vercel.
6. **Push to `main` only when the owner says "push it".**
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01AxinCXMMqEZW6mjAfTj1Lx`.
  No model identifiers anywhere else in the repo.

## 3. Owner preferences and standing decisions

- Don't change layouts unless the owner supplies a design. Keep the S&C views at full detail.
- **Dehydration threshold stays in pounds** (2.0 lb), not %, so staff have one hard number to act on.
  (The Perf vs Readiness flag is the deliberate exception: it uses % of body weight, as the owner asked.)
- High-rep sets still count toward est. 1RM / PRs.
- **Lifts display as the set ("225 × 3")**; est. 1RM is an optional toggle on reports.
- Leave the 3 empty WSOC RPE rows from 9/28 and the old 8.0 h sleep rows as they are.
- Roster spellings: Ryleigh McClure, Anna McDowell. Wyatt Fryer is TE.
- Programs are a **web-side printing tool**, not a logging area. Nothing is cached on the iPads.

## 4. App map (nav = `src/navigation.js`)

- **Today:** Overview (RPE team cards with 7-day chart, weigh-ins left by sport), Alerts.
- **Log:**
  - Weigh-In & RPE kiosk (iPad layout tuned)
  - Lifts (Lift Tracker, Team Log, printable leaderboard)
  - **Programs** (Program Builder + Weight Room Card)
- **Teams:** By Sport, Athletes (profile → **Progress Card**).
- **Performance:**
  - Analytics
  - RPE (deep dive + **RPE Team Log** for manual mass entry)
  - Strength
  - Jumps & Sprints (printable leaderboard, **Perf vs readiness**)
  - **Readiness Report**
- **Settings:** thresholds, lift types, RPE labels, season start, coach access.

## 5. Printables (all US Letter, print-isolated via portal + body class)

| Report | File | Notes |
|---|---|---|
| Printable leaderboard | `features/leaderboard/PrintLeaderboard.jsx` | Top 10 + roster pages, PDF/PNG, custom dates, column toggles (Pos, Class, Initial, Recent, change vs 1st / last week, Est. 1RM) |
| Readiness Report | `features/reports/ReadinessReport.jsx` + `readinessData.js` | Tiles, CLEAR lines, mass drop, sweat, sleep, A:C load, flags, PRs, weigh-in needed; section toggles |
| Perf vs Readiness | `features/reports/PerfReadinessReport.jsx` + `perfReadinessData.js` | Jumps/sprints vs baseline weight and load. Flag = 11%+ off best **and** 2%+ body weight down (both editable). Compare column (10yd Fly), column toggles, athlete pages |
| Progress Card | `features/reports/ProgressCard.jsx` + `progressCardData.js` | Fixed 10 metrics + body mass (N/A if untested), PB big / recent on the chart, team rank, Training strip, × BW, focus, coach's note, per-metric toggles, shrink-to-fit to one page |
| Weight Room Card | `features/programs/WeightRoomCard.jsx` + `programData.js` | Landscape, one page per athlete. WT = max(45, round5(max × %)). Max window + per-athlete overrides (marked *) |

Print-isolation pattern: render into a portal root, add a body class (`lb-/rr-/pr-/pc-/wr-printing`), and use
`html body.<class> > #root { display:none !important }`. That selector is needed to beat the `styles.css` print rule.
Inject `@page` only while the view is open.

## 6. Data model notes

- `weigh_ins`: weigh-ins, post-practice checks (`session_type='post_practice'`) and session RPE
  (`session_type='rpe'`, `rpe`, `session_minutes`, `session_label`) all in one table. Use `isRpeLog`,
  `isPostPracticeLog` and `hasWeight` from `utils/athleteData.js`. Never hand-roll these checks.
- `lift_logs` (weight × reps; est. 1RM = Epley `w × (1 + reps/30)`), `performance_tests`
  (`test_type` + `test_variant`; note the broad jump is stored as `board_jump`), `athletes`, `app_errors`.
- Shared calculations to reuse, not rewrite: `computeAcuteChronicLoad`, `getAthleteBaseline`,
  `getWeeklyWeightDelta`, `getCentralDateString`, `centralWallTimeToISO` (all dates are America/Chicago).
- Offline: the kiosk queue lives in `shiloh_offline_weigh_ins`, lifts in `utils/insertQueue.js`.
  `skewSafeFetch` retries a "JWT issued at future" 401.

## 7. Open items / next up

1. **Run `db/014_programs.sql` in the Supabase SQL editor.** The `programs` table doesn't exist yet,
   because the Supabase connector's migration call times out waiting for an approval. Until it's run,
   programs stay in the one browser that made them; they upload automatically after.
2. **Recruiting One-Sheet** (handoff zip 3, report #2) is not built. It needs new athlete fields:
   photo, height, wingspan, jersey, film URL, GPA, ACT, NCAA ID, contacts. Waiting on the owner to decide
   where the fields go, photo storage vs link, and who can see GPA/contacts.
3. **Sleep data is effectively empty.** Since the prefill was removed on Oct 1, only one real entry exists.
   Sleep-based checks show "clear" until athletes enter sleep.
4. Correlation work: day-to-day effects (weight/load → jumps) need RPE logged in the week before test days.
   A standing "Correlations" panel was offered but not built.
5. The PostHog connector isn't authorized, so there are no page-speed metrics.
6. Daily routine `trig_011nH3UqdiY4aPGyzk2qRpct` checks `app_errors` at about 14:10 UTC. It only messages
   the owner when there are new errors. The last error was 2026-10-06 13:04 (stale entry chunk, fixed in v5.4.10).

## 8. Tests worth running after changes in these areas

`readiness-report`, `perf-readiness`, `print-leaderboard`, `progress-card`, `program-builder`,
`rpe-team-log`, `rpe-dashboard`, `nav-cleanup`, `weekly-weight-change`, `boot-stale-entry`
(66 test files in `tests/` in total).

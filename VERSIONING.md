# Versioning

Every push that changes the app bumps the version, so you can confirm at a glance
that what's deployed is what you just shipped.

## The rule

| Kind of push | Bump | Example |
|---|---|---|
| **Small** — bug fix, copy tweak, styling, perf, refactor with no new behavior | **Patch** — third number | `4.3.0` → `4.3.1` |
| **Large** — new feature, new setting, schema change, or anything that changes how the app behaves | **Minor** — second number | `4.3.1` → `4.4.0` |

A minor bump resets the patch number to `0` (`4.3.7` → `4.4.0`, never `4.4.7`).

### The minor number rolls over at 20

The minor number does not climb forever. Once a minor bump would take it to `20`,
bump the **major** number instead and reset minor and patch to `0`:

`4.19.0` → next feature → `5.0.0` (not `4.20.0`)

This is the only thing that moves the major number in normal operation - it's a
mechanical rollover, not a judgment call about how big the release is, so it needs no
extra discussion when it happens. A release that breaks existing data or is a full
rewrite is the other, rarer reason to bump major; that one *is* a deliberate call.

Either way, a major bump always resets both minor and patch to `0`.

### Quick test for which one
Ask: *"Would a coach notice something new or different in how the app works?"*
- **No** → patch. It's a fix or an invisible improvement.
- **Yes** → minor. It's a feature.

## Where to change it

Two files, and they must match:

1. `src/utils/athleteData.js` → `export const APP_VERSION = 'v4.4.0';`
2. `package.json` → `"version": "4.4.0"`

`APP_VERSION` is what renders in the app. `package.json` keeps the repo honest.
Note the `v` prefix belongs **only** in `APP_VERSION`.

## Confirming a deploy

The version shows in three places:
- Desktop: gold badge at the bottom of the sidebar
- Desktop header: right-hand status pill, after the `|`
- Mobile: bottom of the **More** menu

If the badge still shows the old number after a deploy, the service worker is
serving the cached build — close and reopen the app (or hard-refresh the tab).

## History

| Version | What shipped |
|---|---|
| `4.29.1` | Fix: Lift Tracker's entry modal now pops up instantly wherever a coach taps "Log Set" on an iPad, instead of drifting with the roster's momentum scroll underneath it (a Mobile Safari bug where `position: fixed` inside a `-webkit-overflow-scrolling: touch` container doesn't stay pinned to the viewport). The modal now renders through a React portal straight onto `<body>`, escaping the scrolling roster entirely |
| `4.29.0` | Lift Tracker "Log a Lift" redesign: recency-first instead of an alphabetical roster grid. A "Today's session" row surfaces whoever this coach already logged today (tap to jump straight to their entry modal); the roster below is now a row list with a single search field, single-select group pills (was: search + a wall of sport pills), and each row states the athlete's last body weight and last-logged lift date with a Current/Stale badge (14-day default window, same `baselineExpiryDays` threshold used elsewhere) - a coach can spot who's gone quiet on lifting without opening Profiles |
| `4.28.0` | Dashboard: dropped the "Start today's session" heading and subtext from the Pre-Session Action Banner so the Start Weigh-Ins / Session RPE / Post-Practice buttons read as the main focus (a small status label still marks pending vs. complete). Internal Load Metrics now collapses behind a chevron like the Session Accountability Tracker below it, closed by default to save space. Lift Tracker's search bar and sport filters are now sticky at the top of the Log a Lift view, so they stay reachable while scrolling a long roster on an iPad instead of requiring a scroll back to the top |
| `4.27.0` | Kiosk search collapses matches into compact pills instead of full-size cards (fixes a match looking like its own oversized box on an iPad). Session RPE, Speed & Power, and Lift Tracker now default ON for a fresh install/new device, instead of each needing to be toggled on in Settings - the toggle to turn one back off still exists |
| `4.26.0` | New Lift Tracker (off by default, Settings -> Lift Tracker): select an athlete, log a lift (Bench/Squat/Deadlift/Hang Clean/Power Clean by default, extendable in Settings -> Lift Types), weight + reps. Team leaderboard per lift ranks by estimated 1RM (Epley), not raw weight. New `lift_logs` table (`db/009`) |
| `4.25.0` | Analytics' Average Body Weight chart now names its sample size — an off-cycle recheck of a few flagged athletes averages honestly instead of reading as an unexplained spike. Caption explains the averaging; the tooltip shows "N athletes weighed in this day" per point (`CustomTooltip`'s new `counts` prop, reusable by any other team-average chart) |
| `4.24.0` | A profile's log-edit modal can now correct a Session RPE entry (RPE, session duration, and label) — it previously only handled weigh-ins/post-practice sweat checks, so an RPE row's Edit button opened a modal with no RPE fields and any save attempt just failed weight validation |
| `4.23.0` | UX pass: a team with zero weigh-ins ever (jump-only teams) reads as "not tracking weigh-ins" on the dashboard instead of a permanent, alarming compliance gap; the kiosk's track-mode toggle is color-coded per mode with a large banner naming the active non-default mode (Session RPE / Sleep Only), so it's no longer a small easy-to-miss pill; the profile roster card's Speed & Power / RPE tiles read "Not Tested" / "No RPE Logged" instead of an ambiguous "--" |
| `4.22.0` | Dashboard: Internal Load Metrics is now a single team-at-a-time card picked from a dropdown (was one card per sport, all visible at once); clicking it opens that team's roster, same as the accountability tracker's cards. Profiles roster card: weight (+ trend, now a %) moved to a compact line under the athlete's name; the freed KPI tile shows Most Recent RPE alongside Best Vertical/Fly 10/Broad Jump |
| `4.21.2` | Kiosk in Session RPE mode now checks an athlete off ("DONE") after they log RPE, instead of only after a weigh-in. Dashboard's team-wide daily-compliance board is unchanged (still weigh-ins only) |
| `4.21.1` | MBB and Softball's jump technique confirmed as Arm Swing: 34 + 43 historical `vertical_jump`/`board_jump` rows backfilled from `test_variant = null`, and `TEAM_VARIANT_DEFAULTS` now defaults both teams' entry form to Arm Swing. Cheer & Dance's 1 row remains unconfirmed |
| `4.21.0` | Analytics: Daily Logging Compliance removed (chart + top tile); Recovery (avg sleep) replaces it as a top tile; new Team Trend chart averages Speed & Power results across the roster per test day, with a technique picker for jump types. SpeedPowerPanel's leaderboard: a jump with multiple techniques is now one board with a technique dropdown, not three side-by-side boards |
| `4.20.0` | Math + data-integrity audit: manual entry now actually persists `test_variant`; the change-probe no longer full-fetches on every heartbeat after viewing 60/90 days; one shared acute:chronic helper (was two disagreeing copies) with a ~10% inflation bias removed; comparison chart keyed on athlete_id so renamed athletes still plot; Recovery Index card self-consistent; 141 duplicate weigh-ins + 3 duplicate tests removed (`db/008`) |
| `4.19.0` | `test_variant` on performance_tests: tags which protocol/technique a jump or Fly 10 result was measured under (hands-on-hips vs. arm-swing jump technique; Fly 10's 10yd-build+10yd-fly protocol, versioned ahead of a future distance change), so two protocols never get silently averaged into one ranking |
| `4.18.0` | Versioning rollover rule (this doc); Analytics 60/90-day windows now fetch real history instead of padding with empty days; Speed & Power profile cards show best *and* most recent; Reports labels dehydration as baseline-dated and the weight leaderboard as true week-to-week; Analytics compliance/sleep cards collapse by default; Team Entry mode for Sprint & Jump testing |
| `4.9.0` | Coach sign-up with approval gating: creating an account grants nothing until an approved coach approves it (`db/003_coach_approval.sql`) |
| `4.8.0` | Supabase auth: login screen, kiosk session persistence, sign-out; RLS policies + rollout runbook (see `docs/RLS-RUNBOOK.md`) |
| `4.4.0` | Removed all hardcoded values; every threshold, window, label, and sports list is now a live setting |
| `4.3.0` | Adaptive cloud sync (~95% less egress), toasts replacing blocking alerts, honest connection status |
| `4.2.1` | Performance: cached lookups, memoized scans, poll fingerprinting, table pagination |
| `4.2.0` | Version bump to verify deployment |
| `4.1.5` | Data-loss, crash, and validation fixes found in stress testing |

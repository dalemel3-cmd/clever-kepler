# Test Suite

Browser-driven regression tests for the HPD App. Every one of these was written to
catch a specific bug that actually shipped — they exist so those bugs can't come back.

**These tests never touch the real database.** All Supabase traffic (REST and
realtime) is intercepted by Playwright and answered with mock data, so you can run
them freely against production credentials without writing a single row.

## Running them

```bash
# 1. Build and serve the app
npm run build
npm run preview          # serves http://127.0.0.1:4173

# 2. In another terminal, install Playwright (not a project dependency on purpose —
#    keeping it out of package.json keeps deploy builds fast)
npm install --no-save playwright
npx playwright install chromium

# 3. Run any suite
node tests/stress.js
node tests/data-integrity.js
node tests/offline-recovery.js
node tests/sync-and-ux.js
node tests/settings-live.js
```

Each prints a line per check with the expected value beside the actual one, so a
regression is obvious without needing a test framework.

**Environment overrides**
- `APP_URL` — point at a different server (default `http://127.0.0.1:4173`)
- `CHROMIUM_PATH` — use a preinstalled Chromium instead of Playwright's

## What each suite covers

### `stress.js`
Load and scale. 150 athletes / ~1,900 weigh-ins: every screen, alert tabs, frame
rate and long tasks while idle, rapid numpad entry, a double-click save race,
garbage weight values (`0`, `-50`, `999999999`, `1.2.3`), the manual-log modal with
a cleared date, offline queue behavior, a 150-navigation soak with heap check, and
the reports table row count.

### `data-integrity.js`
The four data-corruption bugs:
- A null/blank athlete name must not white-screen Entry or Profiles
- Editing an athlete must not wipe the JSON baseline metadata stored in `position`
- The weight leaderboard must ignore sleep-only logs (they showed as `185 → 0 lbs`)
- The offline queue must survive a hard connection failure instead of being dropped

### `offline-recovery.js`
The full outage cycle: save while the server returns 500s, confirm the record stays
queued through repeated failed heartbeats, bring the server back, confirm it uploads
automatically and the unsynced badge clears.

### `sync-and-ux.js`
- **Egress**: 45s idle should cost 0 full table pulls (only tiny change-probes)
- **Focus refresh**: waking the tab triggers exactly one full fetch
- **Honest status**: a dead server must not display "CLOUD LIVE"
- No mock athletes when offline with an empty cache
- Weight input starts empty with the last weight as a ghost placeholder
- "Wipe Database" requires typing `WIPE` before the DELETE can fire
- Toasts replace blocking `alert()` dialogs

### `settings-live.js`
Proves settings are actually wired, not just relocated. Each check changes a setting
and verifies real UI behavior changes: program identity in the sidebar, dehydration
flagging flipping between 1% and 2%, report headers echoing thresholds, the same
7.0h sleep log reclassifying when the cutoff moves, the chart target label, fluid Rx
scaling with oz/lb, sports pickers, weight bounds blocking a save, the install host,
restore-defaults round trip, and recovery from corrupt stored settings.

## Adding a test

When you fix a bug, add a check here that fails on the old behavior. The pattern is
deliberately plain — launch Chromium, intercept `**/*.supabase.co/**`, drive the UI,
`console.log` the result next to what you expected. No framework, no config.

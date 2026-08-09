# Versioning

Every push that changes the app bumps the version, so you can confirm at a glance
that what's deployed is what you just shipped.

## The rule

| Kind of push | Bump | Example |
|---|---|---|
| **Small** — bug fix, copy tweak, styling, perf, refactor with no new behavior | **Patch** — third number | `4.3.0` → `4.3.1` |
| **Large** — new feature, new setting, schema change, or anything that changes how the app behaves | **Minor** — second number | `4.3.1` → `4.4.0` |

A minor bump resets the patch number to `0` (`4.3.7` → `4.4.0`, never `4.4.7`).

The first number (major) only moves for a full rewrite or a release that breaks
existing data. Don't touch it without deciding to deliberately.

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
| `4.9.0` | Coach sign-up with approval gating: creating an account grants nothing until an approved coach approves it (`db/003_coach_approval.sql`) |
| `4.8.0` | Supabase auth: login screen, kiosk session persistence, sign-out; RLS policies + rollout runbook (see `docs/RLS-RUNBOOK.md`) |
| `4.4.0` | Removed all hardcoded values; every threshold, window, label, and sports list is now a live setting |
| `4.3.0` | Adaptive cloud sync (~95% less egress), toasts replacing blocking alerts, honest connection status |
| `4.2.1` | Performance: cached lookups, memoized scans, poll fingerprinting, table pagination |
| `4.2.0` | Version bump to verify deployment |
| `4.1.5` | Data-loss, crash, and validation fixes found in stress testing |

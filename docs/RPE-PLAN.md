# Session RPE — Implementation Plan

**Target release:** v4.5.0 (feature → minor bump, per `VERSIONING.md`)

Athletes rate each session 1–10 after the lift, run, or combination.
1 = no external load, very easy. 10 = maximal external load, very hard.

---

## 1. Why this is worth doing properly

RPE on its own is useful. RPE **× session duration** gives you *training load*, which
is the number sports science actually uses to predict injury risk — and it's a far
stronger signal than weight fluctuation alone.

The real payoff is the combination you'll then have on one screen:

> **High RPE + low sleep + weight drop on the same day** = a genuine red flag,
> much stronger than any one of those signals by itself.

That combined view is the reason to build this, and it should shape where the data
goes rather than being an afterthought.

---

## 2. Data model

### Recommendation: columns on `weigh_ins`, not a new table

| Approach | Pros | Cons |
|---|---|---|
| **A. Columns on `weigh_ins`** ✅ | Reuses the entire sync, offline queue, hardware vault, realtime, and history pipeline for free | Rows now have nullable weight/sleep — a known hazard (see below) |
| B. Separate `sessions` table | Cleaner separation, no null sprawl | Duplicates the offline queue and sync logic, which is the most safety-critical code in the app |

Go with **A**. The offline queue is the crown jewel of this app and duplicating it is
the riskiest thing we could do. But A comes with a trap we have already hit twice.

### ⚠️ The trap: null-weight rows corrupt weight analytics

This exact bug class has already shipped twice — sleep-only logs (`weight_lbs = 0`)
showed as `185 → 0 lbs, -185 lbs` on the leaderboard, and post-practice logs
false-flagged every athlete as dehydrated. RPE-only rows create the **same hazard**.

**Mitigation — mandatory:** add centralized predicates to `src/utils/athleteData.js`
and use them everywhere instead of ad-hoc filters:

```js
export const isRpeLog   = (r) => r?.session_type === 'rpe' || (r?.rpe != null && !r?.weight_lbs);
export const hasWeight  = (r) => r?.weight_lbs != null && Number(r.weight_lbs) > 0;
export const hasSleep   = (r) => r?.sleep_hrs != null && Number(r.sleep_hrs) > 0;
```

Then audit every consumer that assumes a row carries weight:

- [ ] `ReportsScreen` — dehydration list, leaderboard (`gains`), expired baselines
- [ ] `DashboardScreen` — NEEDS ATTENTION latest-record lookup
- [ ] `ProfilesScreen` — `weightLogs`, `postPracticeLogs`, min/max/delta, ledger
- [ ] `App.jsx` — `executiveInsights` hydration flags, `renderNegativeSweatDropCards`,
      `getDailyAlerts`, `getWeeklyAlertsList`
- [ ] `getAthleteBaseline` — must never pick an RPE row as a baseline
- [ ] `RosterScreen` — latest weight card
- [ ] Compliance counts — decide whether an RPE entry counts as "logged today"
      (recommendation: **no**, keep that meaning morning weigh-in)

### Migration

```sql
alter table public.weigh_ins add column if not exists rpe smallint;
alter table public.weigh_ins add column if not exists session_minutes integer;
alter table public.weigh_ins add column if not exists session_label text;

alter table public.weigh_ins
  add constraint weigh_ins_rpe_range
  check (rpe is null or (rpe between 1 and 10));

-- Load is derived, not stored, so changing the formula never needs a backfill.
```

> **Apply the migration BEFORE deploying the app.** This is exactly what bit the
> roster: the app wrote a `grade` column that didn't exist, so PostgREST rejected
> every insert — CSV import failed outright and Add Athlete silently fell back to
> device-only storage. Same failure mode applies here. Migration first, deploy second.

`session_label` is free text holding `Lift` / `Run` / `Combined` so it stays driven by
settings rather than a hardcoded enum.

---

## 3. New settings

Per the v4.4.0 no-hardcoded-values rule, everything below goes in `src/settings.js`:

```js
enableRpe: false,              // ship dark, switch on when ready
rpeTrackDuration: true,        // whether to ask for session minutes
rpeScaleMax: 10,
rpeHighThreshold: 8,           // at/above this = a hard session
rpeSessionLabels: ['Lift', 'Run', 'Combined'],
rpeLoadSpikeRatio: 1.3,        // acute:chronic workload ratio that triggers an alert
rpeChronicWeeks: 4,            // rolling window for the chronic baseline
```

`enableRpe` is deliberate: it lets the feature ship to production and stay invisible
until you flip it on, which pairs well with rolling this out mid-season.

`rpeTrackDuration` resolves the open duration question without having to answer it
now — build both paths, default to on, turn it off if the extra tap annoys athletes.

---

## 4. Where each piece of UI goes

### 4.1 Kiosk Entry — the primary home
`src/features/entry/EntryScreen.jsx`

Add a third track mode beside `both` / `sleep_only`: **`rpe`**.

Important timing note: weight and sleep are logged in the **morning**; RPE is logged
**after the session**. Same athlete, different time of day — so this is its own quick
flow, not an extra field on the morning card.

Flow: tap athlete card → 1–10 grid → (optional duration) → save. Target ~5 seconds
per athlete walking out of the weight room.

- Buttons in a 5×2 grid, **minimum 44px touch targets** (an outstanding a11y issue
  elsewhere in the app — don't repeat it here)
- Color-graded green (1) → amber (5–7) → red (8–10), reusing the existing status colors
- One tap selects; a second tap on the same number confirms and saves, or use the
  existing Save button — pick one and be consistent
- Duration: quick-pick chips (30 / 45 / 60 / 75 / 90 min) plus a manual field, shown
  only when `rpeTrackDuration` is on
- Reuse the existing `athletesRecordedToday` "DONE" treatment, but as a **separate
  indicator** — an athlete can have a morning weigh-in and still owe an RPE

### 4.2 Dashboard — "Today's Session Load"
`src/features/dashboard/DashboardScreen.jsx`

A card near NEEDS ATTENTION showing:
- Team average RPE today + how many athletes reported
- **Outliers**: anyone ≥ `rpeHighThreshold` when the team average is well below it.
  That's the coaching signal — they either struggled or were worked harder than intended
- Response-rate bar, mirroring the existing compliance tracker

### 4.3 Athlete Profile — the real payoff
`src/features/profiles/ProfilesScreen.jsx`

- Third chart beside weight and sleep: RPE over time (bar chart, colored by band)
- KPI tiles: 7-day load total, average RPE, **acute:chronic ratio**
- In the historical ledger, add RPE and load columns; RPE-only rows should render
  weight as `—` (same treatment we gave sleep on non-sleep rows)

### 4.4 Alerts — where it earns its keep
`src/features/alerts/AlertsScreen.jsx` + the generators in `App.jsx`

Two new alert types:
1. **Acute load spike** — 7-day load ÷ (chronic average) > `rpeLoadSpikeRatio`
2. **Compounded risk** — high RPE **and** low sleep **and** weight drop on the same
   day. This is the flag worth building the whole feature for

### 4.5 Reports
`src/features/reports/ReportsScreen.jsx`
- RPE + load columns in the raw log table
- A session-load section (team/sport averages over the timeframe), behind the
  existing custom-metric toggle
- Include in CSV export

### 4.6 Manual log modal — coach fallback
`src/App.jsx`
Add RPE to the existing modal so a coach can enter or correct one, same as they can
for post-practice weights.

> **Open question worth deciding:** RPE is a *subjective self-report* — it only means
> something if the athlete gives it, not if a coach estimates it. Recommendation:
> athlete enters at the kiosk; coach entry exists only for corrections, and is
> labelled as such.

---

## 5. Sync flow

With Option A this is mostly free, but three payload builders must learn the new
fields or they'll be silently dropped:

- [ ] `handleSave` → `cloudPayload`
- [ ] `syncOfflineCache` → `cleanPayload` **and** the minimalist retry fallback
      (that fallback strips unknown columns — if the migration is missing, records
      would sync *without* their RPE and look fine. Migration first.)
- [ ] `handleSaveManualLog` / `handleUpdateManualLog`

Everything else — offline queue, retry, hardware vault, realtime broadcast, the
change-probe fingerprint — works unchanged.

---

## 6. Build order

Each phase is independently shippable.

| Phase | Scope | Version |
|---|---|---|
| 0 | Migration + settings + centralized predicates + audit the filter list above | — |
| 1 | Kiosk RPE entry + sync payloads. Feature flag on for testing only | v4.5.0 |
| 2 | Dashboard session-load card | v4.5.0 |
| 3 | Profile chart + load KPIs | v4.6.0 |
| 4 | Alerts (load spike, compounded risk) | v4.7.0 |
| 5 | Reports + CSV | patch |

Phase 0 is not optional. Doing it first is what prevents the null-weight bug class
from shipping a third time.

---

## 7. Testing

New `tests/rpe.js` following the existing pattern:
- RPE-only rows do **not** appear in the weight leaderboard, dehydration list, or
  baseline selection
- An RPE row never becomes an athlete's baseline
- Compliance counts still mean "morning weigh-in", not "any log"
- Offline RPE entry queues and uploads on recovery, with the RPE value intact
- Load math is correct across a known fixture
- Scale bounds enforced (rejects 0 and 11)

Also extend `tests/data-integrity.js` with an RPE-only row in its fixture, so the
existing corruption checks cover the new row type automatically.

---

## 8. Decisions still open

1. **Duration** — build it (`rpeTrackDuration: true` by default). Without it you have
   RPE; with it you have load, which is what the alerts in 4.4 need. Easy to switch off.
2. **Who enters it** — athlete at the kiosk, coach entry for corrections only.
3. **Does RPE satisfy "logged today"?** Recommendation: no. Keep that meaning the
   morning weigh-in, and track RPE response separately.
4. **Backfill?** No. Load starts accumulating from launch; the chronic baseline needs
   ~4 weeks before the spike alert is meaningful. Worth telling coaches up front so
   the alerts aren't distrusted when they're quiet at first.

# HPD App: Owner's Runbook

How to keep the Human Performance Dashboard running with no further development.
Written for the program owner, not a developer. The developer docs are
`docs/HANDOFF.md` (every change, by section) and `docs/PROJECT_HANDOFF.md` (architecture).

## What the app is made of

| Piece | What it does | Where you manage it |
|---|---|---|
| **Vercel** (project `hpd-app`) | Hosts the website at clever-kepler.vercel.app. Serves the same build until someone pushes new code. | vercel.com |
| **Supabase** (project `cwfpjlomlvkburugolky`) | The database, coach sign-in, live sync between devices, and the Plyomat sync function. | supabase.com/dashboard |
| **GitHub** (`dalemel3-cmd/clever-kepler`) | The code. Vercel rebuilds the site only when the `main` branch changes. | github.com |
| **Plyomat API key** | Lets "Sync from Plyomat" pull jump data. Stored in Supabase as the `PLYOMAT_API_KEY` secret. | Supabase → Edge Functions → Secrets |

Nothing runs on a schedule that you have to maintain. The iPads and computers do all the work in the browser; Supabase stores the data.

## Runs on its own (no action needed)

- **Season start date** rolls forward a year on the same day each year (Settings → Season Start Date), so "This season" stays right.
- **Tablet storage** cleans itself: yesterday's workout sessions are removed when Lift Tracker opens, and today's programs are the only ones a tablet downloads.
- **Usage safety brake**: if a bug ever makes a device download the same data over and over, it's cut off after a few tries per minute (errors are logged as `fetch-brake`).
- **Offline queue**: check-ins, lifts and RPE saved with no signal upload when the signal comes back.
- **Sign-in**: kiosk iPads stay signed in indefinitely as long as they're opened now and then.

## Once a year (August, before the season)

1. **Roster:** import new athletes (Settings → Upload CSV) and archive the athletes who left (Athletes → edit the athlete → Archive). Archived athletes keep their history and can be restored from Archived.
2. **Coaches:** approve new staff in Settings → Coach Access. New sign-ups wait there until approved.
3. **Supabase usage:** open the dashboard's Usage page. If anything is near its limit, upgrade (see below).
4. **Plyomat:** run one "Sync from Plyomat". If it says the API key is invalid, get a new key from Plyomat and paste it into Supabase → Edge Functions → Secrets → `PLYOMAT_API_KEY`.
5. **Tablets:** open the app on every iPad once, so each one loads the latest version.

## Planning programs in Excel

Programs → **Download template** offers two layouts: **Weekly grid** (Day sections down, weeks across, like a printed sheet) and **One row per set**. Fill either in Excel or Google Sheets, save or download it as **CSV**, then **Upload programs** (the app tells which layout it is). An existing week-across sheet can be uploaded as-is: each week becomes a program, and you pick the program name, team, phase and training days (e.g. Day 1 = Mon) before importing. The upload shows what it found and anything to check before saving, and always adds new programs (nothing existing is changed). **Download CSV** on any program gives the same layout to edit and re-upload. **Periodization** shows volume and intensity by day, week or month across all programs that have dates.

## Plan limits to know (Supabase Free plan)

- **5 GB a month of downloads (egress).** Normal use is about 0.1–0.3 GB a month. A bug in Oct 2026 used 40 GB in a night, which is why the safety brake exists.
- **Pausing:** a Free project with little activity for about a week gets paused (Supabase emails a warning first). Over a long break, open the dashboard and click **Resume project**. Data is kept.
- **No automatic backups** on Free.
- **Pro plan ($25/mo)** removes pausing, adds daily backups and 250 GB of egress. It's the simplest way to make the app hands-off. Upgrade in Supabase → Organization → Billing.

## If something goes wrong

| What you see | Likely cause | What to do |
|---|---|---|
| Every device says **Reconnecting** and shows no new data | Supabase paused, restricted (over quota) or down | Open the Supabase dashboard: **Resume project** if paused; if it says the project is restricted, upgrade to Pro (lifts it immediately) or wait for the billing cycle to reset. Check status.supabase.com for outages. |
| One iPad is stuck or shows old data | Old cached copy | Close and reopen the app. If that doesn't fix it: Settings → Clear Local App Cache on that device, then sign in again. |
| A coach can't get in | Not approved, or forgot password | Approve them in Settings → Coach Access. Passwords can be reset from Supabase → Authentication → Users. |
| "Plyomat sync isn't configured correctly" | Plyomat key expired or changed | Replace `PLYOMAT_API_KEY` (see above). |
| A workout doesn't show on the rack tablet | The program has no team, or no day dated today | In Programs, set the program's **Default team** and the day's **Date**. The tablet checks again every 10 minutes (or reopen Lift Kiosk Mode). |
| Someone deleted data by mistake | No backups on Free | On Pro: Supabase → Database → Backups → restore. On Free, there's nothing to restore from, so keep exports (Settings → Export All Records (CSV)). |

## Platform emails worth reading

- **Supabase** sends notices about Postgres upgrades, deprecations and usage. Upgrades are done from the dashboard (Settings → Infrastructure) and keep your data.
- **Supabase API keys:** the legacy `anon` key stops working at the end of 2026. The app switched to the new publishable key in v5.10.1, and the Plyomat function reads the new key too. Once v5.10.1 is live and working, the legacy key can be turned off in Supabase → Settings → API Keys (optional; Supabase retires it either way).
- **Vercel** may announce that an old Node.js version is retired. That only affects *new* builds; the live site keeps running.

## Still to do for fully hands-off running

| Item | Why | Status |
|---|---|---|
| Upgrade Supabase to Pro | No pausing over breaks, daily backups, quota headroom | Owner decision |
| Turn off the legacy `anon` key after v5.10.1 is verified live | Clean break before Supabase removes it | After v5.10.1 ships |
| In-app **System health** panel (errors this week, pending uploads, last sync, version) | Lets staff spot problems without a developer or the daily error check | Planned |
| One-click **full backup** download (every table) | A backup option on the Free plan | Planned |
| Trim old `app_errors` rows (keep 90 days) | Table grows slowly forever (tiny today) | Optional |
| Lift and test history download | Each device downloads the full history once a day; fine for years (about 1,000 lift rows now). Revisit near 10,000 rows. | Watch |

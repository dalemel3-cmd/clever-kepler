# RLS Rollout Runbook

Locks the database down so the public anon key can no longer read or modify athlete
data. Do this in a window when nobody is using the app.

**The order matters.** The app is deployed with a login screen *first*, while the
database is still open. Only the last step protects the data, and it is one line to undo.

> ⚠️ **The login screen goes live the moment v4.8.0 deploys — it does not wait for RLS.**
> The gate is in the app itself; RLS only controls whether the *data* is protected.
>
> The practical consequence: **any device that has not signed in is looking at a login
> screen right now**, including the weight-room kiosk. Athletes cannot log anything on
> a device until someone signs in on it. Sign in on the kiosk before the next session —
> Step 2 is blocking, not preparation.

---

## Before you start

- [ ] v4.8.0 (or later) is deployed and the version badge confirms it
- [ ] The kiosk iPad has been signed in (see the warning above — it is gated already)
- [ ] Nobody is mid-session — no weigh-ins happening
- [ ] You can reach Supabase → SQL Editor
- [ ] `db/002_rollback_rls.sql` is open in a tab, ready to paste
- [ ] **Public sign-ups are disabled** — see Step 1b. Skipping this undoes most of
      what RLS buys you.

---

## Step 1 — Create your login

**Supabase → Authentication → Users → Add user → Create new user**

- Enter an email and a strong password
- ✅ Tick **Auto Confirm User** (otherwise the account can't sign in until the email
  is confirmed, and the app will just say the credentials are wrong)

**Decided: one shared coach login.** Create a single account that every device and
every coach uses. The policies are identical either way, so this can be revisited
later without touching the app — adding per-coach accounts is just adding users.

Store the password somewhere durable (a password manager, not a sticky note on the
iPad). It is the key to all athlete data.

The kiosk iPad signs in with these same credentials. That's expected: the *device* is
trusted, athletes still just tap their own card.

⚠️ **The one consequence of sharing a login:** you can't revoke access for one person.
If someone with the password leaves the program, change the password in Supabase
(Authentication → Users → the account → Reset/Update password) and sign in again on
each device. That's the trade for the simpler setup. If that ever becomes a regular
occurrence, switch to per-coach accounts — no app changes needed.

---

## Step 1b — Turn OFF public sign-ups (do not skip)

**Supabase → Authentication → Providers → Email → uncheck "Enable sign ups"**
(older dashboards: Authentication → Settings → "Allow new users to sign up")

The anon key is public, and Supabase's sign-up endpoint is public with it. If sign-ups
are enabled, **anyone who finds the URL can create their own account** — and the policy
below grants every authenticated user full access, including Wipe Database. That would
hand back most of what locking the database is meant to achieve.

With sign-ups off, accounts can only be created by you in the dashboard.

Verify:

```sql
-- Should only ever list accounts you created yourself.
select email, created_at from auth.users order by created_at;
```

---

## Step 2 — Sign in on every device, before locking anything

On each device that will be used (kiosk iPad, your phone, laptop):

- [ ] Open the app → the login screen appears
- [ ] Sign in → the dashboard loads normally
- [ ] Confirm Settings shows **Signed in as `your@email`**

Do this *now*, while the database is still open. If a device can't sign in, you find
out while everything still works rather than after locking the door.

Devices stay signed in indefinitely — the session is stored on the device and
refreshed in the background. You should not have to repeat this.

---

## Step 3 — Enable RLS

**Supabase → SQL Editor** → paste and run **`db/001_enable_rls.sql`**.

Expected result: `rls_enabled = true`, `policies = 2`.

---

## Step 4 — Verify immediately (2 minutes)

Do all four. The third is the one people forget.

- [ ] **Read** — reload the app. Roster and history still load.
- [ ] **Write** — log a test weigh-in. It saves and appears in the history.
- [ ] **Realtime** — open the app on a second device. Log a weigh-in on the first
      and confirm it appears on the second within a few seconds. *(Realtime respects
      RLS. The client passes the session token automatically, so this should work —
      but verify it rather than assume, because a silent failure here means devices
      quietly stop seeing each other's entries.)*
- [ ] **Anon is actually blocked** — run this in the SQL Editor:

      ```sql
      set local role anon;
      select count(*) from public.athletes;
      reset role;
      ```

      Expect **0**. If it returns 53, RLS is not doing anything — stop and check
      that step 3 actually committed.

If any check fails → run **`db/002_rollback_rls.sql`**, and everything returns to
working immediately. No weigh-ins are lost: failed writes stay in each device's
offline queue and upload once access is restored.

---

## Step 5 — Clean up

- [ ] Delete the test weigh-in from step 4
- [ ] Review **Authentication → Users** and remove any account you don't intend to
      keep. Every account listed has full access — there are no lesser accounts.
- [ ] Update `docs/HANDOFF.md` — item 2 is now done

---

## After this is done

**The anon key in this repo is no longer a data-exposure risk.** It becomes what it
is supposed to be: a public identifier that grants nothing on its own. It can stay in
the repo.

### What this does and does not protect

| | |
|---|---|
| ✅ Stops | Anyone with the anon key reading, modifying, or wiping athlete data |
| ❌ Does not stop | Someone who has a valid coach login — treat those credentials like keys to the building |

Every signed-in user has full access, including **Wipe Database**. If you later want
to restrict that (say, assistants who can log but not delete), the policy can be split
per operation — `for select` / `for insert` / `for delete` with different roles — with
no app changes.

### Adding another coach
Give them the shared credentials — nothing to configure. If you'd rather they had
their own account, Authentication → Users → Add user; the policies already cover any
authenticated user, so no app or SQL changes are needed.

### If someone leaves
With a shared login, there is no individual account to delete. Change the shared
password in Supabase, then sign in again on each device. Existing sessions on devices
you control keep working until their token refresh fails, so do the devices you're
keeping first.

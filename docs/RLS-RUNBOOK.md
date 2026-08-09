# RLS Rollout Runbook

Locks the database down so the public anon key can no longer read or modify athlete
data. Do this in a window when nobody is using the app.

**The order matters.** The app is deployed with a login screen *first*, while the
database is still open. Nothing breaks at that stage — you sign in, everything keeps
working. Only the last step actually enforces anything, and it is one line to undo.

---

## Before you start

- [ ] v4.8.0 (or later) is deployed and the version badge confirms it
- [ ] Nobody is mid-session — no weigh-ins happening
- [ ] You can reach Supabase → SQL Editor
- [ ] `db/002_rollback_rls.sql` is open in a tab, ready to paste

---

## Step 1 — Create your login

**Supabase → Authentication → Users → Add user → Create new user**

- Enter an email and a strong password
- ✅ Tick **Auto Confirm User** (otherwise the account can't sign in until the email
  is confirmed, and the app will just say the credentials are wrong)

**One account or several?** Either works — the policies are identical. One shared
coach login is simpler and fine for a single-coach program. Separate accounts per
coach cost nothing extra to support and are better practice if more than one person
administers the roster. Nothing in the app cares which you choose.

The kiosk iPad signs in with the same credentials as everything else. That's expected:
the *device* is trusted, athletes still just tap their own card.

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

### If you ever need to add a coach
Authentication → Users → Add user. Nothing else to do; the policies already cover
any authenticated user.

### If someone leaves
Delete their user in Supabase. Their device is signed out at the next token refresh.
If it's urgent, delete the user *and* run the rollback + re-enable to force all
sessions to re-validate.

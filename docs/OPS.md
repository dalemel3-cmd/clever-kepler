# HPD App: operations playbook

How the app is kept healthy between feature work: who checks what, how often, and what
they are allowed to do. The agents are defined in `.claude/agents/` (Claude Code loads them
for any session in this repo; another tool can read them as role briefs). `AGENTS.md` §0 is
binding on all of them.

## The team

| Agent | Role | Writes code? |
|---|---|---|
| `hpd-reliability` | Production health: `app_errors`, Supabase advisors, logs, table growth, egress risk, latest deploy | Report-only. A clear bug fix goes on an `ops/<topic>` branch |
| `hpd-qa` | Builds the app and runs the whole test suite; triages every failure (regression, stale test, known, flaky) | Report-only. A test-only or one-line fix goes on a `qa/<topic>` branch |
| `hpd-performance` | Bundle size, load time on a throttled iPad, rendering with a full roster, request volume, all against budgets | Report-only. Measured fixes go on a `perf/<topic>` branch |
| `hpd-reviewer` | Reviews diffs for correctness, regressions against AGENTS.md §8, egress/RLS risk, tablet/offline and print edge cases | Never |

## Cadence

| When | What | Who runs it |
|---|---|---|
| Daily, ~14:10 UTC | **Error check**: new `app_errors` rows only. Messages the owner only when there is something new | Scheduled task (Claude Code) |
| Weekly, Sunday evening (Central) | **Health review**: `hpd-reliability` + `hpd-performance` + `hpd-qa` on `main`, `hpd-reviewer` on the week's commits. One combined report to the owner | Scheduled task (Claude Code) |
| Every release | **Pre-release review**: `hpd-reviewer` on the diff before the preview link goes to the owner; the area's tests (AGENTS.md §4) | Whoever made the change |

## Rules for every agent run

1. **Production is read-only.** `select` queries and read-only tools only. No migrations,
   data edits, redeploys, rollbacks or settings changes; write them up for the owner.
2. **Never push to `main`.** Fixes go on a topic branch and come to the owner as a preview
   link. `main` only moves when the owner says "push it" (fast-forward only).
3. **Evidence or it didn't happen.** Every finding quotes the query result, test output or
   `file:line`, and says how to reproduce it. Severity: **P0** broken for users now, **P1**
   will break or hurts users, **P2** improvement.
4. **Quiet when green.** The owner hears about P0/P1 findings and a short weekly summary,
   not every check.
5. **No secrets, no model names** in code, docs, commits or reports.

## Weekly report format (what the owner receives)

```
HPD weekly health: <date>, <version on main>
Overall: GREEN | YELLOW | RED
Production: <n> new errors (one line each), advisors, growth
Tests: <passed>/<total> (new failures listed)
Speed: entry bundle <n> KB gz, iPad load <n> s
Code review (this week's commits): verdict + findings
Recommended next (owner decision needed marked ⚑)
```

## Budgets

- Main entry bundle ≤ 250 KB gzip; any lazy chunk ≤ 150 KB gzip; precache ≤ 2.5 MB.
- App mounted ≤ 3 s on an iPad viewport, ~10 Mbps / 40 ms, 4× CPU slowdown.
- Supabase egress ≤ 0.5 GB / month (Free plan cap 5 GB). Any whole-table download goes
  through `allowFetch()` / `loadHistoryTable()`.
- Test suite: no new failures on `main`; the known pre-existing ones are listed in
  AGENTS.md §4 and the HANDOFF "Next up".

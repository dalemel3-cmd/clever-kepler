# Contributing to Clever Kepler (HPD App)

This project may be worked on from multiple tools — Google Antigravity, Claude Code,
and Claude via chat. This doc exists so switching between them never causes lost
work or conflicting changes.

## Setup

1. Clone the repo and `cd` into it.
2. Copy `.env.example` to `.env` and fill in real values from Supabase
   (Settings -> API in your Supabase project dashboard).
3. `npm install`
4. `npm run dev`

## The one rule: commit and push before switching tools

Whichever tool you were just using (Antigravity, Claude Code, editing directly),
before you open a *different* tool against this repo:

```bash
git status              # confirm nothing uncommitted
git add -A && git commit -m "..."
git push
```

Then, in the new tool, before making any changes:

```bash
git pull
```

Never leave uncommitted changes sitting in the working directory when switching
tools. Never run two tools against the same repo at the same time. Treat it like
pair programming — one tool "has the keyboard" at a time.

## Before pushing anything, regardless of tool

```bash
npm run lint
npm run build
```

Both should pass clean. This catches breakage before it lands on `main` and
before it deploys (Vercel auto-deploys from `main`).

## Rough division of labor

Not a hard rule, just a helpful default:

- **Antigravity** — fast iteration on UI/features being actively built live
  (new screens, new metrics being added to the monitoring system).
- **Claude Code / Claude chat** — refactors, bug fixes, security/auth work,
  and anything that benefits from reasoning across a large chunk of the
  codebase at once (e.g. splitting up `App.jsx`).

## Known issues / active work

- `src/App.jsx` is a single ~6,600 line file/component. This is the biggest
  source of tool-switching risk (large surface area = more chance both tools
  touch the same region) and the biggest blocker to testing individual
  pieces. Splitting it into `features/` and `components/` is a priority.
- Row Level Security (RLS) is currently **disabled** on `athletes` and
  `weigh_ins` in Supabase. There is no login yet, so the anon key exposes
  full read/write on both tables. Auth + RLS policies are planned but not
  yet implemented — be aware of this if adding features that touch
  sensitive data.
- Never commit `.env`. Use `.env.example` as the template for required vars.

## Secrets / access

- Never commit real Supabase keys, service role keys, or any credentials.
- If a GitHub Personal Access Token is used to push from a chat-based tool
  (rather than a git-native tool), it should be fine-grained, scoped to this
  repo only, `Contents: Read and write` only, with a short expiration —
  and revoked immediately after use.

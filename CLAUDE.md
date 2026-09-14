# Spotter — notes for Claude Code

Spotter is Drew's coaching app: client profiles, session logs with skill ratings, voice memos, auto-built
weekly programs, progress trends, and recap emails. Drew is an MMA fighter and personal trainer, not a
developer. Explain changes in plain language, and keep the code simple enough for him to follow.

`README.md` covers architecture and how the planner works. `HANDOFF.md` covers setup and the day-to-day workflow.

## Hard rules

- **Live site = `main` branch.** GitHub Pages serves https://drewdavistraining-coach.github.io/spotter/ from
  `main`, so every push to `main` ships to Drew's phone. Test locally before pushing.
- **Bump `VERSION` in `sw.js` on every change to a cached file** (anything in its `SHELL` list). The service
  worker is network-first, so an online phone loads new files anyway. But the version bump is what refreshes
  the offline copy and triggers the in-app "updated" reload. If you add a new JS/CSS file, add it to `SHELL` too.
- The service worker is skipped on localhost, so update behaviour can only be tested on the live site.
- **Never break existing data.** Client data lives only in IndexedDB on Drew's devices, and there's no server
  copy. If you change the shape of a stored record, read old records defensively (see `programFor()` in
  `js/planner.js` for the pattern), or bump `DB_VERSION` in `js/db.js` with a migration in `onupgradeneeded`.
  Remind Drew to tap Settings → Back up now before shipping anything that touches storage.
- **No build step, no frameworks, no npm dependencies.** Plain ES modules loaded straight by the browser.
  All paths are relative (`./`, not `/`), because the site lives under `/spotter/`.
- **Nothing leaves the device** except a backup file he exports himself or a recap he chooses to send.
  Private coach notes and voice memos never go into recaps.
- **No secrets in this repo.** The repo is public. When AI recaps get added, the Claude API key must live
  on a server, never in these files.

## Run locally

```bash
python -m http.server 5174
```

Then open http://localhost:5174. The service worker is skipped on localhost, so a refresh always shows
the latest code. `localhost` counts as a secure site, so the mic works there too.

## Conventions

- One screen per file in `js/views/`. Each exports an async view function; `js/app.js` maps URL hashes to them.
- Views render HTML strings. **Always pass user text through `esc()`.**
- Colours and spacing are CSS variables at the top of `styles.css`.
- Planner behaviour lives in `js/planner.js`:
  - `slotsFor()` shapes each training day.
  - `PHASES` defines the 4-week cycle.
  - The scoring inside `autoBuildWeek()` decides which drill wins.
- Editable name lists use `listEditor()` in `js/ui.js`:
  - a client's rating categories are stored as `client.skills`;
  - session types are stored as meta `sessionTypes`, read through `sessionTypes()` in `db.js`.
- Renaming a drill (`renameDrill()` in `js/views/drills.js`) also renames it in this week's and future plans.
  Past plans and logged sessions keep the old name as history.
- Starter drills are in `js/seed.js`, but they only seed a fresh install. Drew's real library lives in his
  device's database, so changing `seed.js` doesn't change his existing drills.

## Decisions already made (v1, Sep 2026)

- iPhone first, laptop second. On-device storage plus a manual backup file. No sync yet.
- Recaps are template-written (`js/recap.js`) and sent through his own mail app via `mailto:`.
- The program engine uses a level per discipline, a Learn → Build → Apply → Test & recover block, a
  rotating discipline focus, and novelty scoring. The goal is structure and longevity for long-term clients,
  so they don't drift into Drew's personal fight-camp routine.

## Roadmap (not built)

1. AI-written recaps and memo transcription (Claude API behind a small server)
2. Sync between devices (e.g. Supabase)
3. Client portal: clients log in to see their plan, progress and schedule

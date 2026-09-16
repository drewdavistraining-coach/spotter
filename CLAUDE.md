# Spotter — notes for Claude Code

Spotter is Drew's coaching app: client profiles, session logs with skill ratings, voice memos, auto-built
weekly programs, weights, cancellations, progress trends, and recap emails. Drew is an MMA fighter and personal trainer, not a
developer. Explain changes in plain language, and keep the code simple enough for him to follow.

`README.md` covers architecture and how the planner works. `HANDOFF.md` covers setup and the day-to-day workflow.

## Hard rules

- **Live site = `main` branch.** GitHub Pages serves https://drewdavistraining-coach.github.io/spotter/ from
  `main`, so every push to `main` ships to Drew's phone. Test locally before pushing.
- **Bump `VERSION` in `sw.js` on every change to a cached file** (anything in its `SHELL` list). The service
  worker is network-first, so an online phone loads new files anyway. But the version bump is what refreshes
  the offline copy and triggers the in-app "updated" reload. If you add a new JS/CSS file, add it to `SHELL` too.
- The service worker is skipped on localhost, so update behaviour can only be tested on the live site.
- **Never break existing data.** Records live in IndexedDB on each device and sync to Supabase. Old records
  from other devices can arrive at any time, so if you change a record's shape, read old records defensively
  (see `programFor()` in `js/planner.js` for the pattern). Never rename a store or a record id.
  Remind Drew to tap Settings → Back up now before shipping anything that touches storage or sync.
- **All writes go through `db.put` / `db.del`.** That's what stamps `_modified` and queues the change for
  upload. Writing to IndexedDB any other way means the change never syncs. Use `{ fromSync: true }` only
  inside `js/sync.js`.
- **No build step, no frameworks, no npm dependencies.** Plain ES modules loaded straight by the browser.
  All paths are relative (`./`, not `/`), because the site lives under `/spotter/`.
- **Data goes only to Drew's own Supabase account** (when he's signed in), to a backup file he exports, or
  in a recap he chooses to send. Private coach notes and voice memos never go into recaps.
- **No secrets in this repo.** The repo is public. The Supabase URL and publishable key in `js/sync.js` are
  meant to be public, because row-level security in `supabase/schema.sql` is what protects the data.
  Never add the `service_role` / secret key. When AI recaps get added, the Claude API key must live on a
  server, never in these files.

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
- **Cancellations** are session records with `cancelled: true` (plus `cancelReason`), so they appear in the
  timeline, week view, progress tab and recaps. Anything counting training must filter them out: use
  `attended()` / `cancelled()` from `js/progress.js`, never a raw session list.
- **Weights** live on each logged drill as `sets: [{ weight, reps }]`, in the unit from meta `weightUnit`
  ('lb' or 'kg' — numbers are never converted). `weightHistory()` and `lastSetsFor()` in `js/progress.js`
  turn them into per-drill history; blank sets are stripped when a session is saved.
- **Plan drag & drop** (`enableDrag()` in `js/views/plan.js`) uses pointer events and rebuilds the week from
  the DOM on drop. Destructive taps in the plan offer `toastAction(…, 'Undo', …)` instead of a confirm dialog.
- Starter drills are in `js/seed.js`, but they only seed a fresh install. Drew's real library lives in his
  device's database, so changing `seed.js` doesn't change his existing drills.

## Sync (`js/sync.js`, `supabase/schema.sql`)

- Supabase project `bzrsalvbtbpyvdvsmckh`, all tied to Drew's account. Every record is one row in
  `public.records` (`store`, `id`, `data` jsonb, `deleted`, `modified`, `updated_at`).
- **Local-first:** screens only ever read IndexedDB. The sync loop pushes the `outbox` store, then pulls rows
  whose `updated_at` is newer than the last pull.
- **When it runs:** when the app opens, 1.5s after a local edit, when the app returns to the foreground or
  reconnects, and every 10s while it's on screen.
- **Conflicts:** the newest edit wins, per record, enforced by a database trigger and checked again on pull.
  Deletes are kept as rows with `deleted = true`, so they sync too.
- **A device's first sync merges.** It pulls everything, swaps its own seeded drill copies for the server's
  (matched by name), then uploads whatever the server doesn't have.
- **Voice memo audio** lives in the private `memos` storage bucket at `<user id>/<memo id>.m4a`. The memo
  record stores `audioPath`, never the audio itself.
- **Meta:** only `SYNCED_META` keys sync (`sessionTypes`, `trainerName`, `recapClosing`, `weightUnit`). Sign-in, the sync
  cursor and the backup date stay on each device and never go into backup files.
- **Database changes are run by hand** in the Supabase SQL Editor. Add a new `.sql` file under `supabase/`
  and keep every script safe to re-run. The Supabase GitHub integration is deliberately off.
- **Testing against the live project** writes to Drew's real account. Name test records clearly and delete
  them afterwards.

## Decisions already made (Sep 2026)

- iPhone first, laptop second. On-device storage that syncs through Supabase, plus an optional backup file.
- Recaps are template-written (`js/recap.js`) and sent through his own mail app via `mailto:`.
- The program engine uses a level per discipline, a Learn → Build → Apply → Test & recover block, a
  rotating discipline focus, and novelty scoring. The goal is structure and longevity for long-term clients,
  so they don't drift into Drew's personal fight-camp routine.

## Roadmap (not built)

1. AI-written recaps and memo transcription (Claude API behind a small server, e.g. a Supabase Edge Function)
2. Client portal: clients log in to see their plan, progress and schedule. This needs a table and policies
   separate from Drew's `records`.

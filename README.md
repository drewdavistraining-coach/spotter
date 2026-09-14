# Spotter

A coaching app for Drew: client profiles, session logs with skill ratings, voice memos,
auto-built weekly programs, progress trends, and recap emails. v1 is just for Drew. There's no server
and no accounts, and all data stays on his device.

## Run it locally

```bash
python -m http.server 5174 --directory C:/Users/Camer/spotter
```

Then open http://localhost:5174. There's no build step: edit a file, refresh.

## Put it on his iPhone

The iPhone needs the app served over **HTTPS** (for the mic and for installing), so it has to be hosted.
The app is just static files, so GitHub Pages, Netlify or Cloudflare Pages all work for free. The hosted
copy contains only code. Client data never leaves the phone.

1. Open the URL in **Safari**, then tap Share → **Add to Home Screen**.
2. Always open it from the home-screen icon. The installed app keeps its own storage, and iOS doesn't
   clear an installed app's data the way it can clear a website's.
3. Settings → **Back up now** every week or so (Save to Files / iCloud Drive).

**Laptop:** open the same URL in a browser, then use Settings → Restore from backup to load the phone's data.
There's no live sync in v1: whichever device he restores onto gets a copy, and it doesn't sync back.

**Shipping an update:** change the files, bump `VERSION` in `sw.js`, redeploy. The phone picks it up
the next time the app is opened (sometimes it takes a second open).

## How the weekly program engine works (`js/planner.js`)

The problem it solves: long-term clients drift into whatever Drew is training himself, and deciding
each week's plan is guesswork. The engine does three things:

1. **Levels per discipline.** Each client gets Off / Foundations / Intermediate / Advanced in Boxing,
   Muay Thai, Jiu Jitsu, Wrestling, MMA, Strength and Conditioning. Every drill has a level, and the
   planner never picks a drill above the client's level in that discipline.
2. **A repeating 4-week block:** **Learn → Build → Apply → Test & recover.**
   - Each phase aims for a different intensity: technical, then drilling, then live, then light.
   - Each block puts one of the client's disciplines up front, and the focus rotates block to block
     (Boxing block, then Muay Thai block, …).
   - Where a client is in the cycle is worked out from the "4-week cycle started" date, so next week's
     plan is always predictable.
3. **Scoring each candidate drill.** The planner favours drills that:
   - the client hasn't done in the last few weeks,
   - train skills that are rating low,
   - match the client's level,
   - match the phase's intensity.

   A drill harder than the phase calls for costs extra.

A training day is built from slots. For example, a Learn day is:
warm-up → focus → focus → second discipline → strength/conditioning → mobility.
The "second discipline" slot rotates through the client's other disciplines.
Test & recover days are shorter. Change `slotsFor()` to reshape his sessions.

**Level-up prompts:** when a discipline's main skill has at least 3 ratings in the last 4 weeks and its
related skills average 4+, the client page suggests moving them up a level.

The drill library (`js/seed.js`) is only a starting point. Drew should edit it in the Drills tab to
match how he actually coaches: his names for things, his doses, his cues.

## Recaps (`js/recap.js`)

`buildRecap()` turns sessions, ratings, "what went well / work on next" notes, and next week's plan
into a plain-text email. Private coach notes and voice memos are **never** included; the recap screen
shows them to Drew separately for reference. "Open in Mail" hands the email to his mail app to send.

To add AI later: write a function with the same inputs that calls the Claude API and returns
`{ subject, body }`. It needs a small server to hold the API key; never put the key in these files.

## File map

| File | What it does |
|---|---|
| `index.html`, `styles.css` | Shell and all styling (colour tokens at the top of the CSS) |
| `js/app.js` | Router: URL hash → screen |
| `js/db.js` | IndexedDB wrapper (stores: clients, sessions, memos, plans, recaps, drills, meta) |
| `js/seed.js` | Disciplines, levels, skills, starter drill library |
| `js/planner.js` | Program cycle + auto-builder + level-up suggestions |
| `js/progress.js` | Skill trends, "areas to sharpen", weekly counts |
| `js/recap.js` | Recap email template |
| `js/recorder.js` | Voice memo recorder |
| `js/backup.js` | Backup export / restore |
| `js/views/*.js` | One file per screen |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline caching + installable app |

## Later (not built)

- AI-written recaps and memo transcription (Claude API behind a small server)
- Sync between devices (e.g. Supabase), which is also the base for client logins
- Client portal: clients log in to see their plan, progress and schedule

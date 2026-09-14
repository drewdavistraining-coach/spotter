# Spotter handoff: Drew's own machine

Spotter already belongs to you: the code lives in your GitHub account
([drewdavistraining-coach/spotter](https://github.com/drewdavistraining-coach/spotter)), and the app runs from
https://drewdavistraining-coach.github.io/spotter/. Nothing has to be transferred. This guide gets your own
computer set up so you can change the app and publish updates yourself.

**Your client data is not in the code.** It lives on your phone (and on any laptop where you restored a
backup). Setting up a computer, cloning the code or changing it never touches that data. Only a code change
that breaks how data is read can hurt it, which is why rule 3 below exists.

---

## Part 1: one-time setup (about 20 minutes)

### 1. Install the tools

| Tool | What it's for | Get it |
|---|---|---|
| **Git** | Tracks every change and uploads them to GitHub | Mac: run `xcode-select --install` in Terminal · Windows: https://git-scm.com |
| **GitHub CLI** | Signs your computer into your GitHub account | https://cli.github.com |
| **Python 3** | Runs the app locally for testing | https://www.python.org/downloads (Windows: tick "Add to PATH") |
| **VS Code** *(optional)* | For reading and editing the files | https://code.visualstudio.com |
| **Claude Code** *(recommended)* | Describe a change in plain English and it makes the edit | https://claude.com/claude-code |

### 2. Sign in to GitHub

Open Terminal (Mac) or PowerShell (Windows):

```bash
gh auth login --web --git-protocol https
```

Sign in as **drewdavistraining-coach**. Then let Git use that login:

```bash
gh auth setup-git
```

### 3. Download the code

```bash
gh repo clone drewdavistraining-coach/spotter
```

This makes a `spotter` folder in whatever folder your terminal is in. Put it somewhere you'll find again,
like Documents.

### 4. Run it locally

```bash
cd spotter
python -m http.server 5174
```

(On a Mac, use `python3` instead of `python`.) Open http://localhost:5174 in your browser. That's
your test copy. It has its own empty data, separate from your phone, so experiment freely. Press `Ctrl+C`
in the terminal to stop it.

---

## Part 2: making a change

### The loop

1. **Get the latest code:** `git pull`
2. **Run it:** `python -m http.server 5174` and open http://localhost:5174
3. **Make the change.** Either edit the files yourself, or open a second terminal in the `spotter` folder,
   run `claude`, and describe what you want. For example: *"Add a 'Clinch work' category to the drill library"*
   or *"Make the recap email mention how many rounds of sparring they did."* The `CLAUDE.md` file in this
   folder gives Claude the rules for this app.
4. **Test it** in the browser. Click through the screen you changed, then refresh.
5. **Bump the version:** in `sw.js`, change `const VERSION = 'spotter-v1'` to the next number (`spotter-v2`, …).
   Skip this and your phone keeps showing the old version.
6. **Publish:**
   ```bash
   git add -A
   git commit -m "Short description of what changed"
   git push
   ```
7. About a minute later the live site updates. On your phone, **close Spotter fully and reopen it**. Sometimes
   it takes two reopens to switch to the new version.

### The three rules

1. **Test locally before you push.** Whatever is on GitHub `main` is what your phone runs.
2. **Always bump `VERSION` in `sw.js`** when you change the app.
3. **Back up before risky changes.** Before publishing anything that changes how clients, sessions or plans
   are *saved*, tap Settings → **Back up now** on your phone first.

### If an update breaks something

Every change is saved in history, so you can always go back:

```bash
git log --oneline          # list recent changes; the first column is each change's id
git revert <id>            # undo that one change
```

Then bump `VERSION` in `sw.js` and push again. The live site returns to how it was, and your data on the phone
is untouched (unless a change deleted it, which is why rule 3 exists).

---

## Part 3: looking after your data

- **Back up weekly:** Settings → Back up now → Save to Files (iCloud Drive). The app nags you after 7 days.
- **New phone, or using a laptop too:** install Spotter on the new device, then Settings → Restore from
  backup. Restoring *replaces* whatever is on that device.
- **Don't delete the home-screen icon** without backing up first. Removing it can wipe that copy's data.
- **If the web address ever changes** (a custom domain, a renamed account or repo), the app at the new address
  starts empty. Back up on the old one and restore on the new one.

---

## Part 4: what's where

See `README.md` for the full file map and how the weekly program engine works. The places you'll
most likely want to change:

| To change… | Look in |
|---|---|
| Which skills get rated, the disciplines, the starter drills | `js/seed.js` (existing drills: edit in the app's Drills tab) |
| What a training day looks like (warm-up → focus → …) | `slotsFor()` in `js/planner.js` |
| The 4-week phases | `PHASES` in `js/planner.js` |
| The wording of recap emails | `js/recap.js` |
| Colours and look | the variables at the top of `styles.css` |

---

## Checklist for the build machine (where v1 was made)

- [ ] Drew has done Part 1 and pushed a test change successfully.
- [ ] Sign Drew's account out of that PC: `gh auth logout --user drewdavistraining-coach`
- [ ] Switch back: `gh auth switch --user HermitTheCrog`, then check with `gh auth status`.
- [ ] *(Optional)* Keep access as a collaborator: Drew adds HermitTheCrog under
      repo Settings → Collaborators.
- [ ] *(Optional)* Delete the local copy at `C:\Users\Camer\spotter` once Drew's clone is confirmed working.

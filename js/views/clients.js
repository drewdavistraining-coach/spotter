// Client list, client profile form, and the client page (timeline + progress).
import { db, uid } from '../db.js';
import { esc, $, $$, isoDate, weekStart, addDays, daysAgo, fmtDate, fmtDuration, initials, toast, toastAction, DAY_NAMES, fmtSets } from '../util.js';
import { DISCIPLINES, DEFAULT_SKILLS, LEVELS, LEVEL_SHORT } from '../seed.js';
import { programFor, cycleInfo, levelUpSuggestions } from '../planner.js';
import { byDate, inRange, focusAreas, skillSummary, weeklyCounts, attended, cancelled, weightHistory } from '../progress.js';
import { page, sparkline, trendArrow, emptyState, listEditor, openSheet } from '../ui.js';
import { openRecorder } from '../recorder.js';
import { deleteAudio } from '../sync.js';
import { milestonesFor, AWARD_ICONS } from '../milestones.js';

export async function clientsView() {
  const [clients, sessions, lastBackup, auth] = await Promise.all([db.all('clients'), db.all('sessions'), db.getMeta('lastBackup'), db.getMeta('auth')]);
  const ws = weekStart();
  const rows = clients
    .map(c => {
      const mine = sessions.filter(s => s.clientId === c.id);
      const trained = attended(mine);
      const last = byDate(trained).at(-1);
      const offThisWeek = cancelled(inRange(mine, ws, addDays(ws, 6))).length;
      return { c, last, offThisWeek, thisWeek: inRange(trained, ws, addDays(ws, 6)).length, focus: focusAreas(c, trained, 1)[0] };
    })
    .sort((a, b) => a.c.name.localeCompare(b.c.name));

  const staleBackup = clients.length && !auth && (!lastBackup || Date.now() - new Date(lastBackup) > 7 * 86400000);

  const view = page({
    title: 'Clients',
    action: '<a class="btn primary small" href="#/clients/new">+ Client</a>',
    body: `
      ${staleBackup ? `<a class="banner" href="#/settings">💾 ${lastBackup ? `Last backup ${daysAgo(isoDate(new Date(lastBackup)))}` : 'No backup yet'} — tap to turn on sync or back up</a>` : ''}
      ${clients.length ? `<input class="search" type="search" placeholder="Search clients" data-search>` : ''}
      <div class="list" data-list>
        ${rows.length ? rows.map(({ c, last, thisWeek, offThisWeek, focus }) => `
          <a class="card client-row" href="#/clients/${c.id}" data-name="${esc(c.name.toLowerCase())}">
            <div class="avatar">${esc(initials(c.name))}</div>
            <div class="grow">
              <div class="title">${esc(c.name)}</div>
              <div class="muted small">${last ? `Last session ${daysAgo(last.date)}` : 'No sessions yet'} · ${thisWeek} this week${offThisWeek ? ` · <span class="warn-text">${offThisWeek} cancelled</span>` : ''}</div>
            </div>
            ${focus ? `<span class="tag warn" title="Needs work">${esc(focus.skill)}</span>` : ''}
          </a>`).join('')
        : emptyState('🥊', 'No clients yet', 'Add your first client to start logging sessions, memos and recaps.', '<a class="btn primary" href="#/clients/new">Add a client</a>')}
      </div>`,
  });

  $('[data-search]', view)?.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    $$('.client-row', view).forEach(el => { el.hidden = !el.dataset.name.includes(q); });
  });
}

// Accolades Drew adds himself: the things Spotter can't work out on its own.
export function addAward(client, done) {
  openSheet({
    title: `Accolade for ${client.name}`,
    body: `
      <form class="stack" data-form>
        <label class="field"><span>What happened</span><input name="title" required placeholder="e.g. First amateur fight win" autocomplete="off"></label>
        <label class="field"><span>Date</span><input name="date" type="date" value="${isoDate()}" required></label>
        <fieldset class="field"><span>Badge</span>
          <div class="chips">${AWARD_ICONS.map((icon, i) => `<label class="chip"><input type="radio" name="icon" value="${icon}" ${i === 0 ? 'checked' : ''}><span>${icon}</span></label>`).join('')}</div>
        </fieldset>
        <label class="field"><span>Note <em class="muted">(optional)</em></span><textarea name="note" rows="2" placeholder="Anything worth remembering"></textarea></label>
        <button class="btn primary block">Save accolade</button>
      </form>`,
    onMount: (el, close) => {
      $('[data-form]', el).addEventListener('submit', async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        await db.put('awards', {
          id: uid(), clientId: client.id, date: f.get('date'), title: f.get('title').trim(),
          icon: f.get('icon'), note: f.get('note').trim(), createdAt: Date.now(),
        });
        close();
        toast('Accolade saved');
        done?.();
      });
    },
  });
}

// Categories worth suggesting: the defaults plus anything used for any client.
export async function skillSuggestions() {
  const clients = await db.all('clients');
  return [...new Set([...DEFAULT_SKILLS, ...clients.flatMap(c => c.skills || [])])];
}

export async function clientFormView(id) {
  const existing = id ? await db.get('clients', id) : null;
  if (id && !existing) return (location.hash = '#/');
  const c = existing || { name: '', email: '', phone: '', goal: '', disciplines: [], skills: [...DEFAULT_SKILLS], notes: '', startDate: isoDate() };
  const program = programFor(c);
  const levels = { ...program.levels };

  const view = page({
    title: existing ? 'Edit client' : 'New client',
    back: existing ? `#/clients/${id}` : '#/',
    body: `
      <form class="stack" data-form>
        <label class="field"><span>Name *</span><input name="name" required value="${esc(c.name)}" autocomplete="off"></label>
        <div class="grid-2">
          <label class="field"><span>Email</span><input name="email" type="email" value="${esc(c.email)}" autocomplete="off"></label>
          <label class="field"><span>Phone</span><input name="phone" type="tel" value="${esc(c.phone)}" autocomplete="off"></label>
        </div>
        <label class="field"><span>Goal</span><textarea name="goal" rows="2" placeholder="e.g. First amateur fight in March, cut to 155">${esc(c.goal)}</textarea></label>
        <label class="field"><span>Started training</span><input name="startDate" type="date" value="${esc(c.startDate)}"></label>
        <fieldset class="field"><span>Program — level in each discipline</span>
          <div class="level-grid" data-levels>${DISCIPLINES.map(d => `
            <div class="rating-row" data-discipline="${esc(d)}">
              <span class="grow">${esc(d)}</span>
              <div class="seg levels">${LEVEL_SHORT.map((label, n) => `<button type="button" data-level="${n}" title="${LEVELS[n]}" class="${(program.levels[d] || 0) === n ? 'on' : ''}">${label}</button>`).join('')}</div>
            </div>`).join('')}
          </div>
          <span class="muted small">Beginner = new to it · Intermediate = solid base · Advanced = years in. The planner only picks drills at or below these levels.</span>
        </fieldset>
        <fieldset class="field"><span>Usual training days</span>
          <div class="chips">${DAY_NAMES.map((d, i) => `<label class="chip"><input type="checkbox" name="days" value="${i}" ${program.days.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>
        </fieldset>
        <label class="field"><span>4-week cycle started</span><input name="programStart" type="date" value="${esc(program.start)}">
          <span class="muted small">Week 1 of each block is “Learn”. Change this to line the cycle up with where they really are.</span></label>
        <fieldset class="field"><span>Rating categories</span>
          <span class="muted small">What you rate 1–5 each session. Only keep what this client actually trains.</span>
          <div class="list-editor" data-skills></div>
        </fieldset>
        <label class="field"><span>Background notes</span><textarea name="notes" rows="3" placeholder="Injuries, experience, schedule…">${esc(c.notes)}</textarea></label>
        <button class="btn primary block" type="submit">${existing ? 'Save changes' : 'Create client'}</button>
        ${existing ? '<button class="btn danger block" type="button" data-delete>Delete client</button>' : ''}
      </form>`,
  });

  $('[data-levels]', view).addEventListener('click', e => {
    const btn = e.target.closest('[data-level]');
    if (!btn) return;
    const row = btn.closest('[data-discipline]');
    levels[row.dataset.discipline] = Number(btn.dataset.level);
    $$('[data-level]', row).forEach(b => b.classList.toggle('on', b === btn));
  });

  const skillsEditor = listEditor($('[data-skills]', view), {
    items: c.skills,
    suggestions: await skillSuggestions(),
    placeholder: 'New category (e.g. Footwork)',
    emptyText: 'No categories — sessions for this client won’t have ratings.',
  });

  $('[data-form]', view).addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const saved = {
      ...c,
      id: c.id || uid(),
      createdAt: c.createdAt || Date.now(),
      name: f.get('name').trim(),
      email: f.get('email').trim(),
      phone: f.get('phone').trim(),
      goal: f.get('goal').trim(),
      startDate: f.get('startDate'),
      disciplines: DISCIPLINES.filter(d => levels[d] > 0),
      program: {
        levels,
        days: f.getAll('days').map(Number),
        start: weekStart(f.get('programStart') || isoDate()),
      },
      skills: skillsEditor.get(),
      notes: f.get('notes').trim(),
    };
    await db.put('clients', saved);
    toast(existing ? 'Saved' : 'Client added');
    location.hash = `#/clients/${saved.id}`;
  });

  $('[data-delete]', view)?.addEventListener('click', async () => {
    if (!confirm(`Delete ${c.name} and all of their sessions, memos, plans and recaps? This can't be undone.`)) return;
    for (const store of ['sessions', 'memos', 'plans', 'recaps', 'awards']) {
      for (const row of await db.byClient(store, id)) await db.del(store, row.id);
    }
    await db.del('clients', id);
    toast('Client deleted');
    location.hash = '#/';
  });
}

export async function clientView(id, query) {
  const client = await db.get('clients', id);
  if (!client) return (location.hash = '#/');
  const tab = query.get('tab') || 'timeline';
  const [sessions, memos, recaps, awards] = await Promise.all([
    db.byClient('sessions', id), db.byClient('memos', id), db.byClient('recaps', id), db.byClient('awards', id),
  ]);
  const program = programFor(client);
  const cycle = cycleInfo(client, weekStart());
  const levelUps = levelUpSuggestions(client, attended(sessions));
  const unit = await db.getMeta('weightUnit', 'lb');
  const milestones = milestonesFor({ client, sessions, awards, unit });

  const view = page({
    title: client.name,
    back: '#/',
    action: `<a class="icon-btn" href="#/clients/${id}/edit" aria-label="Edit client">✎</a>`,
    body: `
      <section class="card profile">
        <div class="avatar lg">${esc(initials(client.name))}</div>
        <div class="grow">
          ${client.goal ? `<div class="goal">🎯 ${esc(client.goal)}</div>` : '<div class="muted small">No goal set</div>'}
          <div class="tags">${DISCIPLINES.filter(d => program.levels[d] > 0).map(d => `<span class="tag" data-level="${program.levels[d]}">${esc(d)} · ${LEVEL_SHORT[program.levels[d]]}</span>`).join('') || `<a class="tag warn" href="#/clients/${id}/edit">Set program levels</a>`}</div>
          <div class="muted small">${attended(sessions).length} sessions${client.startDate ? ` · since ${fmtDate(client.startDate, { month: 'short', year: 'numeric' })}` : ''}</div>
        </div>
      </section>
      ${cycle.theme ? `
      <a class="card cycle" href="#/clients/${id}/plan">
        <div class="phase-steps">${[0, 1, 2, 3].map(i => `<span class="${i === cycle.phaseIndex ? 'on' : i < cycle.phaseIndex ? 'done' : ''}"></span>`).join('')}</div>
        <div class="small"><b>Block ${cycle.block} · ${esc(cycle.phase.name)}</b> week — ${esc(cycle.theme)} focus</div>
      </a>` : ''}
      ${milestones[0] ? `<a class="banner trophy" href="#/clients/${id}?tab=progress">${milestones[0].icon} <b>${esc(milestones[0].title)}</b> · ${fmtDate(milestones[0].date, { month: 'short', day: 'numeric' })}</a>` : ''}
      ${levelUps.map(l => `<a class="banner" href="#/clients/${id}/edit">⬆ ${esc(l.discipline)} ratings are averaging ${l.avg.toFixed(1)} — ready to move up to ${LEVELS[l.level + 1]}?</a>`).join('')}
      <div class="actions">
        <a class="action" href="#/clients/${id}/sessions/new"><span>📝</span>Log session</a>
        <button class="action" data-memo><span>🎙</span>Voice memo</button>
        <a class="action" href="#/clients/${id}/plan"><span>🗓</span>Week plan</a>
        <a class="action" href="#/clients/${id}/recap"><span>✉️</span>Recap</a>
        <button class="action" data-award><span>🏆</span>Accolade</button>
      </div>
      <div class="tabs">
        <a href="#/clients/${id}?tab=timeline" class="${tab === 'timeline' ? 'on' : ''}">Timeline</a>
        <a href="#/clients/${id}?tab=progress" class="${tab === 'progress' ? 'on' : ''}">Progress</a>
      </div>
      <div data-tab>${tab === 'progress' ? progressTab(client, sessions, unit, milestones) : timelineTab(client, sessions, memos, recaps, unit, milestones)}</div>`,
  });

  view.addEventListener('click', e => {
    if (e.target.closest('[data-award]')) addAward(client, () => clientView(id, query));
  });

  $('[data-memo]', view).addEventListener('click', () =>
    openRecorder({ clientId: id, clientName: client.name, onSaved: () => clientView(id, query) }));

  bindMemoCards(view, memos, () => clientView(id, query));

  $('[data-tab]', view).addEventListener('click', async e => {
    const del = e.target.closest('[data-del-item]');
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      const [store, recordId] = del.dataset.delItem.split(':');
      const record = await db.get(store, recordId);
      if (!record) return;
      await db.del(store, recordId);
      clientView(id, query);
      const what = store === 'recaps' ? 'Recap' : record.cancelled ? 'Cancelled day' : 'Session';
      toastAction(`${what} deleted`, 'Undo', async () => {
        await db.put(store, record);
        clientView(id, query);
      }, 12000);
      return;
    }
    const card = e.target.closest('[data-open]');
    if (card && !e.target.closest('button, a, input, textarea, audio')) location.hash = card.dataset.open;
  });
}

function timelineTab(client, sessions, memos, recaps, unit, milestones) {
  const items = [
    ...sessions.map(s => ({ kind: 'session', date: s.date, at: s.createdAt, s })),
    ...memos.map(m => ({ kind: 'memo', date: m.date, at: m.createdAt, m })),
    ...recaps.map(r => ({ kind: 'recap', date: r.date, at: r.createdAt, r })),
    ...milestones.map(m => ({ kind: 'milestone', date: m.date, at: Number.MAX_SAFE_INTEGER, m })),
  ].sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));

  if (!items.length) return emptyState('🗒', 'Nothing logged yet', 'Log a session or record a voice memo — everything shows up here in order.');

  let lastDate = '';
  return `<div class="timeline">${items.map(item => {
    const header = item.date !== lastDate ? `<div class="tl-date">${fmtDate(item.date)} <span class="muted">· ${daysAgo(item.date)}</span></div>` : '';
    lastDate = item.date;
    if (item.kind === 'session') return header + (item.s.cancelled ? cancelledCard(client, item.s) : sessionCard(client, item.s, unit));
    if (item.kind === 'milestone') return header + milestoneCard(item.m);
    if (item.kind === 'memo') return header + memoCard(item.m);
    return header + recapCard(item.r);
  }).join('')}</div>`;
}

function sessionCard(client, s, unit) {
  const ratings = (client.skills || []).filter(k => typeof s.ratings?.[k] === 'number');
  return `
    <div class="card tl-item" data-open="#/clients/${client.id}/sessions/${s.id}">
      <div class="row"><div class="tl-kind grow">📝 ${esc(s.type || 'Session')}${s.duration ? ` · ${esc(s.duration)} min` : ''}</div>
        ${deleteButton('sessions', s.id, 'session')}</div>
      ${s.drills?.length ? `<div class="small">${s.drills.map(d => esc(d.name)).join(' · ')}</div>` : ''}
      ${(s.drills || []).filter(d => d.sets?.length).map(d => `<div class="small muted">🏋️ ${esc(d.name)}: ${esc(fmtSets(d.sets, unit))}</div>`).join('')}
      ${ratings.length ? `<div class="mini-ratings">${ratings.map(k => `<span>${esc(k)} <b>${s.ratings[k]}</b></span>`).join('')}</div>` : ''}
      ${s.wentWell ? `<div class="small good">✓ ${esc(s.wentWell)}</div>` : ''}
      ${s.workOn ? `<div class="small warn-text">↗ ${esc(s.workOn)}</div>` : ''}
    </div>`;
}

function milestoneCard(m) {
  return `
    <div class="card tl-item trophy-item">
      <div class="row gap"><span class="m-icon">${m.icon}</span>
        <div class="grow"><div class="m-title">${esc(m.title)}</div>${m.detail ? `<div class="muted small">${esc(m.detail)}</div>` : ''}</div>
        ${m.id ? deleteButton('awards', m.id, 'accolade') : ''}</div>
    </div>`;
}

// Timeline items delete with an Undo, rather than a confirm box.
function deleteButton(store, id, label) {
  return `<button class="icon-btn small" data-del-item="${store}:${id}" aria-label="Delete this ${label}" title="Delete">🗑</button>`;
}

function cancelledCard(client, s) {
  return `
    <div class="card tl-item cancelled-item" data-open="#/clients/${client.id}/sessions/${s.id}">
      <div class="row"><div class="tl-kind grow">🚫 Cancelled${s.cancelReason ? ` · ${esc(s.cancelReason)}` : ''}</div>
        ${deleteButton('sessions', s.id, 'cancelled day')}</div>
    </div>`;
}

export function memoCard(m) {
  return `
    <div class="card tl-item memo" data-memo-id="${m.id}">
      <div class="row"><div class="tl-kind grow">🎙 Voice memo${m.duration ? ` · ${fmtDuration(m.duration)}` : ''}</div>
        <button class="icon-btn small" data-del-memo aria-label="Delete memo">🗑</button></div>
      ${m.audio ? '<audio controls preload="metadata" data-audio></audio>' : ''}
      <textarea class="memo-note" rows="2" data-memo-note placeholder="Add a note or transcript">${esc(m.note)}</textarea>
    </div>`;
}

function recapCard(r) {
  return `
    <details class="card tl-item">
      <summary><div class="row"><span class="grow"><span class="tl-kind">✉️ Recap sent</span> <span class="muted small">${esc(r.subject)}</span></span>
        ${deleteButton('recaps', r.id, 'recap')}</div></summary>
      <pre class="recap-pre">${esc(r.body)}</pre>
    </details>`;
}

// Audio elements need object URLs; they'd leak memory if we never handed them back.
const audioUrls = [];
function releaseStaleAudio() {
  for (let i = audioUrls.length - 1; i >= 0; i--) {
    const { el, url } = audioUrls[i];
    if (el.isConnected) continue;
    URL.revokeObjectURL(url);
    audioUrls.splice(i, 1);
  }
}

// Audio elements need object URLs, and notes save as you type.
export function bindMemoCards(root, memos, refresh) {
  releaseStaleAudio();
  for (const card of $$('[data-memo-id]', root)) {
    const memo = memos.find(m => m.id === card.dataset.memoId);
    if (!memo) continue;
    const audio = $('[data-audio]', card);
    if (audio && memo.audio) {
      audio.src = URL.createObjectURL(memo.audio);
      audioUrls.push({ el: audio, url: audio.src });
    }
    let saveTimer;
    $('[data-memo-note]', card).addEventListener('input', e => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => db.put('memos', { ...memo, note: e.target.value }), 400);
    });
    $('[data-del-memo]', card).addEventListener('click', async () => {
      await db.del('memos', memo.id);
      refresh();
      toastAction('Voice memo deleted', 'Undo', async () => {
        await db.put('memos', { ...memo, audioPath: undefined }); // re-upload the audio under a fresh path
        refresh();
      }, 12000);
      // Only clear the cloud copy once the undo window has closed.
      setTimeout(async () => {
        if (!(await db.get('memos', memo.id))) deleteAudio(memo);
      }, 12500);
    });
  }
}

// Session counts, PRs, streaks and anniversaries work themselves out; the rest Drew adds.
function milestonesCard(milestones, limit = 6) {
  return `
    <section class="card">
      <div class="row"><h3 class="grow">Milestones</h3><button class="btn ghost small" data-award>+ Accolade</button></div>
      ${milestones.length ? milestones.slice(0, limit).map(m => `
        <div class="milestone">
          <span class="m-icon">${m.icon}</span>
          <div class="grow"><div class="m-title">${esc(m.title)}</div>
            <div class="muted small">${fmtDate(m.date)}${m.detail ? ` · ${esc(m.detail)}` : ''}</div></div>
        </div>`).join('')
      : '<p class="muted small">Session counts, weight PRs, streaks and anniversaries show up here on their own. Add your own for the things only you know about.</p>'}
      ${milestones.length > limit ? `<p class="muted small">${milestones.length - limit} more further down their timeline.</p>` : ''}
    </section>`;
}

function progressTab(client, allSessions, unit, milestones = []) {
  if (!allSessions.length) return milestonesCard(milestones) + emptyState('📈', 'No progress data yet', 'Rate skills when you log sessions and trends will build up here.');
  const sessions = attended(allSessions);
  const summary = skillSummary(client, sessions);
  const focus = focusAreas(client, sessions);
  const weeks = weeklyCounts(allSessions);
  const maxWeek = Math.max(1, ...weeks.map(w => w.count + w.cancelled));
  const offs = byDate(cancelled(allSessions));
  const recentOffs = offs.filter(s => s.date >= addDays(isoDate(), -56));
  const attendance = sessions.length + offs.length ? Math.round((sessions.length / (sessions.length + offs.length)) * 100) : null;
  const lifts = [...weightHistory(sessions).entries()].map(([, entries]) => entries).sort((a, b) => b.at(-1).date.localeCompare(a.at(-1).date));

  return `
    ${milestonesCard(milestones)}
    ${focus.length ? `
      <section class="card focus">
        <h3>Areas to sharpen</h3>
        ${focus.map(f => `<div class="row"><span class="grow">${esc(f.skill)}</span><b>${f.current.toFixed(1)}</b>${trendArrow(f.trend)}</div>`).join('')}
        <p class="muted small">Based on the last 3 ratings of each skill. The week planner leans into these.</p>
      </section>` : ''}
    <section class="card">
      <h3>Skills</h3>
      ${summary.map(s => `
        <div class="skill-row">
          <span class="skill-name">${esc(s.skill)}</span>
          ${sparkline(s.series)}
          <b class="skill-val">${s.current !== null ? s.current.toFixed(1) : '–'}</b>
          ${s.current !== null ? trendArrow(s.trend) : '<span class="trend"></span>'}
        </div>`).join('')}
    </section>
    <section class="card">
      <h3>Sessions per week</h3>
      <div class="bars">${weeks.map(w => `
        <div class="bar-col" title="Week of ${fmtDate(w.start)}: ${w.count} trained${w.cancelled ? `, ${w.cancelled} cancelled` : ''}">
          ${w.cancelled ? `<div class="bar off" style="height:${(w.cancelled / maxWeek) * 100}%"></div>` : ''}
          <div class="bar" style="height:${(w.count / maxWeek) * 100}%"><span class="bar-n">${w.count || ''}</span></div>
          <span class="bar-label">${fmtDate(w.start, { month: 'numeric', day: 'numeric' })}</span>
        </div>`).join('')}
      </div>
      ${offs.length ? `<p class="muted small">${attendance}% of booked sessions trained.
        <span class="warn-text">${recentOffs.length} cancelled in the last 8 weeks</span>${offs.length > recentOffs.length ? `, ${offs.length} all time` : ''}${offs.at(-1) ? ` · last ${fmtDate(offs.at(-1).date)}${offs.at(-1).cancelReason ? ` (${esc(offs.at(-1).cancelReason)})` : ''}` : ''}.</p>` : ''}
    </section>
    ${lifts.length ? `
    <section class="card">
      <h3>Weights</h3>
      ${lifts.map(entries => {
        const now = entries.at(-1);
        const first = entries[0];
        const change = entries.length > 1 && first.top && now.top ? Number(now.top.weight) - Number(first.top.weight) : 0;
        return `
        <div class="skill-row lift-row">
          <span class="skill-name">${esc(now.name)}<span class="muted small block-line">${esc(fmtSets(now.sets, unit))} · ${fmtDate(now.date, { month: 'short', day: 'numeric' })}</span></span>
          <b class="skill-val">${now.top ? `${now.top.weight} ${esc(unit)}` : '–'}</b>
          ${trendArrow(change / 10)}
        </div>`;
      }).join('')}
      <p class="muted small">Top set each time, and how it compares with the first time you logged it.</p>
    </section>` : ''}`;
}

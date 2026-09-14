// Log / edit a training session: drills done, skill ratings, notes, attached memos.
import { db, uid } from '../db.js';
import { esc, $, $$, isoDate, weekStart, parseDate, toast } from '../util.js';
import { SESSION_TYPES, CATEGORIES } from '../seed.js';
import { page, catDot } from '../ui.js';
import { openRecorder } from '../recorder.js';
import { memoCard, bindMemoCards } from './clients.js';

export async function sessionFormView(clientId, sessionId) {
  const client = await db.get('clients', clientId);
  if (!client) return (location.hash = '#/');
  const existing = sessionId ? await db.get('sessions', sessionId) : null;
  const s = existing || { id: uid(), clientId, date: isoDate(), type: SESSION_TYPES[0], duration: 60, drills: [], ratings: {}, wentWell: '', workOn: '', privateNotes: '' };
  const drills = (await db.all('drills')).sort((a, b) => a.name.localeCompare(b.name));
  const memos = existing ? (await db.byClient('memos', clientId)).filter(m => m.sessionId === s.id) : [];
  let saved = Boolean(existing);

  const view = page({
    title: existing ? 'Edit session' : 'Log session',
    back: `#/clients/${clientId}`,
    body: `
      <div class="muted small subhead">${esc(client.name)}</div>
      <form class="stack" data-form>
        <div class="grid-3">
          <label class="field"><span>Date</span><input type="date" name="date" value="${esc(s.date)}" required></label>
          <label class="field"><span>Type</span><select name="type">${[...new Set([...SESSION_TYPES, s.type])].map(t => `<option ${t === s.type ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
          <label class="field"><span>Minutes</span><input type="number" name="duration" min="0" step="5" value="${esc(s.duration)}"></label>
        </div>

        <fieldset class="field"><span>Drills</span>
          <div class="drill-list" data-drills></div>
          <div class="muted small" data-from-plan-wrap hidden>From this week's plan:</div>
          <div class="chips" data-from-plan></div>
          <div class="row gap">
            <select data-library class="grow">
              <option value="">+ Add from library…</option>
              ${CATEGORIES.map(cat => `<optgroup label="${esc(cat)}">${drills.filter(d => d.category === cat).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</optgroup>`).join('')}
            </select>
          </div>
          <div class="row gap"><input data-custom placeholder="Or type a drill" class="grow"><button type="button" class="btn ghost" data-add-custom>Add</button></div>
        </fieldset>

        <fieldset class="field"><span>Ratings <em class="muted">(1 = needs lots of work, 5 = sharp)</em></span>
          ${client.skills.length ? client.skills.map(skill => `
            <div class="rating-row" data-skill="${esc(skill)}">
              <span class="grow">${esc(skill)}</span>
              <div class="seg">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" class="${s.ratings[skill] === n ? 'on' : ''}">${n}</button>`).join('')}</div>
            </div>`).join('') : '<div class="muted small">No skills set for this client — add some in their profile.</div>'}
        </fieldset>

        <label class="field"><span>What went well</span><textarea name="wentWell" rows="2" placeholder="Shows up in their recap">${esc(s.wentWell)}</textarea></label>
        <label class="field"><span>Work on next</span><textarea name="workOn" rows="2" placeholder="Shows up in their recap">${esc(s.workOn)}</textarea></label>
        <label class="field"><span>Private coach notes</span><textarea name="privateNotes" rows="2" placeholder="Only you see these">${esc(s.privateNotes)}</textarea></label>

        <fieldset class="field"><span>Voice memos</span>
          <div class="stack" data-memos>${memos.map(memoCard).join('')}</div>
          <button type="button" class="btn ghost" data-record>🎙 Record memo for this session</button>
        </fieldset>

        <button class="btn primary block" type="submit">Save session</button>
        ${existing ? '<button class="btn danger block" type="button" data-delete>Delete session</button>' : ''}
      </form>`,
  });

  const form = $('[data-form]', view);
  const drillList = $('[data-drills]', view);

  function renderDrills() {
    drillList.innerHTML = s.drills.length
      ? s.drills.map((d, i) => `<div class="drill-pill">${catDot(d.category)}<span class="grow">${esc(d.name)}</span><button type="button" class="icon-btn small" data-remove="${i}" aria-label="Remove">✕</button></div>`).join('')
      : '<div class="muted small">No drills added.</div>';
  }

  async function renderPlanSuggestions() {
    const date = form.date.value;
    const plan = date && (await db.byClient('plans', clientId)).find(p => p.weekStart === weekStart(date));
    const blocks = plan ? plan.days[(parseDate(date).getDay() + 6) % 7] : [];
    const fresh = blocks.filter(b => !s.drills.some(d => d.name === b.name));
    $('[data-from-plan-wrap]', view).hidden = !fresh.length;
    $('[data-from-plan]', view).innerHTML = fresh.map((b, i) => `<button type="button" class="chip-btn" data-plan-i="${blocks.indexOf(b)}">+ ${esc(b.name)}</button>`).join('')
      + (fresh.length > 1 ? '<button type="button" class="chip-btn strong" data-plan-all>+ All</button>' : '');
    $('[data-from-plan]', view).onclick = e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const picks = btn.dataset.planAll !== undefined ? fresh : [blocks[Number(btn.dataset.planI)]];
      for (const b of picks) s.drills.push({ drillId: b.drillId, name: b.name, category: b.category });
      renderDrills();
      renderPlanSuggestions();
    };
  }

  renderDrills();
  renderPlanSuggestions();
  form.date.addEventListener('change', renderPlanSuggestions);

  drillList.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    s.drills.splice(Number(btn.dataset.remove), 1);
    renderDrills();
    renderPlanSuggestions();
  });

  $('[data-library]', view).addEventListener('change', e => {
    const d = drills.find(x => x.id === e.target.value);
    if (d) s.drills.push({ drillId: d.id, name: d.name, category: d.category });
    e.target.value = '';
    renderDrills();
  });

  $('[data-add-custom]', view).addEventListener('click', () => {
    const input = $('[data-custom]', view);
    if (!input.value.trim()) return;
    s.drills.push({ drillId: null, name: input.value.trim(), category: 'Other' });
    input.value = '';
    renderDrills();
  });

  for (const row of $$('[data-skill]', view)) {
    row.addEventListener('click', e => {
      const btn = e.target.closest('[data-n]');
      if (!btn) return;
      const n = Number(btn.dataset.n);
      const skill = row.dataset.skill;
      s.ratings[skill] = s.ratings[skill] === n ? undefined : n; // tap again to clear
      if (s.ratings[skill] === undefined) delete s.ratings[skill];
      $$('[data-n]', row).forEach(b => b.classList.toggle('on', Number(b.dataset.n) === s.ratings[skill]));
    });
  }

  async function save() {
    const f = new FormData(form);
    Object.assign(s, {
      date: f.get('date'),
      type: f.get('type'),
      duration: Number(f.get('duration')) || 0,
      wentWell: f.get('wentWell').trim(),
      workOn: f.get('workOn').trim(),
      privateNotes: f.get('privateNotes').trim(),
      createdAt: s.createdAt || Date.now(),
    });
    await db.put('sessions', s);
    saved = true;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    await save();
    toast('Session saved');
    location.hash = `#/clients/${clientId}`;
  });

  $('[data-record]', view).addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    if (!saved) await save(); // a memo needs a session to hang off
    openRecorder({
      clientId, clientName: client.name, sessionId: s.id,
      onSaved: memo => {
        memos.push(memo);
        const holder = $('[data-memos]', view);
        holder.insertAdjacentHTML('beforeend', `<div>${memoCard(memo)}</div>`);
        bindMemoCards(holder.lastElementChild, [memo], () => sessionFormView(clientId, s.id));
      },
    });
  });

  bindMemoCards(view, memos, () => sessionFormView(clientId, s.id));

  $('[data-delete]', view)?.addEventListener('click', async () => {
    if (!confirm('Delete this session?')) return;
    await db.del('sessions', s.id);
    toast('Session deleted');
    location.hash = `#/clients/${clientId}`;
  });
}

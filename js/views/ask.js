// Ask Spotter: a conversation about one client, with his data and drill library behind it.
import { db, uid } from '../db.js';
import { esc, $, $$, weekStart, isoDate, addDays, DAY_NAMES, toast, toastAction, fmtSets } from '../util.js';
import { page, emptyState } from '../ui.js';
import { SUGGESTIONS, SYSTEM_PROMPT, clientBrief, askSpotter, extractProposal, replyText, validateProposal } from '../ask.js';

export async function askView(clientId) {
  const client = await db.get('clients', clientId);
  if (!client) return (location.hash = '#/');
  const [sessions, drills, plans, awards, auth, unit] = await Promise.all([
    db.byClient('sessions', clientId), db.all('drills'), db.byClient('plans', clientId),
    db.byClient('awards', clientId), db.getMeta('auth'), db.getMeta('weightUnit', 'lb'),
  ]);
  const ws = weekStart();
  const plan = plans.find(p => p.weekStart === ws);
  const conversation = []; // { role, text, proposal }

  const view = page({
    title: 'Ask Spotter',
    back: `#/clients/${clientId}`,
    body: `
      <div class="muted small subhead">${esc(client.name)}</div>
      ${auth ? '' : `<div class="banner">Ask Spotter needs you signed in. <a href="#/settings">Settings → Sync</a></div>`}
      <div class="ask-thread" data-thread></div>
      <div class="chips" data-suggestions>${SUGGESTIONS.map(s => `<button class="chip-btn" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <form class="row gap" data-form>
        <input class="grow" data-question placeholder="Ask about ${esc(client.name)}…" enterkeyhint="send" ${auth ? '' : 'disabled'}>
        <button class="btn primary" ${auth ? '' : 'disabled'}>Ask</button>
      </form>
      <p class="muted small" data-allowance>Answers use ${esc(client.name)}'s history and your drill library. Nothing is sent to them.</p>`,
  });

  const thread = $('[data-thread]', view);

  function render() {
    thread.innerHTML = conversation.map((turn, i) => {
      if (turn.role === 'user') return `<div class="ask-turn mine">${esc(turn.text)}</div>`;
      if (turn.pending) return '<div class="ask-turn thinking"><span class="dots">Thinking</span></div>';
      return `
        <div class="ask-turn">
          ${turn.text ? `<div class="ask-text">${esc(turn.text).replace(/\n/g, '<br>')}</div>` : ''}
          ${turn.preview ? proposalCard(turn.preview, i) : ''}
        </div>`;
    }).join('');
    thread.scrollTop = thread.scrollHeight;
    view.querySelector('[data-suggestions]').hidden = conversation.length > 0;
  }

  function proposalCard(preview, index) {
    const days = preview.days.map((day, i) => (day.length
      ? `<div class="small"><b>${DAY_NAMES[i]}</b>: ${day.map(b => `${esc(b.name)}${b.dose ? ` <span class="muted">(${esc(b.dose)})</span>` : ''}${b.sets?.length ? ` <span class="muted">${esc(fmtSets(b.sets, unit))}</span>` : ''}`).join(' · ')}</div>`
      : '')).join('');
    return `
      <div class="card proposal">
        <div class="row"><b class="grow">Proposed week</b><span class="muted small">${preview.used} drills</span></div>
        ${days}
        ${preview.unknown.length ? `<div class="small warn-text">Not in your library, so left out: ${esc(preview.unknown.join(', '))}</div>` : ''}
        ${preview.tooAdvanced.length ? `<div class="small warn-text">Above ${esc(client.name)}'s level, so left out: ${esc(preview.tooAdvanced.join(', '))}</div>` : ''}
        <div class="row gap wrap">
          <button class="btn primary small" data-apply="${index}">Apply to this week</button>
          <button class="btn ghost small" data-apply-add="${index}">Add to what's there</button>
        </div>
        ${preview.newDrills.length ? `
          <div class="small">Suggested new drills:</div>
          ${preview.newDrills.map((d, j) => `
            <div class="row gap wrap small">
              <span class="grow">${esc(d.name)} <span class="muted">${esc(d.category || 'Other')}${d.why ? ` · ${esc(d.why)}` : ''}</span></span>
              <button class="btn ghost small" data-add-drill="${index}:${j}">+ Add to library</button>
            </div>`).join('')}` : ''}
      </div>`;
  }

  async function ask(question) {
    if (!question.trim()) return;
    conversation.push({ role: 'user', text: question.trim() });
    conversation.push({ role: 'assistant', pending: true });
    render();

    const brief = clientBrief({ client, sessions, drills, plan, unit, awards });
    const history = conversation
      .filter(t => !t.pending && (t.role === 'user' || t.text))
      .map(t => ({ role: t.role, content: t.role === 'user' ? t.text : t.raw || t.text }));
    history[0].content = `${brief}\n\n---\n\n${history[0].content}`;

    try {
      const reply = await askSpotter({ system: SYSTEM_PROMPT, messages: history });
      const proposal = extractProposal(reply.text);
      const turn = {
        role: 'assistant',
        raw: reply.text,
        text: replyText(reply.text) || 'Here you go.',
        preview: proposal ? validateProposal(proposal, { drills, client }) : null,
      };
      if (turn.preview && !turn.preview.used && !turn.preview.newDrills.length) turn.preview = null;
      conversation[conversation.length - 1] = turn;
      $('[data-allowance]', view).textContent = `${reply.usedToday} of ${reply.dailyLimit} questions used today.`;
    } catch (err) {
      conversation[conversation.length - 1] = { role: 'assistant', text: err.message };
    }
    render();
  }

  $('[data-form]', view).addEventListener('submit', e => {
    e.preventDefault();
    const input = $('[data-question]', view);
    const question = input.value;
    input.value = '';
    ask(question);
  });

  $('[data-suggestions]', view).addEventListener('click', e => {
    const btn = e.target.closest('[data-suggest]');
    if (btn) ask(btn.dataset.suggest);
  });

  thread.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.apply !== undefined || btn.dataset.applyAdd !== undefined) {
      const replace = btn.dataset.apply !== undefined;
      const preview = conversation[Number(btn.dataset.apply ?? btn.dataset.applyAdd)].preview;
      const target = plans.find(p => p.weekStart === ws) || { id: uid(), clientId, weekStart: ws, days: Array.from({ length: 7 }, () => []), notes: '' };
      const before = structuredClone(target.days);
      target.days = target.days.map((day, i) => (replace ? preview.days[i] : [...day, ...preview.days[i]]));
      target.why = ['Built with Ask Spotter.'];
      await db.put('plans', target);
      if (!plans.includes(target)) plans.push(target);
      toastAction('Week updated', 'Undo', async () => {
        target.days = before;
        await db.put('plans', target);
        toast('Put back');
      }, 12000);
      return;
    }

    if (btn.dataset.addDrill) {
      const [turnIndex, drillIndex] = btn.dataset.addDrill.split(':').map(Number);
      const suggestion = conversation[turnIndex].preview.newDrills[drillIndex];
      const drill = {
        id: uid(),
        name: suggestion.name,
        category: suggestion.category || 'Other',
        level: Number(suggestion.level) || 1,
        intensity: Number(suggestion.intensity) || 2,
        skills: Array.isArray(suggestion.skills) ? suggestion.skills : [],
        dose: suggestion.dose || '',
        notes: suggestion.why || '',
      };
      await db.put('drills', drill);
      drills.push(drill);
      btn.disabled = true;
      btn.textContent = 'Added';
      toast(`${drill.name} added to your drills`);
    }
  });

  render();
}

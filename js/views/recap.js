// Recap screen: pick a date range, generate from the template, edit, send via his mail app.
import { db, uid } from '../db.js';
import { esc, $, $$, isoDate, addDays, weekStart, fmtDate, toast } from '../util.js';
import { page } from '../ui.js';
import { buildRecap, mailtoLink } from '../recap.js';
import { byDate, inRange } from '../progress.js';

export async function recapView(clientId) {
  const client = await db.get('clients', clientId);
  if (!client) return (location.hash = '#/');
  const [sessions, memos, plans, recaps, awards, trainerName, recapClosing, weightUnit] = await Promise.all([
    db.byClient('sessions', clientId), db.byClient('memos', clientId), db.byClient('plans', clientId),
    db.byClient('recaps', clientId), db.byClient('awards', clientId),
    db.getMeta('trainerName', ''), db.getMeta('recapClosing', 'Keep putting in the work - see you on the mats.'),
    db.getMeta('weightUnit', 'lb'),
  ]);
  const today = isoDate();
  const lastRecap = byDate(recaps).at(-1);
  const presets = [
    ['Last 7 days', addDays(today, -6)],
    ['Last 14 days', addDays(today, -13)],
    ['Last 30 days', addDays(today, -29)],
    ...(lastRecap ? [['Since last recap', addDays(lastRecap.to, 1) > today ? today : addDays(lastRecap.to, 1)]] : []),
  ];

  const view = page({
    title: 'Recap',
    back: `#/clients/${clientId}`,
    body: `
      <div class="muted small subhead">${esc(client.name)}${lastRecap ? ` · last recap sent ${fmtDate(lastRecap.date)}` : ''}</div>
      <div class="chips" data-presets>${presets.map(([label, from], i) => `<button class="chip-btn ${i === 0 ? 'on' : ''}" data-from="${from}">${label}</button>`).join('')}</div>
      <div class="grid-2">
        <label class="field"><span>From</span><input type="date" data-range="from" value="${presets[0][1]}"></label>
        <label class="field"><span>To</span><input type="date" data-range="to" value="${today}"></label>
      </div>
      <details class="card private" data-private></details>
      ${client.email ? '' : `<div class="banner warn">No email on file for ${esc(client.name)}. <a href="#/clients/${clientId}/edit">Add one</a> or fill in the To: line in your mail app.</div>`}
      <label class="field"><span>Subject</span><input data-subject></label>
      <label class="field"><span>Email</span><textarea class="recap-body" data-body rows="18"></textarea></label>
      <div class="row gap wrap">
        <button class="btn ghost" data-regen>↻ Regenerate</button>
        <span class="grow"></span>
        <button class="btn ghost" data-copy>Copy</button>
        ${navigator.share ? '<button class="btn ghost" data-share>Share</button>' : ''}
        <button class="btn primary" data-mail>Open in Mail</button>
      </div>
      <p class="muted small">Edit anything above before sending. Private notes and voice memos are never added to the email.</p>`,
  });

  const from = $('[data-range="from"]', view), to = $('[data-range="to"]', view);
  const subject = $('[data-subject]', view), body = $('[data-body]', view);

  function generate() {
    const nextPlan = plans.find(p => p.weekStart === addDays(weekStart(to.value), 7));
    const recap = buildRecap({ client, sessions, awards, from: from.value, to: to.value, nextPlan, settings: { trainerName, recapClosing, weightUnit } });
    subject.value = recap.subject;
    body.value = recap.body;
    renderPrivate();
  }

  // His own notes for the period, as reference while he edits — kept out of the email.
  function renderPrivate() {
    const notes = [
      ...inRange(sessions, from.value, to.value).filter(s => s.privateNotes).map(s => ({ date: s.date, text: s.privateNotes, icon: '🔒' })),
      ...memos.filter(m => m.date >= from.value && m.date <= to.value && m.note).map(m => ({ date: m.date, text: m.note, icon: '🎙' })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    $('[data-private]', view).innerHTML = `
      <summary>Your private notes for this period <span class="muted">(${notes.length})</span></summary>
      ${notes.length ? notes.map(n => `<div class="small note-line">${n.icon} <b>${fmtDate(n.date, { month: 'short', day: 'numeric' })}</b> ${esc(n.text)}</div>`).join('') : '<div class="muted small">None — memos without a typed note won’t show here.</div>'}`;
  }

  $('[data-presets]', view).addEventListener('click', e => {
    const b = e.target.closest('[data-from]');
    if (!b) return;
    $$('[data-from]', view).forEach(x => x.classList.toggle('on', x === b));
    from.value = b.dataset.from;
    to.value = today;
    generate();
  });
  [from, to].forEach(input => input.addEventListener('change', () => {
    $$('[data-from]', view).forEach(x => x.classList.remove('on'));
    generate();
  }));
  $('[data-regen]', view).addEventListener('click', () => {
    if (confirm('Regenerate? Your edits to the email will be replaced.')) generate();
  });

  async function record() {
    await db.put('recaps', { id: uid(), clientId, date: today, createdAt: Date.now(), from: from.value, to: to.value, subject: subject.value, body: body.value });
  }

  $('[data-copy]', view).addEventListener('click', async () => {
    await navigator.clipboard.writeText(`${subject.value}\n\n${body.value}`);
    toast('Copied');
  });

  $('[data-share]', view)?.addEventListener('click', async () => {
    try {
      await navigator.share({ title: subject.value, text: body.value });
      await record();
      toast('Saved to timeline');
    } catch { /* cancelled */ }
  });

  $('[data-mail]', view).addEventListener('click', async () => {
    await record();
    location.href = mailtoLink(client.email, subject.value, body.value);
    toast('Saved to timeline');
  });

  generate();
}

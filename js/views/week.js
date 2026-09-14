// "Week" across every client: who's training which day, what's logged, and one-tap planning for everyone.
import { db, uid } from '../db.js';
import { esc, weekStart, addDays, fmtRange, fmtDate, DAY_NAMES, isoDate, initials, toast, $ } from '../util.js';
import { page, catDot, emptyState } from '../ui.js';
import { autoBuildWeek, cycleInfo, programFor } from '../planner.js';
import { focusAreas } from '../progress.js';

export async function weekView(week) {
  const ws = weekStart(week || isoDate());
  const [clients, plans, sessions, drills] = await Promise.all([db.all('clients'), db.all('plans'), db.all('sessions'), db.all('drills')]);
  const weekPlans = plans.filter(p => p.weekStart === ws);
  const byId = Object.fromEntries(clients.map(c => [c.id, c]));
  const unplanned = clients.filter(c => !weekPlans.some(p => p.clientId === c.id && p.days.flat().length)).sort((a, b) => a.name.localeCompare(b.name));
  const buildable = unplanned.filter(c => cycleInfo(c, ws).theme);
  const today = isoDate();

  const days = DAY_NAMES.map((name, i) => {
    const date = addDays(ws, i);
    const planned = weekPlans.filter(p => p.days[i].length && byId[p.clientId]).map(p => ({ c: byId[p.clientId], blocks: p.days[i] }));
    const logged = sessions.filter(s => s.date === date && byId[s.clientId]);
    return { name, date, planned, logged };
  });

  const view = page({
    title: 'Week',
    body: `
      <div class="week-nav">
        <a class="icon-btn" href="#/week/${addDays(ws, -7)}" aria-label="Previous week">‹</a>
        <div class="grow center"><b>${fmtRange(ws, addDays(ws, 6))}</b>${ws === weekStart() ? ' <span class="tag">this week</span>' : ''}</div>
        <a class="icon-btn" href="#/week/${addDays(ws, 7)}" aria-label="Next week">›</a>
      </div>
      ${!clients.length ? emptyState('🗓', 'No clients yet', 'Add clients and set their program levels — then every week plans itself from here.') : `
      ${unplanned.length ? `
        <section class="card stack">
          <div><b>${unplanned.length} client${unplanned.length === 1 ? '' : 's'} without a plan</b></div>
          ${buildable.length ? `<button class="btn primary block" data-build-all>⚡ Auto-build ${buildable.length === unplanned.length ? 'all' : buildable.length} for this week</button>` : ''}
          ${unplanned.map(c => {
            const cy = cycleInfo(c, ws);
            return `<a class="row link-row" href="#/clients/${c.id}/plan/${ws}"><span class="grow">${esc(c.name)} <span class="muted small">${cy.theme ? `${esc(cy.phase.name)} · ${esc(cy.theme)}` : 'no levels set'}</span></span><span class="btn ghost small">Plan →</span></a>`;
          }).join('')}
        </section>` : ''}
      ${days.map(d => `
        <section class="day ${d.date === today ? 'today' : ''} ${d.planned.length || d.logged.length ? '' : 'rest'}">
          <div class="day-head"><b>${d.name}</b> <span class="muted small">${fmtDate(d.date, { month: 'short', day: 'numeric' })}</span></div>
          ${d.planned.map(({ c, blocks }) => {
            const done = d.logged.some(s => s.clientId === c.id);
            return `<a class="block link" href="#/clients/${c.id}/plan/${ws}">
              <div class="avatar sm">${esc(initials(c.name))}</div>
              <div class="grow"><div>${esc(c.name)} ${done ? '<span class="good small">✓ logged</span>' : ''}</div>
              <div class="small muted">${blocks.map(b => `${catDot(b.category)}${esc(b.name)}`).join(' ')}</div></div>
            </a>`;
          }).join('')}
          ${d.logged.filter(s => !d.planned.some(p => p.c.id === s.clientId)).map(s => `
            <a class="block link" href="#/clients/${s.clientId}/sessions/${s.id}">
              <div class="avatar sm">${esc(initials(byId[s.clientId].name))}</div>
              <div class="grow">${esc(byId[s.clientId].name)} <span class="good small">✓ ${esc(s.type)}</span></div>
            </a>`).join('')}
        </section>`).join('')}`}`,
  });

  $('[data-build-all]', view)?.addEventListener('click', async () => {
    for (const client of buildable) {
      const mine = plans.filter(p => p.clientId === client.id);
      const existing = mine.find(p => p.weekStart === ws);
      const focusSkills = focusAreas(client, sessions.filter(s => s.clientId === client.id)).map(f => f.skill);
      const { days: built, info } = autoBuildWeek({ client, drills, plans: mine, ws, trainingDays: programFor(client).days, focusSkills });
      await db.put('plans', { id: existing?.id || uid(), clientId: client.id, weekStart: ws, notes: existing?.notes || '', ...existing, days: built, phase: info.phase.name, theme: info.theme });
    }
    toast(`Built ${buildable.length} plan${buildable.length === 1 ? '' : 's'}`);
    weekView(ws);
  });
}

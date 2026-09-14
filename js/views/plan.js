// One client's weekly curriculum. Every change saves immediately.
import { db, uid } from '../db.js';
import { esc, $, $$, weekStart, addDays, fmtDate, fmtRange, DAY_NAMES, isoDate, toast } from '../util.js';
import { CATEGORIES, LEVEL_SHORT, INTENSITY } from '../seed.js';
import { page, openSheet, catDot } from '../ui.js';
import { focusAreas } from '../progress.js';
import { autoBuildWeek, emptyWeek, blockFrom, varietyReport, cycleInfo, programFor, PHASES } from '../planner.js';

export async function planView(clientId, week) {
  const client = await db.get('clients', clientId);
  if (!client) return (location.hash = '#/');
  const ws = weekStart(week || isoDate());
  const [plans, drills, sessions] = await Promise.all([db.byClient('plans', clientId), db.all('drills'), db.byClient('sessions', clientId)]);
  const lastWeek = plans.find(p => p.weekStart === addDays(ws, -7));
  const plan = plans.find(p => p.weekStart === ws) || { id: uid(), clientId, weekStart: ws, days: emptyWeek(), notes: '' };
  const focusSkills = focusAreas(client, sessions).map(f => f.skill);
  const program = programFor(client);
  const cycle = cycleInfo(client, ws);

  const view = page({
    title: 'Week plan',
    back: `#/clients/${clientId}`,
    body: `
      <div class="muted small subhead">${esc(client.name)}</div>
      <div class="week-nav">
        <a class="icon-btn" href="#/clients/${clientId}/plan/${addDays(ws, -7)}" aria-label="Previous week">‹</a>
        <div class="grow center"><b>${fmtRange(ws, addDays(ws, 6))}</b>${ws === weekStart() ? ' <span class="tag">this week</span>' : ''}</div>
        <a class="icon-btn" href="#/clients/${clientId}/plan/${addDays(ws, 7)}" aria-label="Next week">›</a>
      </div>
      ${cycle.theme ? `
        <section class="card cycle">
          <div class="phase-steps labeled">${PHASES.map((p, i) => `<span class="${i === cycle.phaseIndex ? 'on' : i < cycle.phaseIndex ? 'done' : ''}"><i>${esc(p.name)}</i></span>`).join('')}</div>
          <div><b>Block ${cycle.block}, week ${cycle.phaseIndex + 1}: ${esc(cycle.phase.name)}</b> · ${esc(cycle.theme)} focus</div>
          <div class="muted small">${esc(cycle.phase.blurb)} Levels: ${cycle.combat.concat(cycle.conditioning).map(d => `${esc(d)} ${LEVEL_SHORT[program.levels[d]]}`).join(', ')}.</div>
        </section>`
      : `<a class="banner" href="#/clients/${clientId}/edit">Set ${esc(client.name)}'s level in each discipline to unlock auto-building →</a>`}
      <div class="row gap wrap">
        <button class="btn primary" data-auto ${cycle.theme ? '' : 'disabled'}>⚡ Auto-build</button>
        ${lastWeek ? '<button class="btn ghost" data-copy>Copy last week</button>' : ''}
        <button class="btn ghost" data-clear>Clear</button>
      </div>
      <section class="card variety" data-variety></section>
      <div data-days></div>
      <label class="field"><span>Notes for this week</span><textarea rows="2" data-notes placeholder="Included under the plan in their recap">${esc(plan.notes)}</textarea></label>`,
  });

  const save = () => db.put('plans', plan);

  function render() {
    const report = varietyReport(plan, plans, drills, focusSkills);
    $('[data-variety]', view).innerHTML = report.total ? `
      <div class="cat-bar">${CATEGORIES.concat('Other').filter(c => report.categories[c]).map(c => `<span data-cat="${esc(c)}" style="flex:${report.categories[c]}" title="${esc(c)}: ${report.categories[c]}"></span>`).join('')}</div>
      <div class="small">${report.total} drills · ${Object.keys(report.categories).length} categories · ${report.repeats ? `<span class="warn-text">${report.repeats} repeated from the last 2 weeks</span>` : '<span class="good">nothing repeated from the last 2 weeks</span>'}</div>
      ${focusSkills.length ? `<div class="small">Needs work: ${focusSkills.map(s => `<span class="${report.focusCovered.includes(s) ? 'good' : 'warn-text'}">${report.focusCovered.includes(s) ? '✓' : '✗'} ${esc(s)}</span>`).join(' · ')}</div>` : ''}`
      : '<div class="muted small">Empty week. Auto-build it from their program, or add drills day by day.</div>';

    $('[data-days]', view).innerHTML = plan.days.map((blocks, day) => `
      <section class="day ${blocks.length ? '' : 'rest'}">
        <div class="day-head">
          <b>${DAY_NAMES[day]}</b> <span class="muted small">${fmtDate(addDays(ws, day), { month: 'short', day: 'numeric' })}</span>
          <span class="grow"></span>
          <button class="btn ghost small" data-add="${day}">+ Drill</button>
        </div>
        ${blocks.map((b, i) => `
          <div class="block">
            ${catDot(b.category)}
            <div class="grow"><div>${esc(b.name)}</div><input class="dose" value="${esc(b.dose)}" placeholder="sets / rounds" data-dose="${day}:${i}"></div>
            <button class="icon-btn small" data-swap="${day}:${i}" aria-label="Swap for a similar drill" title="Swap">⇄</button>
            <button class="icon-btn small" data-up="${day}:${i}" aria-label="Move up" ${i ? '' : 'disabled'}>↑</button>
            <button class="icon-btn small" data-del="${day}:${i}" aria-label="Remove">✕</button>
          </div>`).join('')}
      </section>`).join('');
  }

  render();

  const at = key => key.split(':').map(Number);

  $('[data-days]', view).addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.add) return pickDrill(Number(btn.dataset.add));
    if (btn.dataset.del) { const [d, i] = at(btn.dataset.del); plan.days[d].splice(i, 1); }
    if (btn.dataset.up) { const [d, i] = at(btn.dataset.up); [plan.days[d][i - 1], plan.days[d][i]] = [plan.days[d][i], plan.days[d][i - 1]]; }
    if (btn.dataset.swap) {
      // Same category, fits their level, not already in this week.
      const [d, i] = at(btn.dataset.swap);
      const current = plan.days[d][i];
      const inWeek = new Set(plan.days.flat().map(b => b.drillId));
      const level = program.levels[current.category] ?? 3;
      const options = drills.filter(x => x.category === current.category && !inWeek.has(x.id) && (x.level || 1) <= Math.max(level, 1));
      if (!options.length) return toast('No other drills fit here — add more in Drills');
      plan.days[d][i] = blockFrom(options[Math.floor(Math.random() * options.length)]);
    }
    await save();
    render();
  });

  $('[data-days]', view).addEventListener('change', async e => {
    if (!e.target.dataset.dose) return;
    const [d, i] = at(e.target.dataset.dose);
    plan.days[d][i].dose = e.target.value;
    await save();
  });

  $('[data-notes]', view).addEventListener('change', async e => { plan.notes = e.target.value; await save(); });

  $('[data-copy]', view)?.addEventListener('click', async () => {
    if (plan.days.flat().length && !confirm('Replace this week with a copy of last week?')) return;
    plan.days = structuredClone(lastWeek.days);
    await save();
    render();
  });

  $('[data-clear]', view).addEventListener('click', async () => {
    if (!confirm('Clear every drill from this week?')) return;
    plan.days = emptyWeek();
    await save();
    render();
  });

  $('[data-auto]', view).addEventListener('click', () => {
    openSheet({
      title: 'Auto-build week',
      body: `
        <p class="small">${esc(cycle.phase.name)} week, ${esc(cycle.theme)} focus. Picks drills that fit ${esc(client.name)}'s levels, skips what they did recently${focusSkills.length ? `, and leans into ${esc(focusSkills.join(' & '))}` : ''}.</p>
        <fieldset class="field"><span>Training days</span>
          <div class="chips">${DAY_NAMES.map((d, i) => `<label class="chip"><input type="checkbox" value="${i}" ${program.days.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div>
        </fieldset>
        <button class="btn primary block" data-go>Build it</button>`,
      onMount: (el, close) => {
        $('[data-go]', el).addEventListener('click', async () => {
          const days = $$('input:checked', el).map(i => Number(i.value));
          if (!days.length) return toast('Pick at least one day');
          if (plan.days.flat().length && !confirm('Replace the current plan for this week?')) return;
          const built = autoBuildWeek({ client, drills, plans, ws, trainingDays: days, focusSkills });
          Object.assign(plan, { days: built.days, phase: cycle.phase.name, theme: cycle.theme });
          client.program = { ...program, days };
          await db.put('clients', client); // remember their usual days
          await save();
          close();
          render();
          toast('Week built — swap or tweak anything');
        });
      },
    });
  });

  function pickDrill(day) {
    openSheet({
      title: `Add to ${DAY_NAMES[day]}`,
      body: `
        <input class="search" type="search" placeholder="Search drills" data-q>
        <label class="row gap small"><input type="checkbox" data-fit checked style="width:auto"> Only drills that fit their levels</label>
        <div class="chips scroll-x" data-cats><button class="chip-btn on" data-cat-filter="">All</button>${CATEGORIES.map(c => `<button class="chip-btn" data-cat-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div>
        <div class="pick-list" data-picks></div>
        <div class="row gap"><input class="grow" placeholder="Custom drill" data-custom><button class="btn ghost" data-add-custom>Add</button></div>`,
      onMount: (el, close) => {
        let cat = '';
        const renderPicks = () => {
          const q = $('[data-q]', el).value.trim().toLowerCase();
          const fit = $('[data-fit]', el).checked;
          const inPlan = new Set(plan.days.flat().map(b => b.drillId));
          $('[data-picks]', el).innerHTML = drills
            .filter(d => (!cat || d.category === cat) && d.name.toLowerCase().includes(q))
            .filter(d => !fit || (d.level || 1) <= Math.max(program.levels[d.category] ?? 3, 1) && (program.levels[d.category] ?? 3) > 0)
            .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || (a.level || 1) - (b.level || 1) || a.name.localeCompare(b.name))
            .map(d => `<button class="pick" data-pick="${d.id}">${catDot(d.category)}<span class="grow">${esc(d.name)}${inPlan.has(d.id) ? ' <span class="muted small">(in plan)</span>' : ''}<br><span class="muted small">${LEVEL_SHORT[d.level || 1]} · ${INTENSITY[d.intensity || 2]}</span></span><span class="muted small">${esc(d.dose)}</span></button>`)
            .join('') || '<div class="muted small">No matches.</div>';
        };
        renderPicks();
        $('[data-q]', el).addEventListener('input', renderPicks);
        $('[data-fit]', el).addEventListener('change', renderPicks);
        $('[data-cats]', el).addEventListener('click', e => {
          const b = e.target.closest('[data-cat-filter]');
          if (!b) return;
          cat = b.dataset.catFilter;
          $$('[data-cat-filter]', el).forEach(x => x.classList.toggle('on', x === b));
          renderPicks();
        });
        $('[data-picks]', el).addEventListener('click', async e => {
          const b = e.target.closest('[data-pick]');
          if (!b) return;
          plan.days[day].push(blockFrom(drills.find(d => d.id === b.dataset.pick)));
          await save();
          render();
          close();
        });
        $('[data-add-custom]', el).addEventListener('click', async () => {
          const name = $('[data-custom]', el).value.trim();
          if (!name) return;
          plan.days[day].push({ drillId: null, name, category: 'Other', dose: '' });
          await save();
          render();
          close();
        });
      },
    });
  }
}

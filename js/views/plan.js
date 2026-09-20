// One client's weekly curriculum. Every change saves immediately.
import { db, uid } from '../db.js';
import { esc, $, $$, weekStart, addDays, fmtDate, fmtRange, DAY_NAMES, isoDate, toast, toastAction, fmtSets } from '../util.js';
import { CATEGORIES, LEVEL_SHORT, INTENSITY } from '../seed.js';
import { page, openSheet, catDot } from '../ui.js';
import { focusAreas, lastSetsFor } from '../progress.js';
import { autoBuildWeek, emptyWeek, blockFrom, varietyReport, cycleInfo, programFor, PHASES } from '../planner.js';

export async function planView(clientId, week) {
  const client = await db.get('clients', clientId);
  if (!client) return (location.hash = '#/');
  const ws = weekStart(week || isoDate());
  const [plans, drills, sessions] = await Promise.all([db.byClient('plans', clientId), db.all('drills'), db.byClient('sessions', clientId)]);
  // A cancelled day is stored as a session record with cancelled: true, so it shows up in the timeline,
  // the progress tab and recaps like any other day.
  const cancelledDays = new Map(sessions.filter(s => s.cancelled).map(s => [s.date, s]));
  const loggedDays = new Set(sessions.filter(s => !s.cancelled).map(s => s.date));
  const lastWeek = plans.find(p => p.weekStart === addDays(ws, -7));
  const plan = plans.find(p => p.weekStart === ws) || { id: uid(), clientId, weekStart: ws, days: emptyWeek(), notes: '' };
  const focusSkills = focusAreas(client, sessions).map(f => f.skill);
  const program = programFor(client);
  const cycle = cycleInfo(client, ws);
  const unit = await db.getMeta('weightUnit', 'lb');
  const openWeights = new Set(); // "day:index" of blocks showing their weights
  // A copied day waits in meta, so it survives moving to another week — or another client.
  let clipboard = await db.getMeta('planClipboard');

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
      <div data-clipboard></div>
      <section class="card variety" data-variety></section>
      <div data-days></div>
      <label class="field"><span>Notes for this week</span><textarea rows="2" data-notes placeholder="Included under the plan in their recap">${esc(plan.notes)}</textarea></label>`,
  });

  const save = () => db.put('plans', plan);

  function render() {
    $('[data-clipboard]', view).innerHTML = clipboard
      ? `<div class="banner row gap wrap"><span class="grow">📋 Copied: <b>${esc(clipboard.label)}</b> — tap Paste on any day${clipboard.blocks.length === 1 ? '' : ` (${clipboard.blocks.length} drills)`}</span>
           <button class="btn ghost small" data-clear-clip>Clear</button></div>`
      : '';

    const report = varietyReport(plan, plans, drills, focusSkills);
    $('[data-variety]', view).innerHTML = report.total ? `
      <div class="cat-bar">${CATEGORIES.concat('Other').filter(c => report.categories[c]).map(c => `<span data-cat="${esc(c)}" style="flex:${report.categories[c]}" title="${esc(c)}: ${report.categories[c]}"></span>`).join('')}</div>
      <div class="small">${report.total} drills · ${Object.keys(report.categories).length} categories · ${report.repeats ? `<span class="warn-text">${report.repeats} repeated from the last 2 weeks</span>` : '<span class="good">nothing repeated from the last 2 weeks</span>'}</div>
      ${focusSkills.length ? `<div class="small">Needs work: ${focusSkills.map(s => `<span class="${report.focusCovered.includes(s) ? 'good' : 'warn-text'}">${report.focusCovered.includes(s) ? '✓' : '✗'} ${esc(s)}</span>`).join(' · ')}</div>` : ''}`
      : '<div class="muted small">Empty week. Auto-build it from their program, or add drills day by day.</div>';

    $('[data-days]', view).innerHTML = plan.days.map((blocks, day) => {
      const date = addDays(ws, day);
      const off = cancelledDays.get(date);
      return `
      <section class="day ${blocks.length ? '' : 'rest'} ${off ? 'cancelled' : ''}" data-day="${day}" data-date="${date}">
        <div class="day-head">
          <b>${DAY_NAMES[day]}</b> <span class="muted small">${fmtDate(date, { month: 'short', day: 'numeric' })}</span>
          ${off ? `<span class="tag warn">🚫 Cancelled${off.cancelReason ? ` · ${esc(off.cancelReason)}` : ''}</span>` : ''}
          ${loggedDays.has(date) ? '<span class="tag good-tag">✓ logged</span>' : ''}
          <span class="grow"></span>
          ${off
            ? `<button class="btn ghost small" data-uncancel="${day}">Undo cancel</button>`
            : `<button class="btn ghost small" data-add="${day}">+ Drill</button>
               ${blocks.length ? `<button class="btn ghost small" data-copy-day="${day}" title="Copy this day">⧉ Copy</button>` : ''}
               ${clipboard ? `<button class="btn ghost small" data-paste-day="${day}" title="Paste ${esc(clipboard.label)}">📋 Paste</button>` : ''}
               <button class="btn ghost small" data-cancel="${day}" title="Client cancelled this day">🚫 Cancel</button>`}
        </div>
        ${blocks.map((b, i) => `
          <div class="block" data-pos="${day}:${i}" data-ref="${day}:${i}">
            <button class="icon-btn small grip" data-grip aria-label="Drag to reorder ${esc(b.name)}" title="Drag to reorder">⠿</button>
            ${catDot(b.category)}
            <div class="grow">
              <div>${esc(b.name)}</div>
              <input class="dose" value="${esc(b.dose)}" placeholder="sets / rounds" data-dose="${day}:${i}">
              ${b.sets?.length && !openWeights.has(`${day}:${i}`) ? `<div class="muted small">🏋️ ${esc(fmtSets(b.sets, unit))}</div>` : ''}
              ${openWeights.has(`${day}:${i}`) ? weightsEditor(b, day, i) : ''}
            </div>
            <div class="block-actions">
            <button class="icon-btn small ${b.sets?.length ? 'on' : ''}" data-weights="${day}:${i}" aria-label="Plan weights for ${esc(b.name)}" title="Plan weights">🏋️</button>
            <button class="icon-btn small" data-up="${day}:${i}" aria-label="Move ${esc(b.name)} up" title="Move up" ${day === 0 && i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-btn small" data-down="${day}:${i}" aria-label="Move ${esc(b.name)} down" title="Move down" ${day === 6 && i === blocks.length - 1 ? 'disabled' : ''}>↓</button>
            <button class="icon-btn small" data-swap="${day}:${i}" aria-label="Swap for a similar drill" title="Swap">⇄</button>
            <button class="icon-btn small" data-del="${day}:${i}" aria-label="Remove">✕</button>
            </div>
          </div>`).join('')}
      </section>`;
    }).join('');
  }

  // Weights he plans to put on the bar. Logging the session copies these across as the starting numbers.
  function weightsEditor(block, day, i) {
    const last = lastSetsFor(sessions, block);
    return `
      <div class="sets">
        ${(block.sets || []).map((set, j) => `
          <div class="set-row">
            <span class="set-n">${j + 1}</span>
            <input type="number" inputmode="decimal" step="any" min="0" placeholder="weight" value="${set.weight ?? ''}" data-w="${day}:${i}:${j}" aria-label="Set ${j + 1} weight">
            <span class="unit">${esc(unit)}</span>
            <input type="number" inputmode="numeric" min="0" placeholder="reps" value="${set.reps ?? ''}" data-r="${day}:${i}:${j}" aria-label="Set ${j + 1} reps">
            <button class="icon-btn small" data-delset="${day}:${i}:${j}" aria-label="Remove set ${j + 1}">✕</button>
          </div>`).join('')}
        <div class="row gap wrap">
          <button class="btn ghost small" data-addset="${day}:${i}">+ Set</button>
          ${last ? `<span class="muted small">Last (${fmtDate(last.date, { month: 'short', day: 'numeric' })}): ${esc(fmtSets(last.sets, unit))}</span>
                    <button class="btn ghost small" data-repeat="${day}:${i}">Repeat</button>` : ''}
        </div>
      </div>`;
  }

  render();

  const at = key => key.split(':').map(Number);

  $('[data-days]', view).addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.add) return pickDrill(Number(btn.dataset.add));
    if (btn.dataset.copyDay) {
      const day = Number(btn.dataset.copyDay);
      clipboard = {
        label: `${client.name} · ${DAY_NAMES[day]} ${fmtDate(addDays(ws, day), { month: 'short', day: 'numeric' })}`,
        blocks: structuredClone(plan.days[day]),
      };
      await db.setMeta('planClipboard', clipboard);
      toast(`${DAY_NAMES[day]} copied — tap Paste on another day`);
      return render();
    }
    if (btn.dataset.pasteDay) return pasteDay(Number(btn.dataset.pasteDay));
    if (btn.dataset.cancel) return cancelDay(Number(btn.dataset.cancel));
    if (btn.dataset.uncancel) return uncancelDay(Number(btn.dataset.uncancel));
    if (btn.dataset.weights) {
      const key = btn.dataset.weights;
      const [d, i] = at(key);
      if (openWeights.has(key)) openWeights.delete(key);
      else {
        openWeights.add(key);
        if (!plan.days[d][i].sets?.length) plan.days[d][i].sets = [{ weight: '', reps: '' }];
      }
      return render(); // nothing to save yet
    }
    if (btn.dataset.addset) {
      const [d, i] = at(btn.dataset.addset);
      const sets = plan.days[d][i].sets;
      sets.push({ ...(sets[sets.length - 1] || { weight: '', reps: '' }) });
    }
    if (btn.dataset.delset) {
      const [d, i, j] = at(btn.dataset.delset);
      plan.days[d][i].sets.splice(j, 1);
      if (!plan.days[d][i].sets.length) delete plan.days[d][i].sets;
    }
    if (btn.dataset.repeat) {
      const [d, i] = at(btn.dataset.repeat);
      plan.days[d][i].sets = lastSetsFor(sessions, plan.days[d][i]).sets.map(x => ({ weight: x.weight, reps: x.reps }));
    }
    if (btn.dataset.up || btn.dataset.down) {
      const [d, i] = at(btn.dataset.up || btn.dataset.down);
      const step = btn.dataset.up ? -1 : 1;
      const [block] = plan.days[d].splice(i, 1);
      const next = i + step;
      if (next >= 0 && next <= plan.days[d].length) {
        plan.days[d].splice(next, 0, block); // move within the day
      } else {
        // past the top or bottom of a day: hop to the next day that isn't cancelled
        let target = d + step;
        while (target >= 0 && target <= 6 && cancelledDays.has(addDays(ws, target))) target += step;
        if (target < 0 || target > 6) plan.days[d].splice(i, 0, block); // nowhere to go: put it back
        else if (step < 0) plan.days[target].push(block);
        else plan.days[target].unshift(block);
      }
    }
    if (btn.dataset.del) {
      const [d, i] = at(btn.dataset.del);
      const [removed] = plan.days[d].splice(i, 1);
      toastAction(`Removed ${removed.name}`, 'Undo', async () => {
        plan.days[d].splice(i, 0, removed);
        await save();
        render();
      });
    }
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
    const { dose, w, r } = e.target.dataset;
    if (dose) {
      const [d, i] = at(dose);
      plan.days[d][i].dose = e.target.value;
    } else if (w || r) {
      const [d, i, j] = at(w || r);
      plan.days[d][i].sets[j][w ? 'weight' : 'reps'] = e.target.value === '' ? '' : Number(e.target.value);
    } else {
      return;
    }
    await save();
  });

  $('[data-clipboard]', view).addEventListener('click', async e => {
    if (!e.target.closest('[data-clear-clip]')) return;
    clipboard = null;
    await db.del('meta', 'planClipboard');
    render();
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

  // Pasting into an empty day just drops it in; into a day that already has work, ask first.
  async function pasteDay(day) {
    const copied = () => structuredClone(clipboard.blocks);
    const apply = async blocks => {
      plan.days[day] = blocks;
      await save();
      render();
      toast(`Pasted into ${DAY_NAMES[day]}`);
    };
    if (!plan.days[day].length) return apply(copied());
    openSheet({
      title: `Paste into ${DAY_NAMES[day]}`,
      body: `
        <p class="small muted">${DAY_NAMES[day]} already has ${plan.days[day].length} drill${plan.days[day].length === 1 ? '' : 's'}.</p>
        <button class="btn primary block" data-paste-add>Add to the end</button>
        <button class="btn ghost block" data-paste-replace>Replace what's there</button>`,
      onMount: (el, close) => {
        $('[data-paste-add]', el).addEventListener('click', async () => { close(); await apply([...plan.days[day], ...copied()]); });
        $('[data-paste-replace]', el).addEventListener('click', async () => {
          const previous = structuredClone(plan.days[day]);
          close();
          await apply(copied());
          toastAction(`Replaced ${DAY_NAMES[day]}`, 'Undo', async () => {
            plan.days[day] = previous;
            await save();
            render();
          });
        });
      },
    });
  }

  const CANCEL_REASONS = ['Client cancelled', 'Illness', 'Injury', 'Work', 'Travel', 'No-show', 'Coach cancelled'];

  function cancelDay(day) {
    const date = addDays(ws, day);
    openSheet({
      title: `${DAY_NAMES[day]} ${fmtDate(date, { month: 'short', day: 'numeric' })}`,
      body: `
        <p class="small muted">Mark this day as cancelled. It stays in their timeline, progress and recap, but doesn't count as a session. The plan is kept, so you can move it to another day.</p>
        <div class="chips">${CANCEL_REASONS.map(r => `<button class="chip-btn" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div>`,
      onMount: (el, close) => {
        el.addEventListener('click', async e => {
          const btn = e.target.closest('[data-reason]');
          if (!btn) return;
          const record = { id: uid(), clientId, date, cancelled: true, cancelReason: btn.dataset.reason, type: 'Cancelled', duration: 0, drills: [], ratings: {}, wentWell: '', workOn: '', privateNotes: '', createdAt: Date.now() };
          await db.put('sessions', record);
          sessions.push(record);
          cancelledDays.set(date, record);
          close();
          render();
          toast('Marked as cancelled');
        });
      },
    });
  }

  async function uncancelDay(day) {
    const date = addDays(ws, day);
    const record = cancelledDays.get(date);
    if (!record) return;
    await db.del('sessions', record.id);
    cancelledDays.delete(date);
    sessions.splice(sessions.findIndex(s => s.id === record.id), 1);
    render();
  }

  // Drag a drill by its grip to reorder it, or drop it on another day. Pointer events so it works
  // the same with a finger on the iPhone and a mouse on the laptop.
  // Drag a drill by its grip to reorder it, or drop it on another day. Pointer events tracked on the
  // window (not the handle) because iOS Safari doesn't always capture the touch to the handle itself.
  // A floating copy follows the finger so it's obvious what's being moved.
  function enableDrag(container) {
    container.addEventListener('pointerdown', e => {
      const grip = e.target.closest('[data-grip]');
      if (!grip || e.button > 0) return;
      e.preventDefault();

      const block = grip.closest('.block');
      const startBox = block.getBoundingClientRect();
      const startY = e.clientY;
      let moved = false;

      // The copy that follows the finger.
      const ghost = block.cloneNode(true);
      ghost.classList.add('ghost');
      Object.assign(ghost.style, {
        position: 'fixed', left: `${startBox.left}px`, top: `${startBox.top}px`,
        width: `${startBox.width}px`, margin: '0', pointerEvents: 'none', zIndex: '60',
      });
      document.body.append(ghost);
      block.classList.add('dragging');
      document.body.classList.add('dragging-block');

      const moveTo = y => { ghost.style.transform = `translateY(${y - startY}px)`; };
      moveTo(e.clientY);

      const move = ev => {
        ev.preventDefault();
        moved = true;
        const y = ev.clientY;
        moveTo(y);
        if (y < 100) window.scrollBy(0, -14);
        else if (y > window.innerHeight - 100) window.scrollBy(0, 14);

        const under = document.elementFromPoint(ev.clientX, Math.max(1, Math.min(y, window.innerHeight - 2)));
        if (!under) return;
        const overBlock = under.closest?.('.block');
        if (overBlock && overBlock !== block) {
          const box = overBlock.getBoundingClientRect();
          overBlock.parentElement.insertBefore(block, y < box.top + box.height / 2 ? overBlock : overBlock.nextSibling);
          return;
        }
        const overDay = under.closest?.('.day');
        if (overDay && !overDay.contains(block) && !overDay.classList.contains('cancelled')) overDay.append(block);
      };

      const finish = async () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        ghost.remove();
        block.classList.remove('dragging');
        document.body.classList.remove('dragging-block');
        if (!moved) return; // a tap on the grip changes nothing
        await saveOrder();
      };

      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    });
  }

  // Rebuild the week from the order now on screen.
  async function saveOrder() {
    const before = plan.days.map(day => [...day]);
    const rebuilt = emptyWeek();
    for (const section of $$('.day', view)) {
      for (const block of $$('.block', section)) {
        const [d, i] = at(block.dataset.ref);
        rebuilt[Number(section.dataset.day)].push(before[d][i]);
      }
    }
    plan.days = rebuilt;
    await save();
    render();
  }

  enableDrag($('[data-days]', view));

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

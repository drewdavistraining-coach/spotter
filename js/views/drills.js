// Drill library: the pool the week planner draws from.
import { db, uid } from '../db.js';
import { esc, $, $$, toast, weekStart } from '../util.js';
import { CATEGORIES, DEFAULT_SKILLS, LEVELS, LEVEL_SHORT, INTENSITY } from '../seed.js';
import { page, openSheet, catDot } from '../ui.js';

export async function drillsView() {
  const [drills, clients] = await Promise.all([db.all('drills'), db.all('clients')]);
  const skills = [...new Set([...DEFAULT_SKILLS, ...clients.flatMap(c => c.skills), ...drills.flatMap(d => d.skills)])];
  let cat = '';

  const view = page({
    title: 'Drills',
    action: '<button class="btn primary small" data-new>+ Drill</button>',
    body: `
      <input class="search" type="search" placeholder="Search ${drills.length} drills" data-q>
      <div class="chips scroll-x" data-cats><button class="chip-btn on" data-cat-filter="">All</button>${CATEGORIES.map(c => `<button class="chip-btn" data-cat-filter="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="list" data-list></div>`,
  });

  function render() {
    const q = $('[data-q]', view).value.trim().toLowerCase();
    const shown = drills
      .filter(d => (!cat || d.category === cat) && (d.name.toLowerCase().includes(q) || d.skills.some(s => s.toLowerCase().includes(q))))
      .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
    $('[data-list]', view).innerHTML = shown.map(d => `
      <div class="card drill-row" data-id="${d.id}">
        ${catDot(d.category)}
        <div class="grow" data-edit>
          <div data-name>${esc(d.name)}</div>
          <div class="muted small">${LEVEL_SHORT[d.level || 1]} · ${INTENSITY[d.intensity || 2]} · ${esc(d.dose)}</div>
        </div>
        <button type="button" class="icon-btn small" data-rename aria-label="Rename ${esc(d.name)}" title="Rename">✎</button>
      </div>`).join('') || '<div class="muted small">No drills match.</div>';
  }
  render();

  // Renaming updates the library plus this week's and future plans. Past sessions keep the name they were logged with.
  async function renameDrill(drill, name) {
    if (!name || name === drill.name) return false;
    drill.name = name;
    await db.put('drills', drill);
    const thisWeek = weekStart();
    for (const plan of await db.all('plans')) {
      if (plan.weekStart < thisWeek) continue;
      const blocks = plan.days.flat().filter(b => b.drillId === drill.id);
      if (!blocks.length) continue;
      blocks.forEach(b => { b.name = name; });
      await db.put('plans', plan);
    }
    return true;
  }

  function startRename(row) {
    const drill = drills.find(d => d.id === row.dataset.id);
    const nameEl = $('[data-name]', row);
    nameEl.innerHTML = `<input class="rename" value="${esc(drill.name)}" enterkeyhint="done" aria-label="Drill name">`;
    const input = $('input', nameEl);
    input.focus();
    input.select();
    let done = false;
    const finish = async save => {
      if (done) return;
      done = true;
      if (save && await renameDrill(drill, input.value.trim())) toast('Renamed');
      render();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  $('[data-q]', view).addEventListener('input', render);
  $('[data-cats]', view).addEventListener('click', e => {
    const b = e.target.closest('[data-cat-filter]');
    if (!b) return;
    cat = b.dataset.catFilter;
    $$('[data-cat-filter]', view).forEach(x => x.classList.toggle('on', x === b));
    render();
  });
  $('[data-list]', view).addEventListener('click', e => {
    const row = e.target.closest('[data-id]');
    if (!row || e.target.closest('input')) return;
    if (e.target.closest('[data-rename]')) startRename(row);
    else if (e.target.closest('[data-edit]')) edit(drills.find(d => d.id === row.dataset.id));
  });
  $('[data-new]').addEventListener('click', () => edit(null));

  function edit(drill) {
    const d = drill || { id: uid(), name: '', category: cat || CATEGORIES[1], skills: [], dose: '', notes: '' };
    openSheet({
      title: drill ? 'Edit drill' : 'New drill',
      body: `
        <form class="stack" data-form>
          <label class="field"><span>Name</span><input name="name" required value="${esc(d.name)}"></label>
          <div class="grid-2">
            <label class="field"><span>Category</span><select name="category">${CATEGORIES.map(c => `<option ${c === d.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
            <label class="field"><span>Default dose</span><input name="dose" value="${esc(d.dose)}" placeholder="4 x 3 min"></label>
          </div>
          <div class="grid-2">
            <label class="field"><span>Level</span><select name="level">${[1, 2, 3].map(n => `<option value="${n}" ${(d.level || 1) === n ? 'selected' : ''}>${LEVELS[n]}</option>`).join('')}</select></label>
            <label class="field"><span>Intensity</span><select name="intensity">${[1, 2, 3].map(n => `<option value="${n}" ${(d.intensity || 2) === n ? 'selected' : ''}>${INTENSITY[n]}</option>`).join('')}</select></label>
          </div>
          <fieldset class="field"><span>Skills it trains</span>
            <div class="chips">${skills.map(s => `<label class="chip"><input type="checkbox" name="skills" value="${esc(s)}" ${d.skills.includes(s) ? 'checked' : ''}><span>${esc(s)}</span></label>`).join('')}</div>
          </fieldset>
          <label class="field"><span>Coaching cues</span><textarea name="notes" rows="3">${esc(d.notes)}</textarea></label>
          <button class="btn primary block">Save drill</button>
          ${drill ? '<button type="button" class="btn danger block" data-del>Delete drill</button>' : ''}
        </form>`,
      onMount: (el, close) => {
        $('[data-form]', el).addEventListener('submit', async e => {
          e.preventDefault();
          const f = new FormData(e.target);
          if (drill) await renameDrill(drill, f.get('name').trim());
          Object.assign(d, { name: f.get('name').trim(), category: f.get('category'), dose: f.get('dose').trim(), level: Number(f.get('level')), intensity: Number(f.get('intensity')), skills: f.getAll('skills'), notes: f.get('notes').trim() });
          await db.put('drills', d);
          if (!drill) drills.push(d);
          close();
          render();
          toast('Drill saved');
        });
        $('[data-del]', el)?.addEventListener('click', async () => {
          if (!confirm(`Delete "${d.name}"? Existing plans keep their copy.`)) return;
          await db.del('drills', d.id);
          drills.splice(drills.indexOf(drill), 1);
          close();
          render();
        });
      },
    });
  }
}

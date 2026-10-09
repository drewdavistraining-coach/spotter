// Weekly curriculum engine.
//
// Each client runs a repeating 4-week block: Learn -> Build -> Apply -> Test & recover.
// Every block puts one of their combat disciplines up front (the "theme") and the theme
// rotates block to block, so a long-term client cycles through everything they train instead
// of drifting into whatever Drew is personally training. Drills are filtered by the client's level
// in that discipline, matched to the phase's intensity, and weighted toward drills they haven't
// seen lately and skills that are rating low.
//
// A plan is one client's week: { id, clientId, weekStart, phase, theme, days: [[block, ...] x7], notes }
// Blocks snapshot the drill's name/category/dose so old plans survive library edits.
import { shuffle, parseDate, weekStart, isoDate, addDays, average, topSet } from './util.js';
import { lastSetsFor } from './progress.js';
import { COMBAT, CONDITIONING, DISCIPLINES, DISCIPLINE_SKILLS } from './seed.js';

export const PHASES = [
  { name: 'Learn', intensity: 1, blurb: 'New technique, clean reps, low intensity.' },
  { name: 'Build', intensity: 2, blurb: 'More volume, combinations and partner pressure.' },
  { name: 'Apply', intensity: 3, blurb: 'Pressure-test it: live and situational rounds.' },
  { name: 'Test & recover', intensity: 1, blurb: 'Lighter week. Rate every skill so the next block adapts.' },
];

export function programFor(client) {
  const p = client.program || {};
  return {
    levels: p.levels || {},
    days: p.days || [0, 2, 4],
    start: p.start || weekStart(client.createdAt ? isoDate(new Date(client.createdAt)) : isoDate()),
  };
}

export function activeDisciplines(client) {
  const { levels } = programFor(client);
  return DISCIPLINES.filter(d => levels[d] > 0);
}

const weeksBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / (7 * 86400000));

export function cycleInfo(client, ws) {
  const program = programFor(client);
  const weekIndex = Math.max(0, weeksBetween(weekStart(program.start), ws));
  const block = Math.floor(weekIndex / 4);
  const phaseIndex = weekIndex % 4;
  const combat = COMBAT.filter(d => program.levels[d] > 0);
  const conditioning = CONDITIONING.filter(d => program.levels[d] > 0);
  const pool = combat.length ? combat : conditioning;
  return {
    program, weekIndex, phaseIndex, combat, conditioning,
    block: block + 1,
    phase: PHASES[phaseIndex],
    theme: pool.length ? pool[block % pool.length] : null,
  };
}

export function emptyWeek() {
  return Array.from({ length: 7 }, () => []);
}

export function blockFrom(drill) {
  return { drillId: drill.id, name: drill.name, category: drill.category, dose: drill.dose || '' };
}

export function drillIdsIn(plan) {
  return new Set((plan?.days || []).flat().map(b => b.drillId).filter(Boolean));
}

// drillId -> most recent weekStart it appeared in, before this week.
function lastUsed(plans, ws) {
  const map = new Map();
  for (const plan of plans) {
    if (plan.weekStart >= ws) continue;
    for (const id of drillIdsIn(plan)) {
      if (!map.has(id) || map.get(id) < plan.weekStart) map.set(id, plan.weekStart);
    }
  }
  return map;
}

// Stable randomness: the same block always makes the same choices, so rebuilding a week doesn't
// reshuffle the drills he's been teaching.
function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The drills this block is actually about: chosen once per block and taught through all four weeks.
// This is what stops every week looking like a reshuffle of the library.
export function blockCore({ client, drills, info, focusSkills = [] }) {
  const { theme, conditioning, program, block } = info;
  if (!theme) return [];
  const random = seededRandom(seedFrom(`${client.id}:${block}:${theme}`));

  const bestOf = (category, { teachable = true } = {}) => {
    const level = program.levels[category] ?? 3;
    const candidates = drills.filter(d =>
      d.category === category
      && (d.level || 1) <= Math.max(level, 1)
      && (!teachable || (d.intensity || 2) <= 2)); // you can't build a block around live rounds
    if (!candidates.length) return null;
    return candidates
      .map(d => ({
        d,
        score: random()
          + (d.skills || []).filter(s => focusSkills.includes(s)).length * 2
          + ((d.level || 1) === level ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score)[0].d;
  };

  const core = [];
  const first = bestOf(theme);
  if (first) core.push(first);
  const second = drills.filter(d => d.category === theme && d.id !== first?.id).length ? bestOf(theme) : null;
  if (second && second.id !== first?.id) core.push(second);
  // One strength lift stays put too, so weights have something to climb.
  if (conditioning.includes('Strength')) {
    const lift = bestOf('Strength');
    if (lift) core.push(lift);
  }
  return core;
}

// Dose grows through the block: the same drill, more of it.
export function progressDose(dose, phaseIndex) {
  const match = String(dose || '').match(/^(\d+)(\s*[x×]\s*)(.+)$/);
  if (!match) return dose || '';
  const base = Number(match[1]);
  const bump = [0, 1, 2, -1][phaseIndex];
  return `${Math.max(2, base + bump)}${match[2]}${match[3]}`;
}

// Weights climb too, from what he actually lifted last time.
export function progressSets(lastSets, phaseIndex, unit = 'lb') {
  if (!lastSets?.length) return null;
  const step = unit === 'kg' ? 2.5 : 5;
  const bump = [0, step, step * 2, -step][phaseIndex];
  return lastSets.map(set => ({
    weight: Number(set.weight) > 0 ? Math.max(step, Number(set.weight) + bump) : set.weight,
    reps: set.reps,
  }));
}

function slotsFor(phaseIndex, { theme, second, sc, live }) {
  const s = [
    ['core', 'core', 'Warm-up', second, sc, 'Mobility'],
    ['core', 'core', 'Warm-up', second, sc, 'Mobility'],
    ['core', live, 'Warm-up', second, sc, 'Mobility'],
    ['core', 'core', 'Warm-up', sc, 'Mobility'], // lighter week, but the core lift still gets touched
  ][phaseIndex];
  return s.filter(Boolean);
}

export function autoBuildWeek({ client, drills, plans, ws, trainingDays, focusSkills = [], sessions = [], unit = 'lb' }) {
  const info = cycleInfo(client, ws);
  const { phase, phaseIndex, theme, combat, conditioning, program } = info;
  const days = emptyWeek();
  if (!theme) return { days, info: { ...info, core: [], rationale: [] } };

  const history = lastUsed(plans, ws);
  const used = new Set();
  const others = combat.filter(d => d !== theme);
  const core = blockCore({ client, drills, info, focusSkills });
  core.forEach(d => used.add(d.id));
  const techniques = core.filter(d => d.category === theme);
  const coreLift = core.find(d => d.category === 'Strength');

  const pick = (category, targetIntensity) => {
    const clientLevel = program.levels[category] ?? 3; // warm-up & mobility are open to everyone
    const candidates = drills.filter(d => d.category === category && !used.has(d.id) && (d.level || 1) <= Math.max(clientLevel, 1));
    if (!candidates.length) return null;
    const scored = shuffle(candidates).map(d => {
      const since = history.has(d.id) ? weeksBetween(history.get(d.id), ws) : Infinity;
      const novelty = since === Infinity ? 2 : since <= 1 ? -3 : since === 2 ? -1.5 : since === 3 ? -0.5 : 1;
      const focusHits = (d.skills || []).filter(s => focusSkills.includes(s)).length;
      const levelFit = (d.level || 1) === clientLevel ? 1.5 : 0;
      // Going harder than the phase calls for costs more than going easier.
      const gap = (d.intensity || 2) - targetIntensity;
      const intensityFit = gap > 0 ? -gap * 3 : gap * 1.2;
      return { d, score: Math.random() + novelty + focusHits * 1.2 + levelFit + intensityFit };
    });
    scored.sort((a, b) => b.score - a.score);
    used.add(scored[0].d.id);
    return scored[0].d;
  };

  // A core drill keeps its place in the week, with this phase's dose and load.
  const coreBlock = (drill, index) => {
    const block = blockFrom(drill);
    block.dose = progressDose(drill.dose, phaseIndex);
    block.core = true;
    const sets = progressSets(lastSetsFor(sessions, { drillId: drill.id, name: drill.name })?.sets, phaseIndex, unit);
    if (sets) block.sets = sets;
    return block;
  };

  trainingDays.forEach((dayIndex, n) => {
    const slots = slotsFor(phaseIndex, {
      theme,
      second: others.length ? others[(info.block + n) % others.length] : theme,
      sc: conditioning.length ? conditioning[n % conditioning.length] : null,
      live: combat.includes('MMA') && program.levels.MMA >= 2 && n % 2 ? 'MMA' : theme,
    });
    let coreSlot = 0;
    slots.forEach((category, i) => {
      if (category === 'core') {
        // Rotate which core leads, so three sessions a week aren't identical.
        const drill = techniques[(n + coreSlot++) % Math.max(techniques.length, 1)];
        if (drill) days[dayIndex].push(coreBlock(drill, i));
        return;
      }
      // The strength slot is the block's core lift, so the weights have somewhere to climb.
      if (coreLift && category === coreLift.category) {
        days[dayIndex].push(coreBlock(coreLift, i));
        return;
      }
      // The "live" slot in Apply week aims for intensity 3; everything else follows the phase.
      const target = phaseIndex === 2 && i === 1 ? 3 : phase.intensity;
      const drill = pick(category, target);
      if (drill) days[dayIndex].push(blockFrom(drill));
    });
  });

  return { days, info: { ...info, core, rationale: rationaleFor({ info, core, focusSkills }) } };
}

// Why this week looks the way it does — shown on the plan screen so it isn't a black box.
export function rationaleFor({ info, core, focusSkills = [] }) {
  if (!core?.length) return [];
  const list = names => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]);
  const lower = text => text.charAt(0).toLowerCase() + text.slice(1);
  // Only claim the core addresses a weak skill when those drills actually train it.
  const covered = focusSkills.filter(skill => core.some(d => (d.skills || []).includes(skill)));
  const uncovered = focusSkills.filter(skill => !covered.includes(skill));
  const lines = [`Block ${info.block} runs on ${list(core.map(d => d.name))} — the same drills all four weeks, more of them each week.`];
  // "Hands is rating lowest" reads wrong; skill names that sound plural take "are".
  const verb = names => (names.length > 1 || /s$/i.test(names[0]) ? 'are' : 'is');
  lines.push(covered.length
    ? `Chosen because ${list(covered).toLowerCase()} ${verb(covered)} rating lowest.`
    : `Chosen for this block's ${info.theme} focus.`);
  if (uncovered.length) lines.push(`${list(uncovered)} ${verb(uncovered)} also rating low — the rotating slots lean that way.`);
  lines.push(`This is the ${info.phase.name} week: ${lower(info.phase.blurb)} Everything else rotates for variety.`);
  return lines;
}

export function varietyReport(plan, plans, drills, focusSkills = []) {
  const blocks = (plan?.days || []).flat();
  const categories = {};
  for (const b of blocks) categories[b.category] = (categories[b.category] || 0) + 1;
  const recent = new Set(plans.filter(p => p.weekStart < plan.weekStart && p.weekStart >= addDays(plan.weekStart, -14)).flatMap(p => [...drillIdsIn(p)]));
  const repeats = blocks.filter(b => b.drillId && recent.has(b.drillId)).length;
  const skillsHit = new Set(blocks.flatMap(b => drills.find(d => d.id === b.drillId)?.skills || []));
  return {
    total: blocks.length,
    categories,
    repeats,
    focusCovered: focusSkills.filter(s => skillsHit.has(s)),
  };
}

// Disciplines where the related skills have averaged 4+ over the last four weeks.
export function levelUpSuggestions(client, sessions) {
  const { levels } = programFor(client);
  const since = addDays(isoDate(), -28);
  const recent = sessions.filter(s => s.date >= since);
  return DISCIPLINES.filter(d => levels[d] > 0 && levels[d] < 3).flatMap(d => {
    const skills = DISCIPLINE_SKILLS[d] || [];
    const rated = k => recent.map(s => s.ratings?.[k]).filter(v => typeof v === 'number');
    if (rated(skills[0]).length < 3) return []; // the discipline's main skill needs real evidence
    const avg = average(skills.flatMap(rated));
    return avg >= 4 ? [{ discipline: d, avg, level: levels[d] }] : [];
  });
}

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
import { shuffle, parseDate, weekStart, isoDate, addDays, average } from './util.js';
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

function slotsFor(phaseIndex, { theme, second, sc, live }) {
  const s = [
    ['Warm-up', theme, theme, second, sc, 'Mobility'],
    ['Warm-up', theme, second, theme, sc, 'Mobility'],
    ['Warm-up', theme, live, second, sc, 'Mobility'],
    ['Warm-up', theme, second, 'Mobility'],
  ][phaseIndex];
  return s.filter(Boolean);
}

export function autoBuildWeek({ client, drills, plans, ws, trainingDays, focusSkills = [] }) {
  const info = cycleInfo(client, ws);
  const { phase, phaseIndex, theme, combat, conditioning, program } = info;
  const days = emptyWeek();
  if (!theme) return { days, info };

  const history = lastUsed(plans, ws);
  const used = new Set();
  const others = combat.filter(d => d !== theme);

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

  trainingDays.forEach((dayIndex, n) => {
    const slots = slotsFor(phaseIndex, {
      theme,
      second: others.length ? others[(info.block + n) % others.length] : theme,
      sc: conditioning.length ? conditioning[n % conditioning.length] : null,
      live: combat.includes('MMA') && program.levels.MMA >= 2 && n % 2 ? 'MMA' : theme,
    });
    slots.forEach((category, i) => {
      // The "live" slot in Apply week aims for intensity 3; everything else follows the phase.
      const target = phaseIndex === 2 && i === 2 ? 3 : phase.intensity;
      const drill = pick(category, target);
      if (drill) days[dayIndex].push(blockFrom(drill));
    });
  });
  return { days, info };
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

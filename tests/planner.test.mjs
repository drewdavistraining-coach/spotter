import test from 'node:test';
import assert from 'node:assert/strict';
import { programFor, cycleInfo, autoBuildWeek, varietyReport, emptyWeek, levelUpSuggestions, PHASES } from '../js/planner.js';
import { seedDrills } from '../js/seed.js';
import { client, session, thisMonday, daysAgo } from './helpers.mjs';
import { addDays } from '../js/util.js';

let n = 0;
const drills = seedDrills(() => `seed-${++n}`);

test('a client with no program set still reads safely', () => {
  const program = programFor({ id: 'x', name: 'No Program', createdAt: Date.now() });
  assert.deepEqual(program.levels, {});
  assert.deepEqual(program.days, [0, 2, 4]);
  assert.ok(program.start);
});

test('the 4-week block cycles Learn, Build, Apply, Test & recover', () => {
  const c = client({ program: { levels: { Boxing: 2 }, days: [0, 2], start: thisMonday } });
  const phases = [0, 1, 2, 3, 4].map(week => cycleInfo(c, addDays(thisMonday, 7 * week)).phase.name);
  assert.deepEqual(phases, ['Learn', 'Build', 'Apply', 'Test & recover', 'Learn']);
  assert.equal(PHASES.length, 4);
});

test('the discipline in focus rotates block to block', () => {
  const c = client({ program: { levels: { Boxing: 2, 'Jiu Jitsu': 2, Wrestling: 2 }, days: [0], start: thisMonday } });
  const themes = [0, 4, 8, 12].map(week => cycleInfo(c, addDays(thisMonday, 7 * week)).theme);
  assert.deepEqual(themes, ['Boxing', 'Jiu Jitsu', 'Wrestling', 'Boxing']);
});

test('auto-build never picks a drill above the client.s level', () => {
  const c = client({ program: { levels: { Boxing: 1, Strength: 1 }, days: [0, 2, 4], start: thisMonday } });
  const { days } = autoBuildWeek({ client: c, drills, plans: [], ws: thisMonday, trainingDays: [0, 2, 4] });
  const byId = Object.fromEntries(drills.map(d => [d.id, d]));
  for (const block of days.flat()) {
    const level = c.program.levels[block.category];
    if (level === undefined) continue; // warm-ups and mobility are open to everyone
    assert.ok((byId[block.drillId].level || 1) <= level, `${block.name} is above their level`);
  }
});

test('auto-build only fills the days it is given, and fills each of them', () => {
  const c = client();
  const { days } = autoBuildWeek({ client: c, drills, plans: [], ws: thisMonday, trainingDays: [1, 3] });
  assert.equal(days[0].length, 0);
  assert.ok(days[1].length > 0);
  assert.equal(days[2].length, 0);
  assert.ok(days[3].length > 0);
});

test('live rounds belong to the Apply week, not the Learn week', () => {
  const c = client({ program: { levels: { Boxing: 3 }, days: [0, 2, 4], start: thisMonday } });
  const byId = Object.fromEntries(drills.map(d => [d.id, d]));
  const liveCount = ws => autoBuildWeek({ client: c, drills, plans: [], ws, trainingDays: [0, 2, 4] })
    .days.flat().filter(b => byId[b.drillId]?.intensity === 3).length;
  assert.equal(liveCount(thisMonday), 0, 'no live work in a Learn week');
  assert.ok(liveCount(addDays(thisMonday, 14)) > 0, 'Apply week should include live work');
});

test('auto-build avoids what they did last week', () => {
  const c = client({ program: { levels: { Boxing: 3, Strength: 3 }, days: [0, 2, 4], start: thisMonday } });
  const lastWeekStart = addDays(thisMonday, -7);
  const lastWeek = { clientId: c.id, weekStart: lastWeekStart, days: autoBuildWeek({ client: c, drills, plans: [], ws: lastWeekStart, trainingDays: [0, 2, 4] }).days };
  const lastIds = new Set(lastWeek.days.flat().map(b => b.drillId));
  const { days } = autoBuildWeek({ client: c, drills, plans: [lastWeek], ws: thisMonday, trainingDays: [0, 2, 4] });
  const repeats = days.flat().filter(b => lastIds.has(b.drillId)).length;
  assert.ok(repeats <= days.flat().length / 3, `too many repeats from last week: ${repeats}`);
});

test('a client with no disciplines set gets an empty week, not a crash', () => {
  const c = client({ program: { levels: {}, days: [0], start: thisMonday } });
  const { days, info } = autoBuildWeek({ client: c, drills, plans: [], ws: thisMonday, trainingDays: [0] });
  assert.equal(info.theme, null);
  assert.deepEqual(days, emptyWeek());
});

test('the variety report counts categories and flags recent repeats', () => {
  const plan = { weekStart: thisMonday, days: emptyWeek() };
  const squat = drills.find(d => d.category === 'Strength');
  const jab = drills.find(d => d.category === 'Boxing');
  plan.days[0] = [{ drillId: squat.id, name: squat.name, category: 'Strength' }, { drillId: jab.id, name: jab.name, category: 'Boxing' }];
  const lastWeek = { weekStart: addDays(thisMonday, -7), days: emptyWeek() };
  lastWeek.days[0] = [{ drillId: squat.id, name: squat.name, category: 'Strength' }];
  const report = varietyReport(plan, [lastWeek], drills, squat.skills);
  assert.equal(report.total, 2);
  assert.equal(report.repeats, 1);
  assert.deepEqual(report.categories, { Strength: 1, Boxing: 1 });
  assert.ok(report.focusCovered.length > 0);
});

test('moving up a level needs evidence in that discipline, not just a related skill', () => {
  const c = client({ skills: ['Hands', 'Defense', 'Kicks & knees', 'Clinch'], program: { levels: { Boxing: 1, 'Muay Thai': 1 }, days: [0], start: thisMonday } });
  // Defense is rated well, but Muay Thai's main skill (kicks) has never been rated.
  const sessions = [3, 6, 9].map(d => session({ date: daysAgo(d), ratings: { Hands: 5, Defense: 5 } }));
  const suggestions = levelUpSuggestions(c, sessions).map(s => s.discipline);
  assert.deepEqual(suggestions, ['Boxing']);
});

test('level-up suggestions ignore ratings older than a month', () => {
  const c = client({ skills: ['Hands', 'Defense'], program: { levels: { Boxing: 1 }, days: [0], start: thisMonday } });
  const stale = [40, 50, 60].map(d => session({ date: daysAgo(d), ratings: { Hands: 5, Defense: 5 } }));
  assert.deepEqual(levelUpSuggestions(c, stale), []);
});

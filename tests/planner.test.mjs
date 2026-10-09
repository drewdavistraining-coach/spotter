import test from 'node:test';
import assert from 'node:assert/strict';
import { programFor, cycleInfo, autoBuildWeek, varietyReport, emptyWeek, levelUpSuggestions, progressDose, progressSets, PHASES } from '../js/planner.js';
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

test('the same core drills carry through all four weeks of a block', () => {
  const c = client({ program: { levels: { Boxing: 3, Strength: 3 }, days: [0, 2, 4], start: thisMonday } });
  const coreNames = week => {
    const { days } = autoBuildWeek({ client: c, drills, plans: [], ws: week, trainingDays: [0, 2, 4] });
    return [...new Set(days.flat().filter(b => b.core).map(b => b.name))].sort();
  };
  const learn = coreNames(thisMonday);
  assert.ok(learn.length >= 2, 'a block should have at least two core drills');
  assert.deepEqual(coreNames(addDays(thisMonday, 7)), learn, 'Build week keeps them');
  assert.deepEqual(coreNames(addDays(thisMonday, 14)), learn, 'Apply week keeps them');
  assert.deepEqual(coreNames(addDays(thisMonday, 21)), learn, 'Test week keeps them');
});

test('the next block moves on to different core drills', () => {
  const c = client({ program: { levels: { Boxing: 3, Strength: 3 }, days: [0, 2, 4], start: thisMonday } });
  const core = week => autoBuildWeek({ client: c, drills, plans: [], ws: week, trainingDays: [0, 2, 4] })
    .info.core.map(d => d.name).sort();
  assert.notDeepEqual(core(addDays(thisMonday, 28)), core(thisMonday));
});

test('rebuilding the same week gives the same core, not a reshuffle', () => {
  const c = client({ program: { levels: { Boxing: 3 }, days: [0, 2], start: thisMonday } });
  const once = autoBuildWeek({ client: c, drills, plans: [], ws: thisMonday, trainingDays: [0, 2] }).info.core.map(d => d.id);
  const twice = autoBuildWeek({ client: c, drills, plans: [], ws: thisMonday, trainingDays: [0, 2] }).info.core.map(d => d.id);
  assert.deepEqual(twice, once);
});

test('the drills around the core still rotate week to week', () => {
  const c = client({ program: { levels: { Boxing: 3, Strength: 3 }, days: [0, 2, 4], start: thisMonday } });
  const accessories = (week, plans) => {
    const { days } = autoBuildWeek({ client: c, drills, plans, ws: week, trainingDays: [0, 2, 4] });
    return { ids: days.flat().filter(b => !b.core).map(b => b.drillId), days };
  };
  const first = accessories(thisMonday, []);
  const lastWeekPlan = { clientId: c.id, weekStart: thisMonday, days: first.days };
  const second = accessories(addDays(thisMonday, 7), [lastWeekPlan]);
  const repeated = second.ids.filter(id => first.ids.includes(id)).length;
  assert.ok(repeated <= second.ids.length / 2, `accessories repeated too much: ${repeated}/${second.ids.length}`);
});

test('dose grows through the block, then eases off in the test week', () => {
  assert.equal(progressDose('4 x 3 min', 0), '4 x 3 min');   // Learn
  assert.equal(progressDose('4 x 3 min', 1), '5 x 3 min');   // Build
  assert.equal(progressDose('4 x 3 min', 2), '6 x 3 min');   // Apply
  assert.equal(progressDose('4 x 3 min', 3), '3 x 3 min');   // Test & recover
  assert.equal(progressDose('2 x 3 min', 3), '2 x 3 min', 'never drops below two');
  assert.equal(progressDose('10 min', 1), '10 min', 'a dose with no set count is left alone');
  assert.equal(progressDose(undefined, 1), '');
});

test('weights climb from what he actually lifted, and deload in the test week', () => {
  const last = [{ weight: 135, reps: 5 }, { weight: 155, reps: 5 }];
  assert.deepEqual(progressSets(last, 0, 'lb').map(s => s.weight), [135, 155]);
  assert.deepEqual(progressSets(last, 1, 'lb').map(s => s.weight), [140, 160]);
  assert.deepEqual(progressSets(last, 2, 'lb').map(s => s.weight), [145, 165]);
  assert.deepEqual(progressSets(last, 3, 'lb').map(s => s.weight), [130, 150]);
  assert.deepEqual(progressSets(last, 1, 'kg').map(s => s.weight), [137.5, 157.5]);
  assert.equal(progressSets([], 1), null);
});

test('a core lift is prescribed with the weights he last used, moved on', () => {
  const c = client({ program: { levels: { Boxing: 2, Strength: 2 }, days: [0], start: thisMonday } });
  const coreLift = autoBuildWeek({ client: c, drills, plans: [], ws: thisMonday, trainingDays: [0] })
    .info.core.find(d => d.category === 'Strength');
  const history = [session({
    date: daysAgo(7),
    drills: [{ drillId: coreLift.id, name: coreLift.name, category: 'Strength', sets: [{ weight: 135, reps: 5 }] }],
  })];
  const build = autoBuildWeek({
    client: c, drills, plans: [], ws: addDays(thisMonday, 7), trainingDays: [0], sessions: history,
  });
  const block = build.days.flat().find(b => b.drillId === coreLift.id);
  assert.deepEqual(block.sets, [{ weight: 140, reps: 5 }], 'Build week adds a step to last week"s weight');
});

test('the week explains itself', () => {
  const c = client({ program: { levels: { Boxing: 2 }, days: [0, 2], start: thisMonday } });
  const { info } = autoBuildWeek({ client: c, drills, plans: [], ws: thisMonday, trainingDays: [0, 2], focusSkills: ['Defense'] });
  assert.ok(info.rationale.length >= 2);
  assert.match(info.rationale[0], /Block 1 runs on /);
  assert.match(info.rationale.join(' '), /defense/i);
});

test('the explanation reads as English for plural and singular skill names', () => {
  const c = client({ program: { levels: { Boxing: 2 }, days: [0], start: thisMonday } });
  const why = skills => autoBuildWeek({ client: c, drills, plans: [], ws: thisMonday, trainingDays: [0], focusSkills: skills })
    .info.rationale.join(' ');
  assert.ok(!/hands is/i.test(why(['Hands'])), '"hands is" reads wrong');
  assert.ok(!/defense are/i.test(why(['Defense'])), '"defense are" reads wrong');
});

test("it only credits the core with weak skills those drills actually train", () => {
  const c = client({ program: { levels: { Boxing: 2 }, days: [0], start: thisMonday } });
  // Takedowns can't be the reason for a boxing block's core drills.
  const { info } = autoBuildWeek({ client: c, drills, plans: [], ws: thisMonday, trainingDays: [0], focusSkills: ['Takedowns'] });
  const why = info.rationale.join(' ');
  assert.ok(!/Chosen because takedowns/i.test(why), 'should not claim boxing drills were chosen for takedowns');
  assert.match(why, /rotating slots lean that way/);
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

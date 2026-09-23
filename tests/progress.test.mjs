import test from 'node:test';
import assert from 'node:assert/strict';
import { attended, cancelled, weeklyCounts, skillSeries, trend, focusAreas, skillSummary, weightHistory, lastSetsFor } from '../js/progress.js';
import { client, session, cancelledDay, lift, daysAgo, weeksAgo, today } from './helpers.mjs';

test('a cancelled day is kept, but never counts as training', () => {
  const sessions = [session({ date: daysAgo(2) }), cancelledDay(daysAgo(1)), session({ date: today })];
  assert.equal(attended(sessions).length, 2);
  assert.equal(cancelled(sessions).length, 1);
});

test('weekly counts separate training from cancellations', () => {
  const sessions = [
    session({ date: weeksAgo(0) }),
    session({ date: weeksAgo(0) }),
    cancelledDay(weeksAgo(0)),
    session({ date: weeksAgo(1) }),
  ];
  const weeks = weeklyCounts(sessions, 8);
  assert.equal(weeks.length, 8);
  assert.deepEqual(weeks.at(-1), { start: weeksAgo(0), count: 2, cancelled: 1 });
  assert.equal(weeks.at(-2).count, 1);
});

test('skill ratings build a series in date order, oldest first', () => {
  const sessions = [
    session({ date: daysAgo(1), ratings: { Hands: 4 } }),
    session({ date: daysAgo(10), ratings: { Hands: 2 } }),
    session({ date: daysAgo(5), ratings: { Defense: 3 } }),
  ];
  assert.deepEqual(skillSeries(sessions, 'Hands').map(p => p.value), [2, 4]);
});

test('trend compares the latest ratings with the ones before them', () => {
  const rising = [1, 1, 1, 4, 4, 4].map(value => ({ date: today, value }));
  const falling = [5, 5, 5, 2, 2, 2].map(value => ({ date: today, value }));
  assert.ok(trend(rising) > 0);
  assert.ok(trend(falling) < 0);
  assert.equal(trend([{ date: today, value: 3 }]), 0);
});

test('areas to sharpen pick the weakest skills, and skip ones already sharp', () => {
  const c = client({ skills: ['Hands', 'Defense', 'Cardio'] });
  const sessions = [1, 2, 3].map(() => session({ ratings: { Hands: 5, Defense: 2, Cardio: 4 } }));
  const focus = focusAreas(c, sessions).map(f => f.skill);
  assert.equal(focus[0], 'Defense');
  assert.ok(!focus.includes('Hands'), 'a 5.0 skill is not an area to sharpen');
});

test('a client with no rating categories does not break the summary', () => {
  const bare = client({ skills: undefined });
  assert.deepEqual(skillSummary(bare, [session()]), []);
  assert.deepEqual(focusAreas(bare, [session()]), []);
});

test('weight history groups by drill and records the top set each time', () => {
  const sessions = [
    session({ date: daysAgo(14), drills: [lift('Front squat', [{ weight: 135, reps: 5 }])] }),
    session({ date: daysAgo(7), drills: [lift('Front squat', [{ weight: 155, reps: 5 }, { weight: 175, reps: 3 }])] }),
  ];
  const history = weightHistory(sessions);
  const entries = history.get('drill-Front squat');
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.at(-1).top, { weight: 175, reps: 3 });
  assert.equal(entries.at(-1).volume, 155 * 5 + 175 * 3);
});

test('weight history ignores cancelled days', () => {
  const sessions = [
    session({ date: daysAgo(3), drills: [lift('Front squat', [{ weight: 135, reps: 5 }])] }),
    { ...cancelledDay(daysAgo(1)), drills: [lift('Front squat', [{ weight: 999, reps: 1 }])] },
  ];
  assert.equal(weightHistory(sessions).get('drill-Front squat').length, 1);
});

test('last sets are what that client actually did last time', () => {
  const sessions = [
    session({ date: daysAgo(14), drills: [lift('Front squat', [{ weight: 135, reps: 5 }])] }),
    session({ date: daysAgo(7), drills: [lift('Front squat', [{ weight: 155, reps: 5 }])] }),
  ];
  assert.equal(lastSetsFor(sessions, { drillId: 'drill-Front squat', name: 'Front squat' }).sets[0].weight, 155);
  assert.equal(lastSetsFor(sessions, { drillId: 'drill-Nothing', name: 'Nothing' }), null);
});

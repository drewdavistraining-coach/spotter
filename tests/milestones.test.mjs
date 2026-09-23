import test from 'node:test';
import assert from 'node:assert/strict';
import { milestonesFor, milestonesInRange, newlyEarned } from '../js/milestones.js';
import { client, session, cancelledDay, lift, daysAgo, weeksAgo, today } from './helpers.mjs';
import { addDays, isoDate, parseDate } from '../js/util.js';

const titles = list => list.map(m => m.title);

test('session counts are marked at the first, then the round numbers', () => {
  const c = client();
  const sessions = Array.from({ length: 25 }, (_, i) => session({ date: daysAgo(100 - i) }));
  const marks = titles(milestonesFor({ client: c, sessions }));
  assert.ok(marks.includes('First session'));
  assert.ok(marks.includes('5 sessions together'));
  assert.ok(marks.includes('10 sessions together'));
  assert.ok(marks.includes('25 sessions together'));
  assert.ok(!marks.includes('50 sessions together'));
});

test('cancelled days do not count toward session milestones', () => {
  const c = client();
  const sessions = [
    ...Array.from({ length: 4 }, (_, i) => session({ date: daysAgo(20 - i) })),
    cancelledDay(daysAgo(10)),
  ];
  assert.ok(!titles(milestonesFor({ client: c, sessions })).includes('5 sessions together'));
});

test('only the standing record counts as a PR, not every increase', () => {
  const c = client();
  const sessions = [135, 145, 155, 165].map((weight, i) =>
    session({ date: daysAgo(40 - i * 7), drills: [lift('Front squat', [{ weight, reps: 5 }])] }));
  const prs = milestonesFor({ client: c, sessions }).filter(m => m.kind === 'pr');
  assert.equal(prs.length, 1, 'one trophy per drill, not one per session');
  assert.match(prs[0].detail, /165 lb/);
  assert.match(prs[0].detail, /up from 155 lb/);
});

test('a first ever logged weight is not yet a PR', () => {
  const c = client();
  const sessions = [session({ drills: [lift('Front squat', [{ weight: 135, reps: 5 }])] })];
  assert.equal(milestonesFor({ client: c, sessions }).filter(m => m.kind === 'pr').length, 0);
});

test('streaks count consecutive weeks and reset when one is missed', () => {
  const c = client();
  const unbroken = Array.from({ length: 4 }, (_, i) => session({ date: weeksAgo(3 - i) }));
  assert.ok(titles(milestonesFor({ client: c, sessions: unbroken })).includes('4 weeks in a row'));

  const withAGap = [weeksAgo(5), weeksAgo(4), weeksAgo(2), weeksAgo(1)].map(date => session({ date }));
  assert.ok(!titles(milestonesFor({ client: c, sessions: withAGap })).includes('4 weeks in a row'));
});

test('anniversaries count from the start date on the profile, even if sessions were logged later', () => {
  const startedTwoYearsAgo = isoDate(new Date(parseDate(today).getFullYear() - 2, parseDate(today).getMonth(), 1));
  const c = client({ startDate: startedTwoYearsAgo });
  const sessions = [session({ date: daysAgo(10) })]; // only recent logs
  const marks = titles(milestonesFor({ client: c, sessions }));
  assert.ok(marks.includes('1 year training together'));
  assert.ok(marks.includes('2 years training together'));
  assert.ok(!marks.includes('3 years training together'));
});

test("Drew's own accolades sit alongside the automatic ones, newest first, and keep their id", () => {
  const c = client();
  const sessions = [session({ date: daysAgo(5) })];
  const awards = [{ id: 'award-1', date: today, title: 'First amateur fight win', icon: '🥇', note: 'TKO round 2' }];
  const all = milestonesFor({ client: c, sessions, awards });
  assert.equal(all[0].title, 'First amateur fight win');
  assert.equal(all[0].id, 'award-1');
  assert.ok(all.every((m, i) => i === 0 || all[i - 1].date >= m.date), 'newest first');
});

test('milestones can be narrowed to a recap period', () => {
  const c = client();
  const sessions = [session({ date: daysAgo(40) })];
  const awards = [
    { id: 'a', date: daysAgo(3), title: 'In range' },
    { id: 'b', date: daysAgo(30), title: 'Out of range' },
  ];
  const inRange = titles(milestonesInRange(milestonesFor({ client: c, sessions, awards }), daysAgo(6), today));
  assert.deepEqual(inRange, ['In range']);
});

test('saving a session reports only what it just unlocked', () => {
  const c = client();
  const before = Array.from({ length: 4 }, (_, i) => session({ date: daysAgo(20 - i) }));
  const after = [...before, session({ date: today })];
  const earned = newlyEarned(
    milestonesFor({ client: c, sessions: before }),
    milestonesFor({ client: c, sessions: after }),
  );
  assert.deepEqual(titles(earned), ['5 sessions together']);
});

test('weights use the unit that was set', () => {
  const c = client();
  const sessions = [60, 70].map((weight, i) => session({ date: daysAgo(10 - i), drills: [lift('Front squat', [{ weight, reps: 5 }])] }));
  const pr = milestonesFor({ client: c, sessions, unit: 'kg' }).find(m => m.kind === 'pr');
  assert.match(pr.detail, /70 kg/);
});

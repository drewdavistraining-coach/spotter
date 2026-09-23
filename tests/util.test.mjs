import test from 'node:test';
import assert from 'node:assert/strict';
import { isoDate, parseDate, addDays, weekStart, fmtSets, topSet, average, initials, firstName, fmtDuration } from '../js/util.js';

test('dates are local, not UTC — a late-evening session stays on today', () => {
  const lateTonight = new Date(2026, 8, 22, 23, 30); // 22 Sep 2026, 11:30pm
  assert.equal(isoDate(lateTonight), '2026-09-22');
});

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-09-22'), '2026-09-21'); // a Tuesday
  assert.equal(weekStart('2026-09-21'), '2026-09-21'); // the Monday itself
  assert.equal(weekStart('2026-09-27'), '2026-09-21'); // the Sunday
});

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('addDays survives a daylight-saving change', () => {
  // Whatever the local rules, seven days later is the same weekday.
  const start = '2026-03-08';
  assert.equal(parseDate(addDays(start, 7)).getDay(), parseDate(start).getDay());
});

test('sets read as reps × weight, and bodyweight sets say so', () => {
  assert.equal(fmtSets([{ weight: 135, reps: 5 }, { weight: 155, reps: 3 }], 'lb'), '5 × 135 lb, 3 × 155 lb');
  assert.equal(fmtSets([{ weight: 0, reps: 10 }], 'kg'), '10 × bw');
  assert.equal(fmtSets([], 'lb'), '');
  assert.equal(fmtSets(undefined, 'lb'), '');
});

test('the top set is the heaviest, not the last', () => {
  assert.deepEqual(topSet([{ weight: 135, reps: 5 }, { weight: 185, reps: 2 }, { weight: 155, reps: 5 }]), { weight: 185, reps: 2 });
  assert.equal(topSet([{ weight: '', reps: 10 }]), null);
});

test('average ignores missing numbers and returns null when there is nothing', () => {
  assert.equal(average([4, 2]), 3);
  assert.equal(average([4, undefined, null, 2]), 3);
  assert.equal(average([]), null);
});

test('names shorten sensibly', () => {
  assert.equal(initials('Marcus Reyes'), 'MR');
  assert.equal(initials('Drew'), 'D');
  assert.equal(firstName('Marcus Reyes'), 'Marcus');
  assert.equal(fmtDuration(75), '1:15');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap, mailtoLink } from '../js/recap.js';
import { client, session, cancelledDay, lift, daysAgo, today, thisMonday } from './helpers.mjs';
import { addDays } from '../js/util.js';

const settings = { trainerName: 'Coach Drew', recapClosing: 'Keep putting in the work.', weightUnit: 'lb' };
const lastWeek = { from: daysAgo(6), to: today };

const write = (sessions, extra = {}) =>
  buildRecap({ client: client(), sessions, ...lastWeek, settings, ...extra }).body;

test('a recap greets them by first name and covers the right dates', () => {
  const recap = buildRecap({ client: client({ name: 'Marcus Reyes' }), sessions: [session()], ...lastWeek, settings });
  assert.match(recap.body, /^Hi Marcus,/);
  assert.match(recap.subject, /Your training recap/);
});

test('it counts sessions and lists the drills', () => {
  const body = write([
    session({ date: daysAgo(3), type: 'Pad work', drills: [{ name: 'Jab–cross' }] }),
    session({ date: daysAgo(1), type: 'Sparring', drills: [{ name: 'Technical sparring' }] }),
  ]);
  assert.match(body, /You trained 2 times \(120 minutes total\)/);
  assert.match(body, /Pad work - Jab–cross/);
});

test('cancellations get their own section and never count as training', () => {
  const body = write([session({ date: daysAgo(2) }), cancelledDay(daysAgo(1), 'Illness')]);
  assert.match(body, /You trained 1 time/);
  assert.match(body, /CANCELLED/);
  assert.match(body, /illness/);
});

test('a stretch with nothing but a cancellation reads kindly', () => {
  const body = write([cancelledDay(daysAgo(1))]);
  assert.match(body, /didn't get a session in this stretch/);
});

test('weights are reported against the best before this period', () => {
  const body = write([
    session({ date: daysAgo(30), drills: [lift('Front squat', [{ weight: 155, reps: 5 }])] }),
    session({ date: daysAgo(2), drills: [lift('Front squat', [{ weight: 185, reps: 5 }])] }),
  ]);
  assert.match(body, /WEIGHTS \(lb\)/);
  assert.match(body, /Front squat: 5 × 185 lb \(up 30 from 155\)/);
});

test('ratings are compared with the period before', () => {
  const body = write([
    session({ date: daysAgo(10), ratings: { Hands: 2 } }), // the previous week
    session({ date: daysAgo(2), ratings: { Hands: 4 } }),
  ]);
  assert.match(body, /Hands: 4\.0 \(up from 2\.0\)/);
});

test('a skill is never called both a strength and a weakness', () => {
  const c = client({ skills: ['Hands'] });
  const sessions = [1, 2, 3].map(d => session({ date: daysAgo(d), ratings: { Hands: 4 } }));
  const body = buildRecap({ client: c, sessions, ...lastWeek, settings }).body;
  const sharpen = body.split('AREAS TO SHARPEN')[1] || '';
  assert.ok(body.includes("WHAT'S WORKING"));
  assert.ok(!sharpen.includes('Hands'), 'Hands is already a strength');
});

test('milestones hit during the period are celebrated', () => {
  const c = client();
  const sessions = [session({ date: daysAgo(2) })];
  const awards = [{ id: 'a', date: daysAgo(1), title: 'Blue belt', icon: '🥋', note: '' }];
  const body = buildRecap({ client: c, sessions, awards, ...lastWeek, settings }).body;
  assert.match(body, /MILESTONES/);
  assert.match(body, /Blue belt/);
});

test('next week is included, with any planned weights', () => {
  const nextPlan = { weekStart: addDays(thisMonday, 7), phase: 'Build', theme: 'Boxing', notes: 'Bring gloves', days: [[], [], [], [], [], [], []] };
  nextPlan.days[0] = [{ name: 'Front squat', sets: [{ weight: 185, reps: 5 }] }, { name: 'Jab–cross' }];
  const body = write([session({ date: daysAgo(1) })], { nextPlan });
  assert.match(body, /THE PLAN FOR NEXT WEEK \(Build week, Boxing focus\)/);
  assert.match(body, /Mon: Front squat \(5 × 185 lb\), Jab–cross/);
  assert.match(body, /Bring gloves/);
});

test('private notes and voice memos never reach the client', () => {
  const body = write([session({ date: daysAgo(1), privateNotes: 'Knee looked sore, watch it', wentWell: 'Jab is snapping' })]);
  assert.ok(!body.includes('Knee looked sore'));
  assert.match(body, /Jab is snapping/);
});

test('it signs off with his name and closing line', () => {
  const body = write([session()]);
  assert.match(body, /Keep putting in the work\.\n\nCoach Drew$/);
});

test('a client with no rating categories still gets a recap', () => {
  const body = buildRecap({ client: client({ skills: undefined }), sessions: [session()], ...lastWeek, settings }).body;
  assert.match(body, /You trained 1 time/);
});

test('the mail link carries the address, subject and body', () => {
  const link = mailtoLink('marcus@example.com', 'Your recap', 'Hi Marcus,\n\nGood week.');
  assert.match(link, /^mailto:marcus%40example\.com\?subject=Your%20recap&body=Hi%20Marcus/);
  assert.match(mailtoLink('', 'S', 'B'), /^mailto:\?/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { clientBrief, extractProposal, replyText, validateProposal, SYSTEM_PROMPT } from '../js/ask.js';
import { client, session, cancelledDay, lift, drill, daysAgo, thisMonday } from './helpers.mjs';

const drills = [
  drill('Jab–cross–hook pads', { category: 'Boxing', level: 2, skills: ['Hands'] }),
  drill('Front squat', { category: 'Strength', level: 1, skills: ['Strength'], dose: '4 x 6' }),
  drill('Hard boxing sparring', { category: 'Boxing', level: 3, intensity: 3, skills: ['Hands'] }),
];

const beginner = client({
  name: 'Lisa Park',
  goal: 'Lose 10 lb and get comfortable sparring',
  notes: 'Knee valgus on squats; desk job posture',
  skills: ['Hands', 'Strength'],
  program: { levels: { Boxing: 1, Strength: 1 }, days: [0, 2], start: thisMonday },
});

test('the brief carries what a coach would need to answer well', () => {
  const sessions = [
    session({ date: daysAgo(10), ratings: { Hands: 2, Strength: 3 }, workOn: 'Knee caving on the way up' }),
    session({ date: daysAgo(3), ratings: { Hands: 3, Strength: 3 }, drills: [lift('Front squat', [{ weight: 95, reps: 8 }])] }),
    cancelledDay(daysAgo(6), 'Work'),
  ];
  const brief = clientBrief({ client: beginner, sessions, drills, unit: 'lb' });

  assert.match(brief, /CLIENT: Lisa Park/);
  assert.match(brief, /Knee valgus/, 'injury notes matter most of all');
  assert.match(brief, /Boxing Beginner/);
  assert.match(brief, /Mon, Wed/);
  assert.match(brief, /Hands: 2\.5|Hands: 3\.0/);
  assert.match(brief, /Knee caving on the way up/);
  assert.match(brief, /CURRENT LOADS \(lb\): Front squat 95x8/);
  assert.match(brief, /RECENT CANCELLATIONS: .*Work/);
  assert.match(brief, /DRILL LIBRARY/);
  assert.match(brief, /Front squat \| Strength \| Beginner/);
});

test('the brief leaves out private notes the coach keeps to himself', () => {
  const sessions = [session({ date: daysAgo(2), privateNotes: 'Going through a divorce' })];
  const brief = clientBrief({ client: beginner, sessions, drills });
  assert.ok(!brief.includes('divorce'), "private notes aren't the model's business");
});

test('the system prompt tells it to stay inside his library and his levels', () => {
  assert.match(SYSTEM_PROMPT, /drill library/i);
  assert.match(SYSTEM_PROMPT, /level/i);
  assert.match(SYSTEM_PROMPT, /not a doctor/i);
});

test('a proposal is found whether fenced, bare, or trailed by chatter', () => {
  const plan = { plan: { Mon: [{ drill: 'Front squat' }] } };
  assert.deepEqual(extractProposal('Here you go.\n```json\n' + JSON.stringify(plan) + '\n```'), plan);
  assert.deepEqual(extractProposal('Sure: ' + JSON.stringify(plan)), plan);
  assert.equal(extractProposal('Just talking, no plan here.'), null);
  assert.equal(extractProposal('```json\n{not json}\n```'), null);
});

test('the chatty part is shown without the JSON', () => {
  const text = 'Start light on the knee.\n```json\n{"plan":{}}\n```';
  assert.equal(replyText(text), 'Start light on the knee.');
});

test('a proposed week only keeps drills that exist in his library', () => {
  const proposal = { plan: { Mon: [{ drill: 'Front squat', dose: '3 x 8' }, { drill: 'Nordic hamstring curl' }] } };
  const result = validateProposal(proposal, { drills, client: beginner });
  assert.equal(result.used, 1);
  assert.deepEqual(result.days[0].map(b => b.name), ['Front squat']);
  assert.deepEqual(result.unknown, ['Nordic hamstring curl']);
  assert.equal(result.days[0][0].dose, '3 x 8');
});

test("a proposed week never sneaks in work above the client's level", () => {
  const proposal = { plan: { Wed: [{ drill: 'Hard boxing sparring' }] } };
  const result = validateProposal(proposal, { drills, client: beginner });
  assert.equal(result.used, 0);
  assert.deepEqual(result.tooAdvanced, ['Hard boxing sparring']);
});

test('weights come through, junk sets do not', () => {
  const proposal = { plan: { Mon: [{ drill: 'Front squat', sets: [{ weight: 95, reps: 8 }, { weight: 0, reps: 0 }] }] } };
  const result = validateProposal(proposal, { drills, client: beginner });
  assert.deepEqual(result.days[0][0].sets, [{ weight: 95, reps: 8 }]);
});

test('day names map to the right days, and nonsense days are ignored', () => {
  const proposal = { plan: { Monday: [{ drill: 'Front squat' }], Sun: [{ drill: 'Front squat' }], Someday: [{ drill: 'Front squat' }] } };
  const result = validateProposal(proposal, { drills, client: beginner });
  assert.equal(result.days[0].length, 1, 'Monday');
  assert.equal(result.days[6].length, 1, 'Sunday');
  assert.equal(result.used, 2);
});

test('suggested new drills are passed through for him to approve, never auto-added', () => {
  const proposal = { plan: {}, newDrills: [{ name: 'Copenhagen plank', category: 'Strength', why: 'hip stability for the valgus' }] };
  const result = validateProposal(proposal, { drills, client: beginner });
  assert.equal(result.used, 0);
  assert.equal(result.newDrills[0].name, 'Copenhagen plank');
  assert.equal(drills.length, 3, 'the library is untouched until he says so');
});

test('a malformed proposal yields an empty week rather than throwing', () => {
  assert.equal(validateProposal(null, { drills, client: beginner }).used, 0);
  assert.equal(validateProposal({ plan: 'nope' }, { drills, client: beginner }).used, 0);
  assert.equal(validateProposal({ plan: { Mon: 'nope' } }, { drills, client: beginner }).used, 0);
});

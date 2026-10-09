import test from 'node:test';
import assert from 'node:assert/strict';
import { phraseFor, prPhrase, streakPhrase } from '../js/phrases.js';

test('each skill gets language that fits it, not one template', () => {
  const wrestling = phraseFor('Takedowns', 'strong', 'seed');
  const hands = phraseFor('Hands', 'strong', 'seed');
  assert.notEqual(wrestling, hands);
  assert.ok(!wrestling.includes('sharp'), 'the old catch-all wording is gone');
  assert.ok(!wrestling.includes('Takedowns'), 'it should read like speech, not a field name');
});

test('the same client on the same day always gets the same wording', () => {
  const seed = 'client-1:2026-10-08';
  assert.equal(phraseFor('Cardio', 'strong', seed), phraseFor('Cardio', 'strong', seed));
});

test('different days vary the wording', () => {
  const monday = phraseFor('Hands', 'strong', 'client-1:2026-10-05');
  const friday = phraseFor('Hands', 'strong', 'client-1:2026-10-09');
  const sunday = phraseFor('Hands', 'strong', 'client-1:2026-10-11');
  assert.ok(new Set([monday, friday, sunday]).size > 1);
});

test('a skill with no entry of its own still reads like English', () => {
  const phrase = phraseFor('Footwork', 'focus', 'seed');
  assert.ok(phrase.includes('footwork'));
  assert.ok(!phrase.includes('{skill}'));
});

test('a slipping skill is said differently from one being worked on', () => {
  assert.notEqual(phraseFor('Defense', 'slipping', 'seed'), phraseFor('Defense', 'focus', 'seed'));
});

test('a PR knows how big it was', () => {
  assert.match(prPhrase({ name: 'Bench', weight: 205, previous: 195, unit: 'lb' }), /first time over 200/);
  assert.match(prPhrase({ name: 'Bench', weight: 185, previous: 155, unit: 'lb' }), /30 lb jump, your biggest/);
  assert.match(prPhrase({ name: 'Bench', weight: 160, previous: 155, unit: 'lb' }), /up 5 on your best/);
});

test('streaks get bigger words as they get longer', () => {
  assert.match(streakPhrase(4), /^4 weeks in a row\.$/);
  assert.match(streakPhrase(12), /most people skip/);
  assert.match(streakPhrase(26), /whole game/);
});

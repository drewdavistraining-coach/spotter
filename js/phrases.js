// How recaps talk.
//
// The old template said "your wrestling is looking sharp" about everything, which reads like a form letter
// and lands wrong for most skills. Each rating category gets its own coach language instead, picked from a
// few options so two recaps never read identically — but stable for a given client and date, so hitting
// Regenerate doesn't churn the wording.

const GENERIC = {
  strong: ['your {skill} is holding up well', 'your {skill} is in a good place'],
  climbing: ['your {skill} is coming along', 'your {skill} keeps improving'],
  focus: ["we'll keep working your {skill}", "your {skill} is where we'll put the reps"],
  slipping: ['your {skill} has gone quiet lately', "your {skill} needs a bit of attention"],
};

// Written the way a coach would say it out loud, not the way a chart would label it.
const SKILLS = {
  'Hands': {
    strong: ['your hands are landing clean', 'your combinations are flowing', "you're picking shots well"],
    climbing: ['your hands are getting quicker', 'your combinations are tightening up'],
    focus: ["we'll sharpen your hands", 'more work on your combinations next'],
    slipping: ['your hands have gone a bit loose', 'your combinations are coming apart under pressure'],
  },
  'Kicks & knees': {
    strong: ['your kicks are landing heavy', 'your legs are doing real damage'],
    climbing: ['your kicks are getting faster', 'your kicks are starting to bite'],
    focus: ["we'll build up your kicks", 'more rounds on the kicks next'],
    slipping: ['your kicks have lost some snap', "your kicks aren't landing like they were"],
  },
  'Defense': {
    strong: ["you're hard to hit right now", 'your defense is holding under pressure'],
    climbing: ["you're getting harder to catch clean", 'your head movement is improving'],
    focus: ["we'll tighten your defense", 'more work on not getting hit next'],
    slipping: ["you're getting caught more than you were", 'your guard is dropping late in rounds'],
  },
  'Clinch': {
    strong: ["you're winning the clinch exchanges", "you're controlling the tie-ups"],
    climbing: ['your clinch is getting stronger', "you're holding position better in the clinch"],
    focus: ["we'll put work into your clinch", 'more time in the tie-ups next'],
    slipping: ["you're giving up position in the clinch", "you're getting out-muscled in the tie-ups"],
  },
  'Takedowns': {
    strong: ["you're finishing takedowns", 'your shots are landing'],
    climbing: ['your shots are getting quicker', 'your entries are getting cleaner'],
    focus: ["we'll sharpen your entries", 'more reps on finishing the shot next'],
    slipping: ['your shots are getting stuffed', "your entries aren't as sharp as they were"],
  },
  'Ground game': {
    strong: ['your top pressure feels heavier', 'your guard is tough to pass'],
    climbing: ["you're moving better on the mat", 'your positions are getting stronger'],
    focus: ["we'll put more rounds into your ground work", 'more time on the mat next'],
    slipping: ["you're getting passed more easily", 'your positions are slipping on the mat'],
  },
  'Submissions': {
    strong: ['your finishes are tight', 'your submission chains are coming together'],
    climbing: ["you're spotting the finish earlier", 'your chains are linking up better'],
    focus: ["we'll drill your finishes", 'more reps on the chains next'],
    slipping: ["you're losing the finish late", 'your grips are breaking down'],
  },
  'Cardio': {
    strong: ['your gas tank is deep', "you're still fresh in the later rounds"],
    climbing: ["you're holding your pace longer", 'your recovery between rounds is better'],
    focus: ["we'll build your engine", 'more conditioning next'],
    slipping: ["you're fading in the later rounds", 'your pace is dropping off earlier'],
  },
  'Strength': {
    strong: ["you're moving real weight", 'the numbers are climbing'],
    climbing: ["you're getting stronger", 'your lifts are moving up'],
    focus: ["we'll build your base strength", 'more work in the weight room next'],
    slipping: ['your lifts have stalled a bit', 'the weight is moving slower than it was'],
  },
  'Mobility': {
    strong: ["you're moving freely", 'your range looks good'],
    climbing: ["you're moving better than you were", 'your range is opening up'],
    focus: ["we'll work on how you move", 'more mobility work next'],
    slipping: ["you're moving a bit stiff", 'your range has tightened up'],
  },
};

// A steady number from text, so a given client + date + skill always lands on the same phrase.
function pick(options, seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return options[(h >>> 0) % options.length];
}

// kind: 'strong' | 'climbing' | 'focus' | 'slipping'
export function phraseFor(skill, kind, seed = '') {
  const bank = SKILLS[skill] || GENERIC;
  const options = bank[kind] || GENERIC[kind];
  return pick(options, `${seed}:${skill}:${kind}`).replace('{skill}', skill.toLowerCase());
}

// A PR that knows how big it was. Crossing a round hundred is worth saying out loud.
export function prPhrase({ name, weight, previous, unit = 'lb' }) {
  const gain = Number(weight) - Number(previous);
  const crossed = Math.floor(Number(weight) / 100) > Math.floor(Number(previous) / 100);
  if (crossed) return `${name}: ${weight} ${unit} — first time over ${Math.floor(Number(weight) / 100) * 100}.`;
  const share = previous > 0 ? gain / previous : 1;
  if (share >= 0.1) return `${name}: ${weight} ${unit} — a ${gain} ${unit} jump, your biggest on this lift.`;
  if (gain <= 0) return `${name}: ${weight} ${unit}.`;
  return `${name}: ${weight} ${unit}, up ${gain} on your best.`;
}

export function streakPhrase(weeks) {
  if (weeks >= 26) return `${weeks} weeks straight — that consistency is the whole game.`;
  if (weeks >= 12) return `${weeks} weeks without missing. That's the part most people skip.`;
  return `${weeks} weeks in a row.`;
}

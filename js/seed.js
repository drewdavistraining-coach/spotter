// Starter content, modelled on Drew's disciplines. Everything here is editable in the app.

// Disciplines double as drill categories. Each client gets a level per discipline.
export const COMBAT = ['Boxing', 'Muay Thai', 'Jiu Jitsu', 'Wrestling', 'MMA'];
export const CONDITIONING = ['Strength', 'Conditioning'];
export const DISCIPLINES = [...COMBAT, ...CONDITIONING];
export const CATEGORIES = ['Warm-up', ...DISCIPLINES, 'Mobility'];

export const LEVELS = ['Off', 'Beginner', 'Intermediate', 'Advanced'];
export const LEVEL_SHORT = ['Off', 'Beg', 'Int', 'Adv'];
export const INTENSITY = ['', 'Technical', 'Drilling', 'Live'];

export const DEFAULT_SKILLS = ['Hands', 'Kicks & knees', 'Defense', 'Clinch', 'Takedowns', 'Ground game', 'Submissions', 'Cardio', 'Strength', 'Mobility'];

// Which ratings tell us a client may be ready to move up in a discipline.
export const DISCIPLINE_SKILLS = {
  'Boxing': ['Hands', 'Defense'],
  'Muay Thai': ['Kicks & knees', 'Clinch', 'Defense'],
  'Jiu Jitsu': ['Ground game', 'Submissions'],
  'Wrestling': ['Takedowns', 'Clinch'],
  'MMA': ['Hands', 'Takedowns', 'Ground game'],
  'Strength': ['Strength'],
  'Conditioning': ['Cardio'],
};

// Starting list only; Drew's own list is stored in meta 'sessionTypes' (see sessionTypes() in db.js).
export const SESSION_TYPES = ['Private', 'Pad work', 'Sparring', 'Grappling', 'Strength & conditioning', 'Group class', 'Assessment'];

// [name, category, level 1-3, intensity 1 technical / 2 drilling / 3 live, skills, default dose]
const RAW = [
  ['Jump rope', 'Warm-up', 1, 1, ['Cardio'], '3 x 3 min'],
  ['Shadowboxing', 'Warm-up', 1, 1, ['Hands', 'Defense'], '3 x 3 min'],
  ['Dynamic mobility flow', 'Warm-up', 1, 1, ['Mobility'], '8 min'],
  ['Shrimps, bridges & technical stand-ups', 'Warm-up', 1, 1, ['Ground game', 'Mobility'], '4 lengths'],
  ['Bear crawls & animal flow', 'Warm-up', 1, 1, ['Mobility', 'Cardio'], '5 min'],
  ['Stance & motion shadow wrestling', 'Warm-up', 1, 1, ['Takedowns'], '3 x 2 min'],

  ['Stance, guard & jab mechanics', 'Boxing', 1, 1, ['Hands', 'Defense'], '4 x 3 min'],
  ['1-2 on pads', 'Boxing', 1, 1, ['Hands'], '4 x 3 min'],
  ['Block & parry basics', 'Boxing', 1, 1, ['Defense'], '3 x 3 min'],
  ['Footwork: step-drag & pivots', 'Boxing', 1, 1, ['Defense', 'Hands'], '3 x 2 min'],
  ['Heavy bag fundamentals', 'Boxing', 1, 2, ['Hands', 'Cardio'], '4 x 2 min'],
  ['Jab–cross–hook–cross pads', 'Boxing', 2, 2, ['Hands'], '5 x 3 min'],
  ['Slip–roll–counter', 'Boxing', 2, 2, ['Defense', 'Hands'], '4 x 3 min'],
  ['Body shot combos', 'Boxing', 2, 2, ['Hands'], '4 x 2 min'],
  ['Partner mitt defense', 'Boxing', 2, 2, ['Defense'], '4 x 2 min'],
  ['Heavy bag power rounds', 'Boxing', 2, 2, ['Hands', 'Cardio'], '6 x 2 min'],
  ['Technical boxing sparring', 'Boxing', 2, 3, ['Hands', 'Defense'], '4 x 3 min'],
  ['Pull counters & check hooks', 'Boxing', 3, 2, ['Defense', 'Hands'], '4 x 3 min'],
  ['Angles & exits off the ropes', 'Boxing', 3, 2, ['Defense'], '4 x 2 min'],
  ['Feint-to-entry chains', 'Boxing', 3, 2, ['Hands'], '4 x 3 min'],
  ['Shoulder roll counters', 'Boxing', 3, 2, ['Defense', 'Hands'], '4 x 2 min'],
  ['Hard boxing sparring', 'Boxing', 3, 3, ['Hands', 'Defense', 'Cardio'], '5 x 3 min'],

  ['Teep & round kick mechanics', 'Muay Thai', 1, 1, ['Kicks & knees'], '4 x 3 min'],
  ['Kick checks', 'Muay Thai', 1, 1, ['Defense'], '3 x 2 min'],
  ['Long guard & straight knees', 'Muay Thai', 1, 1, ['Kicks & knees', 'Clinch'], '3 x 2 min'],
  ['Kick–punch combos on pads', 'Muay Thai', 2, 2, ['Kicks & knees', 'Hands'], '5 x 3 min'],
  ['Catch-kick counters', 'Muay Thai', 2, 2, ['Defense', 'Kicks & knees'], '4 x 2 min'],
  ['Clinch knees & off-balances', 'Muay Thai', 2, 2, ['Clinch', 'Kicks & knees'], '4 x 2 min'],
  ['Thai pad rounds', 'Muay Thai', 2, 2, ['Kicks & knees', 'Hands', 'Cardio'], '5 x 3 min'],
  ['Light kickboxing sparring', 'Muay Thai', 2, 3, ['Kicks & knees', 'Defense'], '4 x 3 min'],
  ['Switch kicks & feints', 'Muay Thai', 3, 2, ['Kicks & knees'], '4 x 3 min'],
  ['Elbows in the pocket', 'Muay Thai', 3, 2, ['Hands', 'Clinch'], '4 x 2 min'],
  ['Muay Thai clinch sparring', 'Muay Thai', 3, 3, ['Clinch', 'Kicks & knees'], '5 x 2 min'],
  ['Kickboxing sparring', 'Muay Thai', 3, 3, ['Kicks & knees', 'Hands', 'Defense'], '5 x 3 min'],

  ['Closed guard posture & breaks', 'Jiu Jitsu', 1, 1, ['Ground game'], '3 x 3 min'],
  ['Mount & side-control escapes', 'Jiu Jitsu', 1, 1, ['Ground game', 'Defense'], '5 reps each side'],
  ['Scissor & hip-bump sweeps', 'Jiu Jitsu', 1, 1, ['Ground game'], '10 reps each'],
  ['Americana & kimura from top', 'Jiu Jitsu', 1, 1, ['Submissions'], '10 reps each'],
  ['Guard retention flow', 'Jiu Jitsu', 2, 2, ['Ground game', 'Defense'], '4 x 3 min'],
  ['Armbar–triangle–omoplata chains', 'Jiu Jitsu', 2, 2, ['Submissions'], '10 reps'],
  ['Back takes & rear naked choke', 'Jiu Jitsu', 2, 2, ['Submissions', 'Ground game'], '10 reps'],
  ['Knee-cut & torreando passing', 'Jiu Jitsu', 2, 2, ['Ground game'], '4 x 2 min'],
  ['Positional rounds from bottom', 'Jiu Jitsu', 2, 3, ['Ground game', 'Defense'], '5 x 2 min'],
  ['Leg lock entries & defense', 'Jiu Jitsu', 3, 2, ['Submissions', 'Defense'], '4 x 3 min'],
  ['Butterfly & X-guard sweeps', 'Jiu Jitsu', 3, 2, ['Ground game'], '4 x 3 min'],
  ['Front headlock series', 'Jiu Jitsu', 3, 2, ['Submissions', 'Takedowns'], '4 x 2 min'],
  ['Submission-only rounds', 'Jiu Jitsu', 3, 3, ['Submissions', 'Ground game', 'Cardio'], '5 x 5 min'],

  ['Stance, motion & level changes', 'Wrestling', 1, 1, ['Takedowns'], '4 x 1 min'],
  ['Penetration step', 'Wrestling', 1, 1, ['Takedowns'], '3 x 10 each side'],
  ['Sprawl basics', 'Wrestling', 1, 1, ['Defense', 'Takedowns'], '3 x 10'],
  ['Hand fighting & ties', 'Wrestling', 1, 2, ['Clinch'], '4 x 1 min'],
  ['Double-leg entries & finishes', 'Wrestling', 2, 2, ['Takedowns'], '15 reps'],
  ['Single-leg finishes', 'Wrestling', 2, 2, ['Takedowns'], '10 reps each side'],
  ['Sprawl & go-behind', 'Wrestling', 2, 2, ['Defense', 'Takedowns'], '5 x 30 sec'],
  ['Underhooks & body-lock trips', 'Wrestling', 2, 2, ['Clinch', 'Takedowns'], '4 x 2 min'],
  ['Chain wrestling goes', 'Wrestling', 2, 3, ['Takedowns', 'Cardio'], '4 x 2 min'],
  ['Snap-down to front headlock', 'Wrestling', 3, 2, ['Takedowns', 'Clinch'], '4 x 2 min'],
  ['Mat returns & rides', 'Wrestling', 3, 2, ['Takedowns', 'Ground game'], '4 x 1 min'],
  ['Live wrestling from ties', 'Wrestling', 3, 3, ['Takedowns', 'Clinch', 'Cardio'], '5 x 2 min'],

  ['Punch-to-shot entries', 'MMA', 1, 1, ['Hands', 'Takedowns'], '4 x 2 min'],
  ['Getting up off the cage', 'MMA', 1, 1, ['Defense', 'Ground game'], '4 x 1 min'],
  ['Cage clinch & underhooks', 'MMA', 2, 2, ['Clinch', 'Takedowns'], '4 x 2 min'],
  ['Ground & pound from top', 'MMA', 2, 2, ['Ground game', 'Hands'], '4 x 1 min'],
  ['Wall walks & get-ups', 'MMA', 2, 2, ['Ground game', 'Defense'], '3 x 2 min'],
  ['Strike-to-takedown chains', 'MMA', 2, 2, ['Hands', 'Takedowns'], '4 x 3 min'],
  ['MMA situational rounds', 'MMA', 2, 3, ['Hands', 'Takedowns', 'Ground game'], '3 x 5 min'],
  ['Cage-work sparring', 'MMA', 3, 3, ['Clinch', 'Takedowns', 'Defense'], '4 x 3 min'],
  ['Fight-pace simulation rounds', 'MMA', 3, 3, ['Cardio', 'Hands', 'Takedowns'], '3 x 5 min'],

  ['Goblet squat', 'Strength', 1, 1, ['Strength'], '3 x 10'],
  ['Push-up & row circuit', 'Strength', 1, 1, ['Strength'], '3 rounds'],
  ['Kettlebell deadlift', 'Strength', 1, 1, ['Strength'], '3 x 10'],
  ['Plank & carry circuit', 'Strength', 1, 2, ['Strength'], '3 rounds'],
  ['Trap bar deadlift', 'Strength', 2, 2, ['Strength'], '4 x 5'],
  ['Front squat', 'Strength', 2, 2, ['Strength'], '4 x 6'],
  ['Pull-ups', 'Strength', 2, 2, ['Strength'], '4 x max'],
  ['Landmine rotational press', 'Strength', 2, 2, ['Strength', 'Hands'], '3 x 8 each side'],
  ['Kettlebell swings', 'Strength', 2, 2, ['Strength', 'Cardio'], '5 x 15'],
  ['Neck & grip circuit', 'Strength', 2, 2, ['Strength', 'Clinch'], '3 rounds'],
  ['Contrast sets: heavy + jump', 'Strength', 3, 3, ['Strength'], '4 x 3 + 3'],
  ['Power cleans', 'Strength', 3, 2, ['Strength'], '5 x 3'],

  ['Steady bike or row', 'Conditioning', 1, 1, ['Cardio'], '20 min'],
  ['Bodyweight circuit', 'Conditioning', 1, 2, ['Cardio'], '4 rounds'],
  ['Assault bike intervals', 'Conditioning', 2, 2, ['Cardio'], '10 x 20s on / 40s off'],
  ['Sled push', 'Conditioning', 2, 2, ['Cardio', 'Strength'], '6 x 20 m'],
  ['Battle ropes', 'Conditioning', 2, 2, ['Cardio'], '6 x 30 sec'],
  ['Sprawl-burpee rounds', 'Conditioning', 2, 2, ['Cardio', 'Takedowns'], '5 x 45 sec'],
  ['Hill or treadmill sprints', 'Conditioning', 3, 3, ['Cardio'], '8 x 15 sec'],
  ['Fight-round circuits', 'Conditioning', 3, 3, ['Cardio', 'Strength'], '5 x 5 min'],

  ['Hip 90/90 & Cossack squats', 'Mobility', 1, 1, ['Mobility'], '3 x 8'],
  ['Thoracic openers', 'Mobility', 1, 1, ['Mobility'], '5 min'],
  ['Neck & shoulder prehab', 'Mobility', 1, 1, ['Mobility'], '6 min'],
  ['Cool-down stretch & breathwork', 'Mobility', 1, 1, ['Mobility'], '10 min'],
];

export function seedDrills(uid) {
  return RAW.map(([name, category, level, intensity, skills, dose]) => ({ id: uid(), name, category, level, intensity, skills, dose, notes: '' }));
}

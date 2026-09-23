// Accolades and milestones.
//
// Two kinds, deliberately:
//   - worked out from what's already logged (session counts, weight PRs, streaks, anniversaries), so they
//     appear on their own and stay correct even if a session is edited or deleted;
//   - ones Drew adds himself (first fight, a belt, a weight cut) — stored in the "awards" store.
import { fmtDate, parseDate, isoDate, weekStart, addDays } from './util.js';
import { byDate, attended, weightHistory } from './progress.js';

export const SESSION_MARKS = [1, 5, 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];
const STREAK_MARKS = [4, 8, 12, 26, 52];

export const AWARD_ICONS = ['🏆', '🥇', '🥋', '🔥', '💪', '🎯', '🤼', '🥊'];

function sessionCountMarks(trained) {
  return trained.flatMap((session, i) => {
    const n = i + 1;
    if (!SESSION_MARKS.includes(n) && !(n > 500 && n % 100 === 0)) return [];
    return [{
      date: session.date,
      kind: 'sessions',
      icon: n === 1 ? '🌱' : '🏅',
      title: n === 1 ? 'First session' : `${n} sessions together`,
      detail: n === 1 ? 'Where it started.' : `Since ${fmtDate(trained[0].date, { month: 'long', year: 'numeric' })}.`,
    }];
  });
}

// A PR is a heavier top set than anything logged for that drill before. Only the standing record for each
// drill is kept as a milestone — otherwise a client adding 5 lb a week collects a trophy every session.
function weightPRs(trained, unit) {
  const marks = [];
  for (const entries of weightHistory(trained).values()) {
    let best = 0;
    let record = null;
    for (const entry of entries) {
      const weight = Number(entry.top?.weight) || 0;
      if (weight <= best) continue;
      if (best > 0) {
        record = {
          date: entry.date,
          kind: 'pr',
          icon: '🏋️',
          title: `PR: ${entry.name}`,
          detail: `${weight} ${unit} × ${entry.top.reps || '?'} — up from ${best} ${unit}.`,
        };
      }
      best = weight;
    }
    if (record) marks.push(record);
  }
  return marks;
}

// Consecutive weeks with at least one session.
function streakMarks(trained) {
  const weeks = [...new Set(trained.map(s => weekStart(s.date)))].sort();
  const marks = [];
  let run = 0;
  weeks.forEach((week, i) => {
    run = i > 0 && weeks[i - 1] === addDays(week, -7) ? run + 1 : 1;
    if (!STREAK_MARKS.includes(run)) return;
    const last = trained.filter(s => weekStart(s.date) === week).at(-1);
    marks.push({
      date: last.date,
      kind: 'streak',
      icon: '🔥',
      title: `${run} weeks in a row`,
      detail: 'Not a week missed.',
    });
  });
  return marks;
}

function anniversaryMarks(client, trained) {
  // Whichever came first: the date on their profile, or their first logged session.
  const start = [client.startDate, trained[0]?.date].filter(Boolean).sort()[0];
  if (!start) return [];
  const marks = [];
  for (let year = 1; year <= 30; year++) {
    const date = parseDate(start);
    date.setFullYear(date.getFullYear() + year);
    const iso = isoDate(date);
    if (iso > isoDate()) break;
    marks.push({
      date: iso,
      kind: 'anniversary',
      icon: '🎉',
      title: `${year} year${year === 1 ? '' : 's'} training together`,
      detail: `Started ${fmtDate(start, { month: 'long', day: 'numeric', year: 'numeric' })}.`,
    });
  }
  return marks;
}

// Everything worth celebrating, newest first. Manual awards carry an id so they can be edited or deleted.
export function milestonesFor({ client, sessions, awards = [], unit = 'lb' }) {
  const trained = byDate(attended(sessions));
  const auto = [
    ...sessionCountMarks(trained),
    ...weightPRs(trained, unit),
    ...streakMarks(trained),
    ...anniversaryMarks(client, trained),
  ];
  const manual = awards.map(a => ({
    date: a.date,
    kind: 'award',
    icon: a.icon || '🏆',
    title: a.title,
    detail: a.note || '',
    id: a.id,
  }));
  return [...auto, ...manual].sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

export function milestonesInRange(all, from, to) {
  return all.filter(m => m.date >= from && m.date <= to);
}

// Called after logging a session: anything new that today's session just unlocked.
export function newlyEarned(before, after) {
  const seen = new Set(before.map(m => `${m.kind}:${m.title}:${m.date}`));
  return after.filter(m => !seen.has(`${m.kind}:${m.title}:${m.date}`));
}

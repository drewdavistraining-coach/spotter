// Turns a client's logged sessions into trends and "areas to sharpen".
import { average, addDays, weekStart, isoDate } from './util.js';

export function byDate(list) {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
}

export function inRange(sessions, from, to) {
  return sessions.filter(s => s.date >= from && s.date <= to);
}

export function skillSeries(sessions, skill) {
  return byDate(sessions)
    .filter(s => typeof s.ratings?.[skill] === 'number')
    .map(s => ({ date: s.date, value: s.ratings[skill] }));
}

export function skillAverage(sessions, skill) {
  return average(sessions.map(s => s.ratings?.[skill]));
}

// Compares the latest few ratings with the few before them.
export function trend(series, window = 3) {
  if (series.length < 2) return 0;
  const recent = average(series.slice(-window).map(p => p.value));
  const before = average(series.slice(-window * 2, -window).map(p => p.value));
  if (before === null) return 0;
  return recent - before;
}

export function skillSummary(client, sessions) {
  return (client.skills || []).map(skill => {
    const series = skillSeries(sessions, skill);
    return {
      skill,
      series,
      current: average(series.slice(-3).map(p => p.value)),
      trend: trend(series),
    };
  });
}

// Lowest recent scores first; a sliding skill gets pulled up the list.
export function focusAreas(client, sessions, count = 2) {
  return skillSummary(client, sessions)
    .filter(s => s.current !== null)
    .map(s => ({ ...s, score: s.current + Math.min(s.trend, 0) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .filter(s => s.current < 4.5);
}

export function strengths(client, sessions, count = 2) {
  return skillSummary(client, sessions)
    .filter(s => s.current !== null && s.current >= 3.5)
    .sort((a, b) => b.current - a.current || b.trend - a.trend)
    .slice(0, count);
}

export function weeklyCounts(sessions, weeks = 8) {
  const thisWeek = weekStart(isoDate());
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisWeek, -7 * (weeks - 1 - i));
    const end = addDays(start, 6);
    return { start, count: inRange(sessions, start, end).length };
  });
}

// Shared builders for the tests. Dates are always relative to today, so the suite never goes stale.
import { isoDate, addDays, weekStart } from '../js/util.js';

export const today = isoDate();
export const daysAgo = n => addDays(today, -n);
export const thisMonday = weekStart(today);
export const weeksAgo = n => addDays(thisMonday, -7 * n);

let counter = 0;
const id = prefix => `${prefix}-${++counter}`;

export function client(overrides = {}) {
  return {
    id: id('client'),
    name: 'Test Client',
    email: 'client@example.com',
    skills: ['Hands', 'Strength'],
    disciplines: ['Boxing'],
    startDate: daysAgo(30),
    createdAt: Date.now(),
    program: { levels: { Boxing: 2, Strength: 2 }, days: [0, 2, 4], start: thisMonday },
    ...overrides,
  };
}

export function session(overrides = {}) {
  return {
    id: id('session'),
    clientId: 'client-1',
    date: today,
    type: 'Private',
    duration: 60,
    drills: [],
    ratings: {},
    wentWell: '',
    workOn: '',
    privateNotes: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

export const cancelledDay = (date, reason = 'Illness') =>
  session({ date, cancelled: true, cancelReason: reason, duration: 0 });

export const lift = (name, sets, extra = {}) => ({ drillId: `drill-${name}`, name, category: 'Strength', sets, ...extra });

export function drill(name, overrides = {}) {
  return { id: id('drill'), name, category: 'Boxing', level: 1, intensity: 1, skills: ['Hands'], dose: '3 x 3 min', notes: '', ...overrides };
}

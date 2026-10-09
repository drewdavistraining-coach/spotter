// Ask Spotter: questions answered with this client's history and Drew's own drill library in view.
//
// The app builds the brief and validates whatever comes back; the Supabase function (supabase/functions/ask)
// holds the API key and the daily cap. Nothing here can invent a drill: a proposed week is checked against
// the library before he ever sees an "Apply" button.
import { db } from './db.js';
import { isoDate, addDays, weekStart, DAY_NAMES, fmtSets } from './util.js';
import { attended, byDate, focusAreas, skillSummary, weightHistory } from './progress.js';
import { cycleInfo, programFor } from './planner.js';
import { milestonesFor } from './milestones.js';
import { LEVELS } from './seed.js';

const FUNCTION_URL = 'https://bzrsalvbtbpyvdvsmckh.supabase.co/functions/v1/ask';
const SUPABASE_KEY = 'sb_publishable_9HGk_3cjfuzIH-PjQwDz8g_cWMPvbzD';

export const SUGGESTIONS = [
  'Build next week for this client',
  'They have knee valgus and posture issues — how should I program around it?',
  "What should we work on next, and why?",
  'Make this week easier — they are beat up',
];

export const SYSTEM_PROMPT = `You are Spotter, the assistant inside a coaching app used by Drew, an MMA fighter and personal trainer.
You help him program for his clients. You are talking to the coach, never to the client.

How to answer:
- Be direct and practical, the way one coach talks to another. No preamble, no disclaimers, no bullet lists of caveats.
- Keep it short: a few sentences, or a handful of lines. He is reading this on a phone between sessions.
- Use his drill library wherever you can, by the exact names given. Only suggest something outside it when the library genuinely lacks what is needed, and say so plainly.
- Respect the client's level in each discipline. Never prescribe advanced work to a beginner.
- You are not a doctor. For an injury, program around it and say when something needs a professional.

When he asks you to build or change a week, reply with a short sentence and then a JSON block, exactly in this shape:

\`\`\`json
{
  "plan": {
    "Mon": [{"drill": "Exact drill name", "dose": "4 x 3 min", "sets": [{"weight": 135, "reps": 5}]}],
    "Wed": [{"drill": "Another drill", "dose": "3 rounds"}]
  },
  "newDrills": [{"name": "Name", "category": "Mobility", "level": 1, "intensity": 1, "skills": ["Mobility"], "dose": "3 x 10", "why": "one line"}]
}
\`\`\`

Rules for that JSON: day keys are Mon, Tue, Wed, Thu, Fri, Sat, Sun; only include the days he trains that client; "sets" only for weighted work; "newDrills" only when you truly need something the library lacks, otherwise leave it out. Never put anything in the JSON except these fields.`;

// Everything the model needs to answer well, and nothing it doesn't.
export function clientBrief({ client, sessions, drills, plan, unit = 'lb', awards = [] }) {
  const program = programFor(client);
  const cycle = cycleInfo(client, weekStart());
  const trained = byDate(attended(sessions));
  const recent = trained.slice(-6);
  const lines = [];

  lines.push(`CLIENT: ${client.name}`);
  if (client.goal) lines.push(`Goal: ${client.goal}`);
  if (client.notes) lines.push(`Background and injuries: ${client.notes}`);
  const levels = Object.entries(program.levels).filter(([, v]) => v > 0).map(([d, v]) => `${d} ${LEVELS[v]}`);
  if (levels.length) lines.push(`Levels: ${levels.join(', ')}`);
  lines.push(`Trains: ${program.days.map(d => DAY_NAMES[d]).join(', ') || 'no set days'} · ${trained.length} sessions logged`);
  if (cycle.theme) lines.push(`Cycle: block ${cycle.block}, ${cycle.phase.name} week, ${cycle.theme} focus`);

  const rated = skillSummary(client, trained).filter(s => s.current !== null);
  if (rated.length) {
    lines.push('', 'RATINGS (out of 5, recent average):');
    for (const s of rated) {
      const direction = s.trend > 0.25 ? 'improving' : s.trend < -0.25 ? 'slipping' : 'steady';
      lines.push(`- ${s.skill}: ${s.current.toFixed(1)} (${direction})`);
    }
  }
  const weak = focusAreas(client, trained).map(f => f.skill);
  if (weak.length) lines.push(`Weakest: ${weak.join(', ')}`);

  if (recent.length) {
    lines.push('', 'RECENT SESSIONS:');
    for (const s of recent) {
      const work = (s.drills || []).map(d => d.name + (d.sets?.length ? ` (${fmtSets(d.sets, unit)})` : '')).join(', ');
      lines.push(`- ${s.date} ${s.type || 'Session'}${work ? `: ${work}` : ''}${s.workOn ? ` | work on: ${s.workOn}` : ''}`);
    }
  }

  const lifts = [...weightHistory(trained).values()].map(entries => entries.at(-1)).filter(Boolean);
  if (lifts.length) {
    lines.push('', `CURRENT LOADS (${unit}): ` + lifts.map(l => `${l.name} ${l.top.weight}x${l.top.reps}`).join(', '));
  }

  const cancellations = sessions.filter(s => s.cancelled).slice(-3);
  if (cancellations.length) lines.push('', `RECENT CANCELLATIONS: ${cancellations.map(s => `${s.date} (${s.cancelReason || 'cancelled'})`).join(', ')}`);

  const recentMilestones = milestonesFor({ client, sessions, awards, unit }).slice(0, 3);
  if (recentMilestones.length) lines.push('', `RECENT WINS: ${recentMilestones.map(m => m.title).join(', ')}`);

  if (plan?.days?.flat().length) {
    lines.push('', 'THIS WEEK AS PLANNED:');
    plan.days.forEach((day, i) => {
      if (day.length) lines.push(`- ${DAY_NAMES[i]}: ${day.map(b => `${b.name}${b.dose ? ` (${b.dose})` : ''}`).join(', ')}`);
    });
  }

  lines.push('', 'DRILL LIBRARY (name | category | level | intensity | trains):');
  for (const d of drills) {
    lines.push(`- ${d.name} | ${d.category} | ${LEVELS[d.level || 1]} | ${['', 'technical', 'drilling', 'live'][d.intensity || 2]} | ${(d.skills || []).join('/')}`);
  }

  return lines.join('\n');
}

// Ask the function. Returns { text, usedToday, dailyLimit }.
export async function askSpotter({ system, messages, maxTokens = 1200 }) {
  const auth = await db.getMeta('auth');
  if (!auth) throw new Error('Sign in under Settings → Sync to use Ask Spotter.');
  if (!navigator.onLine) throw new Error('Ask Spotter needs a connection.');

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${auth.access_token}`,
    },
    body: JSON.stringify({ system, messages, maxTokens }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Ask Spotter failed (${res.status}).`);
  return body;
}

// Pull the JSON block out of a reply, if there is one. Tolerant: fenced, bare, or trailing prose.
export function extractProposal(text = '') {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'));
  if (!candidate || !candidate.includes('{')) return null;
  try {
    const parsed = JSON.parse(candidate.trim());
    return parsed && (parsed.plan || parsed.newDrills) ? parsed : null;
  } catch {
    return null;
  }
}

// What's left once the JSON is removed — the part he actually reads.
export function replyText(text = '') {
  return text.replace(/```(?:json)?[\s\S]*?```/g, '').trim();
}

// Turn a proposal into real plan days, keeping only drills that exist and fit the client.
// Returns { days, used, unknown, tooAdvanced }.
export function validateProposal(proposal, { drills, client }) {
  const program = programFor(client);
  const byName = new Map(drills.map(d => [d.name.trim().toLowerCase(), d]));
  const days = Array.from({ length: 7 }, () => []);
  const unknown = [];
  const tooAdvanced = [];
  let used = 0;

  for (const [dayName, entries] of Object.entries(proposal?.plan || {})) {
    const index = DAY_NAMES.findIndex(d => d.toLowerCase() === String(dayName).slice(0, 3).toLowerCase());
    if (index < 0 || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      const drill = byName.get(String(entry?.drill || entry?.name || '').trim().toLowerCase());
      if (!drill) {
        if (entry?.drill || entry?.name) unknown.push(entry.drill || entry.name);
        continue;
      }
      const level = program.levels[drill.category];
      if (level !== undefined && (drill.level || 1) > Math.max(level, 1)) {
        tooAdvanced.push(drill.name);
        continue;
      }
      const block = { drillId: drill.id, name: drill.name, category: drill.category, dose: entry.dose || drill.dose || '' };
      const sets = (entry.sets || []).filter(s => Number(s?.weight) > 0 || Number(s?.reps) > 0);
      if (sets.length) block.sets = sets.map(s => ({ weight: Number(s.weight) || '', reps: Number(s.reps) || '' }));
      days[index].push(block);
      used++;
    }
  }

  return { days, used, unknown, tooAdvanced, newDrills: proposal?.newDrills || [] };
}

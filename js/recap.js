// Template recap writer. Pure function: data in, plain-text email out.
// This is the seam where an AI writer can be swapped in later — same inputs, same output shape.
import { fmtDate, fmtRange, firstName, parseDate, addDays, DAY_NAMES } from './util.js';
import { byDate, inRange, skillAverage, focusAreas, strengths, trend, skillSeries } from './progress.js';

const one = n => (Math.round(n * 10) / 10).toFixed(1);

export function buildRecap({ client, sessions, from, to, nextPlan, settings }) {
  const days = Math.round((parseDate(to) - parseDate(from)) / 86400000) + 1;
  const period = byDate(inRange(sessions, from, to));
  const previous = inRange(sessions, addDays(from, -days), addDays(from, -1));
  const upToNow = sessions.filter(s => s.date <= to);
  const lines = [];

  lines.push(`Hi ${firstName(client.name)},`, '');
  lines.push(`Here's your training recap for ${fmtRange(from, to)}.`, '');

  // Sessions
  lines.push('SESSIONS');
  if (!period.length) {
    lines.push("We didn't log any sessions in this stretch. Let's get back on the mats this week.");
  } else {
    const minutes = period.reduce((sum, s) => sum + (Number(s.duration) || 0), 0);
    lines.push(`You trained ${period.length} time${period.length === 1 ? '' : 's'}${minutes ? ` (${minutes} minutes total)` : ''}.`);
    for (const s of period) {
      const drills = (s.drills || []).map(d => d.name).join(', ');
      lines.push(`- ${fmtDate(s.date)}: ${s.type || 'Session'}${drills ? ` - ${drills}` : ''}`);
    }
  }
  lines.push('');

  // Ratings
  const rated = (client.skills || [])
    .map(skill => ({ skill, now: skillAverage(period, skill), before: skillAverage(previous, skill) }))
    .filter(r => r.now !== null);
  if (rated.length) {
    lines.push('PROGRESS (coach ratings out of 5)');
    for (const r of rated) {
      let change = '';
      if (r.before !== null) {
        const delta = r.now - r.before;
        change = Math.abs(delta) < 0.25 ? ` (steady, was ${one(r.before)})` : ` (${delta > 0 ? 'up' : 'down'} from ${one(r.before)})`;
      }
      lines.push(`- ${r.skill}: ${one(r.now)}${change}`);
    }
    lines.push('');
  }

  // What's working
  const wins = period.map(s => s.wentWell?.trim()).filter(Boolean);
  const strong = strengths(client, upToNow).filter(s => s.trend >= 0);
  if (wins.length || strong.length) {
    lines.push("WHAT'S WORKING");
    for (const s of strong) lines.push(`- ${s.skill} is a real strength right now.`);
    for (const w of wins) lines.push(`- ${w}`);
    lines.push('');
  }

  // Areas to sharpen
  const focus = focusAreas(client, upToNow);
  const workOn = period.map(s => s.workOn?.trim()).filter(Boolean);
  if (focus.length || workOn.length) {
    lines.push('AREAS TO SHARPEN');
    for (const f of focus) {
      const slipping = trend(skillSeries(upToNow, f.skill)) < -0.25;
      lines.push(`- ${f.skill}${slipping ? " has slipped a little - we'll put extra reps here." : ' is our main focus next.'}`);
    }
    for (const w of workOn) lines.push(`- ${w}`);
    lines.push('');
  }

  // Next week
  const planned = (nextPlan?.days || []).map((blocks, i) => ({ day: DAY_NAMES[i], blocks })).filter(d => d.blocks.length);
  if (planned.length) {
    lines.push(nextPlan.phase ? `THE PLAN FOR NEXT WEEK (${nextPlan.phase} week, ${nextPlan.theme} focus)` : 'THE PLAN FOR NEXT WEEK');
    for (const d of planned) lines.push(`- ${d.day}: ${d.blocks.map(b => b.name).join(', ')}`);
    if (nextPlan.notes?.trim()) lines.push('', nextPlan.notes.trim());
    lines.push('');
  }

  if (settings.recapClosing?.trim()) lines.push(settings.recapClosing.trim(), '');
  lines.push(settings.trainerName?.trim() || 'Your coach');

  return {
    subject: `Your training recap: ${fmtRange(from, to)}`,
    body: lines.join('\n'),
  };
}

export function mailtoLink(to, subject, body) {
  return `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

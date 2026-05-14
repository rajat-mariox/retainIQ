/**
 * Productivity AI Insight Service
 *
 * Generates narrative insights from productivity data: why a score moved,
 * who is overworked, who is underutilized, who is at burnout risk.
 *
 * OpenAI when key is set; deterministic templates otherwise.
 * Privacy: only structured aggregates are sent — no names, no raw activity.
 */
let OpenAIClient = null;
try { OpenAIClient = require('openai'); } catch (_) {}

function getClient() {
  if (!OpenAIClient || !process.env.OPENAI_API_KEY) return null;
  return new OpenAIClient.OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function staticInsight({ subject, current, prior, flags, role, period }) {
  const lines = [];
  const delta = current.score - (prior?.score ?? current.score);

  if (delta <= -10) {
    lines.push(`Productivity dropped ${Math.abs(delta)} points this ${period}.`);
  } else if (delta >= 10) {
    lines.push(`Productivity increased ${delta} points this ${period}.`);
  } else {
    lines.push(`Productivity is stable this ${period} at ${current.score}/100.`);
  }

  if (flags.includes('burnout_risk') || flags.includes('overwork')) {
    lines.push('Sustained long hours combined with declining output indicate burnout risk — consider scheduling time off or rebalancing workload.');
  }
  if (flags.includes('meeting_overload')) {
    lines.push('Meeting load is consuming a large share of working time, leaving little room for deep work.');
  }
  if (flags.includes('low_focus')) {
    lines.push('Frequent context switching with limited deep-work blocks suggests workspace or interruption issues.');
  }
  if (flags.includes('high_idle')) {
    lines.push('Significant idle time during work hours — check whether the person is blocked or under-utilized.');
  }

  // Sub-score commentary
  if (current.subScores.taskCompletion < 50) {
    lines.push('Task completion is the largest drag on the score this period.');
  }
  if (current.subScores.consistency >= 80) {
    lines.push('Strong day-to-day consistency — a hallmark of high performers.');
  }

  return {
    summary: lines.join(' '),
    bullets: lines,
    source: 'static',
  };
}

async function generateInsight({ subject, current, prior, flags = [], role, period = 'week' }) {
  const client = getClient();
  if (!client) return staticInsight({ subject, current, prior, flags, role, period });

  const minimal = {
    role: role || null,
    period,
    currentScore: current.score,
    currentBand: current.band,
    priorScore: prior?.score ?? null,
    delta: prior ? current.score - prior.score : null,
    subScores: current.subScores,
    efficiency: current.efficiency,
    flags,
  };

  const system = `You are a workforce productivity advisor. You produce decision-support guidance — never employment verdicts. Output strict JSON.`;
  const user = `Given this anonymized productivity snapshot, return a JSON object with:
- summary (2-3 sentences explaining the headline finding)
- bullets (array of 2-5 specific observations)
- recommendations (array of 2-4 actionable suggestions for a manager)
- strengths (array of up to 3 strengths)
- weaknesses (array of up to 3 areas of concern)

Snapshot: ${JSON.stringify(minimal)}`;

  try {
    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 700,
    });
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
    return {
      summary: parsed.summary || '',
      bullets: parsed.bullets || [],
      recommendations: parsed.recommendations || [],
      strengths: parsed.strengths || [],
      weaknesses: parsed.weaknesses || [],
      source: 'openai',
    };
  } catch (err) {
    console.warn('[ai] productivity insight fell back to static:', err.message);
    return staticInsight({ subject, current, prior, flags, role, period });
  }
}

// ---------------------------------------------------------------------------
// Activity-page summary — a short, HR-friendly narrative shown at the bottom
// of /employees/:id/activity. Same OpenAI-or-static fallback pattern as
// generateInsight; only structured aggregates are sent to the model.
// ---------------------------------------------------------------------------

function fmtMinutes(value = 0) {
  const v = Math.max(0, Math.round(value));
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}

function staticActivitySummary({ totals, score, prior, topApps, period, flags }) {
  const sentences = [];

  const total = fmtMinutes(totals.totalMinutes);
  const active = fmtMinutes(totals.activeMinutes);
  const idle = fmtMinutes(totals.idleMinutes);
  sentences.push(`Worked ${total} over the ${period}, with ${active} focused time and ${idle} idle.`);

  if (score) {
    const delta = prior ? score.score - prior.score : null;
    let trend = `is stable at ${score.score}/100`;
    if (delta !== null && delta <= -8) trend = `dropped to ${score.score}/100 (down ${Math.abs(delta)} from the prior period)`;
    else if (delta !== null && delta >= 8) trend = `improved to ${score.score}/100 (up ${delta} from the prior period)`;
    sentences.push(`Productivity ${trend} — band ${score.band || 'Unrated'}.`);
  }

  const notes = [];
  if (flags.highIdle) notes.push('idle share is elevated');
  if (flags.lowActive) notes.push('focused time is low');
  if (flags.heavyMeetings) notes.push('meeting/comms apps dominate the workday');
  if (notes.length) sentences.push(`Notes: ${notes.join('; ')}.`);

  if (topApps?.length) {
    sentences.push(`Top apps: ${topApps.slice(0, 3).map((a) => a.appName).join(', ')}.`);
  }

  return { summary: sentences.join(' '), source: 'static' };
}

async function generateActivitySummary({ totals, score, prior, topApps = [], period = 'last 30 days', role }) {
  const workMinutes = Math.max(1, (totals.totalMinutes || 0));
  const flags = {
    highIdle: (totals.idleMinutes || 0) / workMinutes > 0.25,
    lowActive: (totals.activeMinutes || 0) / workMinutes < 0.4,
    heavyMeetings:
      topApps.slice(0, 3).some((a) => /(slack|teams|zoom|meet|webex)/i.test(a.appName || '')) &&
      (totals.activeMinutes || 0) / workMinutes < 0.55,
  };

  const client = getClient();
  if (!client) return staticActivitySummary({ totals, score, prior, topApps, period, flags });

  const minimal = {
    role: role || null,
    period,
    totals: {
      total: totals.totalMinutes || 0,
      active: totals.activeMinutes || 0,
      idle: totals.idleMinutes || 0,
      break: totals.breakMinutes || 0,
    },
    score: score ? { score: score.score, band: score.band } : null,
    prior: prior ? { score: prior.score } : null,
    topApps: topApps.slice(0, 5).map((a) => ({ appName: a.appName, seconds: a.durationSeconds })),
    flags,
  };

  const system = `You are a workforce productivity advisor. You produce decision-support guidance — never employment verdicts. Output strict JSON.`;
  const user = `Given this anonymized activity snapshot, return a JSON object with one field "summary": a 2–3 sentence narrative for an HR admin. Style example: "employee1 worked 7h 20m today, had 4h 10m focused time, 45m idle time. Productivity is stable but meeting load is high." Use the totals verbatim (in h/m). Do not invent numbers. Snapshot: ${JSON.stringify(minimal)}`;

  try {
    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 250,
    });
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || '{}');
    return {
      summary: parsed.summary || staticActivitySummary({ totals, score, prior, topApps, period, flags }).summary,
      source: 'openai',
    };
  } catch (err) {
    console.warn('[ai] activity summary fell back to static:', err.message);
    return staticActivitySummary({ totals, score, prior, topApps, period, flags });
  }
}

module.exports = { generateInsight, generateActivitySummary };

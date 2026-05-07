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

module.exports = { generateInsight };

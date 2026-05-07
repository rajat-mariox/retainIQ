/**
 * AIRecommendationService
 * ----------------------------------------------------------------------------
 * Generates human-readable risk explanations, manager talking points, and
 * suggested HR interventions. Uses OpenAI when OPENAI_API_KEY is present and
 * falls back to deterministic static templates otherwise. Always returns the
 * same shape regardless of provider.
 *
 * PRIVACY: Only the structured assessment payload is sent to the LLM — never
 * raw private content (messages, screen captures, etc.). Employee identity is
 * minimized: we send role and department, not name or email.
 * ----------------------------------------------------------------------------
 */
let OpenAIClient = null;
try { OpenAIClient = require('openai'); } catch (_) { /* optional */ }

const { RISK_CATEGORIES } = require('../config/constants');

function getClient() {
  if (!OpenAIClient || !process.env.OPENAI_API_KEY) return null;
  return new OpenAIClient.OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function staticOutput(assessment, employee) {
  const { category, topFactors, recommendedAction, trend } = assessment;

  const explanationsByCat = {
    [RISK_CATEGORIES.LOW]: `Risk is currently low. Signals show stable engagement and performance${trend === 'Worsening' ? ', though a slight downward trend is worth watching.' : '.'}`,
    [RISK_CATEGORIES.MEDIUM]: `Moderate retention risk detected. Several signals suggest the employee may benefit from a proactive check-in.`,
    [RISK_CATEGORIES.HIGH]: `High retention risk. Multiple indicators point to disengagement; a structured 1:1 is recommended this week.`,
    [RISK_CATEGORIES.CRITICAL]: `Critical retention risk. Immediate manager + HR conversation is recommended.`,
  };

  const explanation =
    `${explanationsByCat[category]} ` +
    (topFactors.length ? `Primary drivers: ${topFactors.slice(0, 3).join('; ')}.` : '');

  const talkingPointsByCat = {
    [RISK_CATEGORIES.LOW]: [
      'Acknowledge recent contributions and recognize wins',
      'Ask about career aspirations for the next 6–12 months',
      'Confirm current workload feels sustainable',
    ],
    [RISK_CATEGORIES.MEDIUM]: [
      'Open the conversation: "How are you finding work lately?"',
      'Probe gently on workload, blockers, and team dynamics',
      'Ask what would make the next 90 days more rewarding',
      'Note any specific frustrations and commit to one follow-up action',
    ],
    [RISK_CATEGORIES.HIGH]: [
      'Lead with care, not performance language',
      'Discuss workload, growth path, and recognition explicitly',
      'Ask if there is anything that would make them reconsider leaving (if hinted)',
      'Identify 1–2 concrete changes you can commit to within 2 weeks',
      'Schedule a follow-up within 14 days',
    ],
    [RISK_CATEGORIES.CRITICAL]: [
      'Bring HR into the loop before the conversation',
      'Lead with empathy: "I want to understand what you’re experiencing"',
      'Discuss compensation, role, manager fit, and growth — directly',
      'Outline specific retention levers your org can offer',
      'Agree on a written follow-up plan with named owners and dates',
    ],
  };

  const interventionByCat = {
    [RISK_CATEGORIES.LOW]: 'Continue regular 1:1 cadence; no specific intervention needed.',
    [RISK_CATEGORIES.MEDIUM]: 'Schedule a manager 1:1 within 2 weeks focused on workload and growth.',
    [RISK_CATEGORIES.HIGH]: 'Manager 1:1 within 5 working days + HR consult; consider workload rebalancing or growth conversation.',
    [RISK_CATEGORIES.CRITICAL]: 'Joint manager + HR conversation within 3 working days; review compensation, role, and manager-fit retention levers.',
  };

  return {
    explanation,
    suggestedManagerAction: recommendedAction,
    suggestedHRIntervention: interventionByCat[category],
    retentionStrategy: interventionByCat[category],
    talkingPoints: talkingPointsByCat[category],
    source: 'static',
  };
}

async function generate({ assessment, employee, recentPulses = [] }) {
  const client = getClient();
  if (!client) return staticOutput(assessment, employee);

  // Minimized payload — no PII beyond role context
  const minimal = {
    role: employee.designation,
    department: employee.departmentName || null,
    workMode: employee.workMode,
    tenureMonths: employee.joiningDate
      ? Math.max(0, Math.round((Date.now() - new Date(employee.joiningDate)) / (1000 * 60 * 60 * 24 * 30)))
      : null,
    riskScore: assessment.riskScore,
    category: assessment.category,
    trend: assessment.trend,
    componentScores: assessment.componentScores,
    topFactors: assessment.topFactors,
    pulseAverages:
      recentPulses.length > 0
        ? {
            mood: avg(recentPulses, 'moodScore'),
            workload: avg(recentPulses, 'workloadScore'),
            managerSupport: avg(recentPulses, 'managerSupportScore'),
            growth: avg(recentPulses, 'growthSatisfactionScore'),
          }
        : null,
  };

  const system = `You are an HR retention advisor for the RetainIQ platform. You produce decision-support guidance — never employment verdicts. Output strict JSON.`;
  const user = `Given this anonymized employee retention-risk assessment, return a JSON object with keys:
- explanation (2-3 sentences, plain professional English)
- suggestedManagerAction (1 sentence)
- suggestedHRIntervention (1 sentence)
- retentionStrategy (1-2 sentences)
- talkingPoints (array of 3-5 short bullet strings for a 1:1)

Assessment: ${JSON.stringify(minimal)}`;

  try {
    const resp = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 600,
    });
    const text = resp.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);
    return {
      explanation: parsed.explanation,
      suggestedManagerAction: parsed.suggestedManagerAction,
      suggestedHRIntervention: parsed.suggestedHRIntervention,
      retentionStrategy: parsed.retentionStrategy,
      talkingPoints: Array.isArray(parsed.talkingPoints) ? parsed.talkingPoints : [],
      source: 'openai',
    };
  } catch (err) {
    console.warn('[ai] OpenAI generation failed, falling back to static:', err.message);
    return staticOutput(assessment, employee);
  }
}

function avg(arr, key) {
  if (!arr.length) return null;
  return parseFloat((arr.reduce((a, x) => a + x[key], 0) / arr.length).toFixed(2));
}

module.exports = { generate };

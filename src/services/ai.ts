import type { PipelineResult } from "../types/pipeline";
import type { AIInsights, AIRiskExplanation, AIRecommendationDetail, AIAnalysisNarrative } from "../types/aiInsights";
import { buildTopMoversFact, buildPredictiveFact } from "../lib/analysis/factSummary";

/* ================================================================
   VERDIO — Stage 12: AI Executive Explanation (generic pipeline)
   Narrates whatever the decision engine and analysis generator
   actually produced for THIS dataset — never assumes anomalies,
   RFM segments, or a specific number of risks exist.
   Never throws — always resolves to a usable AIInsights, falling
   back to text derived from the pipeline's own output on failure.
   ================================================================ */

const PROXY = 'https://sme-bi-copilot-proxy.vercel.app/api/chat';

const SYSTEM_PROMPT = `You are Verdio's AI analysis layer — an experienced business consultant explaining a dataset to a busy, non-technical SME owner. Write like a sharp consultant talking to a client, not like a data scientist writing a report.

HARD RULES ON LANGUAGE:
- Never use statistical jargon (no "coefficient of variation", "z-score", "RFM", "standard deviation", "quartile", "Pearson r"). If a risk or recommendation given to you contains jargon, translate it into a plain consequence a business owner would understand ("your revenue swings unpredictably" not "CV of 42%").
- Every sentence should answer "so what does this mean for my business and what should I do about it".
- Be specific and numerate (real figures, real names, real percentages) — never vague filler like "consider optimising your strategy".
- Write in UK business English, confident and direct, no hedging.

This dataset may not be retail/sales data — do not assume revenue, products or customers exist unless the data provided says so. Use the dataset's own currency symbol if one appears in the figures given, otherwise state plain numbers.

Respond with ONLY raw JSON — no markdown fences, no commentary. Match this shape exactly:

{
  "executiveSummary": string,
  "riskExplanations": [ { "title": string, "impact": string, "action": string } ],
  "recommendations": [ { "title": string, "action": string, "impactEstimate": string, "timeline": string, "priority": "high" | "medium" } ],
  "keyInsights": string[],
  "analysisNarratives": [ { "analysisId": string, "title": string, "narrative": string } ]
}

Rules for each field:
- "executiveSummary": 4-6 sentences a business owner could read in 20 seconds and know exactly where they stand. Structure it as: (1) what the dataset shows overall, (2) the single highest risk, explained in plain English with its real business consequence, (3) if a best-selling product/category/market fact is given, name it explicitly, (4) the one action to take first, (5) the predictive/forecast figure if one is given, framed as "what to expect next" not a raw number.
- "riskExplanations": exactly one entry per risk provided, same order, reusing the exact title. "impact" = plain-English consequence for the business (no jargon), ONE sentence. "action" = one concrete, specific next step, ONE sentence.
- "recommendations": exactly one entry per recommendation provided, same order, reusing the exact title. "action" = specific and doable this week/month, ONE sentence. "impactEstimate" = a short concrete figure or range if the data supports one, otherwise a brief realistic qualitative estimate — never "—" or "N/A", but keep it under 10 words.
- "keyInsights": 4-5 standalone sentences, each naming a specific number, product, market, or trend — this is the "what does the data actually show" section, written for someone skimming. ONE sentence each.
- "analysisNarratives": exactly one entry per analysis provided, same order, reusing the exact analysisId and title — ONE plain-English sentence on what that specific chart shows and why it matters, no chart/statistics terminology.

CRITICAL OUTPUT CONSTRAINT: You have a limited output budget. Every field above says ONE sentence for a reason — stick to it strictly, even if it means being terser than you'd like. It is far better to under-write every field than to run out of space mid-response. NEVER truncate — always output complete, validly-closed JSON. If you are unsure whether you have room to finish, shorten earlier fields further rather than risk cutting off the JSON structure itself.

CRITICAL SYNTAX RULE: This output is parsed with JSON.parse() and nothing else — there is no tolerance for mistakes. EVERY string value, including long paragraph values like "executiveSummary", MUST be wrapped in double quotes exactly like every other JSON string: "executiveSummary": "Your text here." — never "executiveSummary": Your text here. Double-check before responding that every value — short or long — starts and ends with a double quote.`;

function buildPrompt(p: PipelineResult): string {
  const risks = p.decision.risks.map(r => `- [${r.level}] ${r.title}: ${r.desc}`).join('\n') || 'None detected.';
  const recs  = p.decision.recommendations.map(r => `- [${r.impact}] ${r.title}: ${r.desc}`).join('\n') || 'None generated.';
  const analyses = p.analyses.map(a => `- id="${a.id}" title="${a.title}": ${a.explanation}`).join('\n') || 'None generated.';

  return `Analyse this dataset and return the JSON payload described in your system instructions.

DATASET
File: ${p.source.fileName} (${p.source.rowCount} rows)
Data quality score: ${p.quality.overallScore}/100
Health score: ${p.decision.health.total}/100
Detected column roles: ${p.semantics.columns.filter(c => c.businessRole !== 'unknown').map(c => `${c.columnName}=${c.businessRole}`).join(', ') || 'none confidently detected'}

TOP MOVERS (use these facts explicitly in executiveSummary/keyInsights — name the actual product/market):
${buildTopMoversFact(p)}

PREDICTIVE MEASURE (use this explicitly in executiveSummary — this is the forward-looking forecast):
${buildPredictiveFact(p)}

RISKS (produce one riskExplanations entry per line, same order, reuse the exact title — translate any jargon in the description into plain English):
${risks}

RECOMMENDATIONS (produce one recommendations entry per line, same order, reuse the exact title):
${recs}

ANALYSES SHOWN TO THE USER (produce one analysisNarratives entry per line, same order, reuse the exact id and title):
${analyses}`;
}

function asString(v: unknown, fallback = ''): string { return typeof v === 'string' && v.trim() ? v.trim() : fallback; }
function asArray<T>(v: unknown): T[] { return Array.isArray(v) ? v as T[] : []; }

/* Attempts to salvage a truncated JSON response (the model ran out of output budget
   mid-string or mid-array) rather than discarding the whole response. Walks the raw
   text tracking open brackets/quotes, closes whatever was left open, and retries
   parsing. Returns null if the result still isn't valid JSON. */
function repairTruncatedJSON(raw: string): any | null {
  let inString = false;
  let escapeNext = false;
  const stack: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (ch === '\\' && inString) { escapeNext = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }

  if (!stack.length && !inString) return null; // nothing to repair — original error was something else

  let repaired = raw;
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, '');
  for (let i = stack.length - 1; i >= 0; i--) repaired += stack[i] === '{' ? '}' : ']';

  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

/* Different failure mode: the model occasionally omits the opening/closing quotes
   around a long prose value (e.g. `"executiveSummary": The retail sales...` instead
   of `"executiveSummary": "The retail sales..."`). Finds `"key": <unquoted text>`
   patterns — where the value doesn't already start with ", {, [, a digit, -, true,
   false or null — and wraps the value up to the next `"key":` boundary or closing
   bracket in quotes, escaping any characters that would break the resulting string. */
function repairUnquotedStringValues(raw: string): string {
  return raw.replace(
    /("[A-Za-z_][\w]*")\s*:(?!\s*(?:["{\[]|-|\d|true\b|false\b|null\b))\s*([\s\S]*?)(?=,?\s*"[A-Za-z_][\w]*"\s*:|\s*[}\]])/g,
    (match, key, value, offset, str) => {
      const trimmed = value.replace(/,\s*$/, '').trim();
      if (!trimmed) return match;
      const escaped = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
      const rest = str.slice(offset + match.length);
      const needsComma = /^\s*"[A-Za-z_][\w]*"\s*:/.test(rest);
      return `${key}: "${escaped}"${needsComma ? ',' : ''}`;
    }
  );
}

function tryRepairAndParse(clean: string): any | null {
  const attempts = [
    () => JSON.parse(repairUnquotedStringValues(clean)),
    () => repairTruncatedJSON(clean),
    () => repairTruncatedJSON(repairUnquotedStringValues(clean)),
  ];
  for (const attempt of attempts) {
    try {
      const result = attempt();
      if (result) return result;
    } catch { /* try next strategy */ }
  }
  return null;
}

function fallbackInsights(p: PipelineResult): AIInsights {
  const topRisk = p.decision.risks[0];
  const topRec  = p.decision.recommendations[0];
  const topMovers = buildTopMoversFact(p);
  const topMoverLine = topMovers.split('\n')[0];
  const hasTopMover = !topMoverLine.startsWith('No ');
  const predictive = p.ml.forecast ? buildPredictiveFact(p) : '';

  const executiveSummary = [
    `Verdio analysed ${p.source.rowCount.toLocaleString()} rows from "${p.source.fileName}", scoring ${p.decision.health.total}/100 on overall business health with ${p.quality.overallScore}/100 data quality.`,
    topRisk ? `The biggest concern right now is ${topRisk.title.toLowerCase()} — ${topRisk.desc}` : '',
    hasTopMover ? topMoverLine : '',
    topRec ? `The first thing to act on: ${topRec.title.toLowerCase()}.` : '',
    predictive ? predictive : '',
  ].filter(Boolean).join(' ');

  const riskExplanations: AIRiskExplanation[] = p.decision.risks.map(r => ({ title: r.title, impact: r.desc, action: 'See the Recommendations page for the suggested next step.' }));
  const recommendations: AIRecommendationDetail[] = p.decision.recommendations.map(r => ({ title: r.title, action: r.desc, impactEstimate: '—', timeline: '—', priority: r.impact === 'high' ? 'high' : 'medium' }));
  const analysisNarratives: AIAnalysisNarrative[] = p.analyses.map(a => ({ analysisId: a.id, title: a.title, narrative: a.explanation }));

  const keyInsights = [
    hasTopMover ? topMoverLine : '',
    `Data quality scored ${p.quality.overallScore}/100 across ${p.profile.columnCount} columns.`,
    p.decision.health.total ? `Overall business health scored ${p.decision.health.total}/100.` : '',
    predictive || '',
    p.ml.segmentation ? `Churn risk scored ${p.ml.segmentation.churnRiskScore}/100 across ${p.ml.segmentation.segments.length} customers.` : '',
  ].filter(Boolean);

  return { executiveSummary, riskExplanations, recommendations, keyInsights, analysisNarratives };
}

function normalizeInsights(raw: any, p: PipelineResult): AIInsights {
  const fb = fallbackInsights(p);

  const riskExplanations: AIRiskExplanation[] = p.decision.risks.map((r, i) => {
    const src = asArray<any>(raw?.riskExplanations)[i];
    return { title: r.title, impact: asString(src?.impact, fb.riskExplanations[i]?.impact || r.desc), action: asString(src?.action, fb.riskExplanations[i]?.action) };
  });

  const recommendations: AIRecommendationDetail[] = p.decision.recommendations.map((r, i) => {
    const src = asArray<any>(raw?.recommendations)[i];
    return {
      title: r.title,
      action: asString(src?.action, fb.recommendations[i]?.action || r.desc),
      impactEstimate: asString(src?.impactEstimate, fb.recommendations[i]?.impactEstimate || '—'),
      timeline: asString(src?.timeline, fb.recommendations[i]?.timeline || '—'),
      priority: (src?.priority === 'high' || src?.priority === 'medium') ? src.priority : (r.impact === 'high' ? 'high' : 'medium'),
    };
  });

  const analysisNarratives: AIAnalysisNarrative[] = p.analyses.map((a, i) => {
    const src = asArray<any>(raw?.analysisNarratives)[i];
    return { analysisId: a.id, title: a.title, narrative: asString(src?.narrative, fb.analysisNarratives[i]?.narrative || a.explanation) };
  });

  const keyInsights = asArray<string>(raw?.keyInsights).filter(s => typeof s === 'string' && s.trim()).slice(0, 5);

  return {
    executiveSummary: asString(raw?.executiveSummary, fb.executiveSummary),
    riskExplanations, recommendations,
    keyInsights: keyInsights.length ? keyInsights : fb.keyInsights,
    analysisNarratives,
  };
}

export async function generateAIInsights(p: PipelineResult): Promise<AIInsights> {
  try {
    const res = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildPrompt(p) }],
      }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '(could not read response body)');
      console.error(`[Verdio AI] Proxy returned ${res.status} ${res.statusText}. Falling back to offline insights. Response body:`, bodyText);
      return fallbackInsights(p);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') {
      console.error('[Verdio AI] Proxy response had no message content. Falling back to offline insights. Full response:', data);
      return fallbackInsights(p);
    }

    const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
      return normalizeInsights(JSON.parse(clean), p);
    } catch (parseErr) {
      const repaired = tryRepairAndParse(clean);
      if (repaired) {
        console.warn('[Verdio AI] Model output was malformed — repaired and salvaged what was returned. Raw content:', raw);
        return normalizeInsights(repaired, p);
      }
      console.error('[Verdio AI] Failed to parse model output as JSON, and repair also failed. Falling back to offline insights. Raw content:', raw, parseErr);
      return fallbackInsights(p);
    }
  } catch (err) {
    console.error('[Verdio AI] Network/fetch error calling proxy. Falling back to offline insights.', err);
    return fallbackInsights(p);
  }
}

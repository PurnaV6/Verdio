import type { PipelineResult } from "../types/pipeline";
import type { AIInsights } from "../types/aiInsights";
import { buildAdvisorContext } from "../lib/analysis/factSummary";
import { getSupabase } from "../lib/auth/supabaseClient";

const PROXY = '/api/chat';
const CONTEXT_LIMIT = 12000;
const CONTEXT_LINE_LIMIT = 1500;

export type AssistantOutcome =
  | { ok: true; result: string }
  | { ok: false; reason: 'no-session' | 'limit' | 'busy' | 'error' };

/** Short plain notices shown next to the built-in answer when the assistant cannot be used. */
export const ASSISTANT_NOTICES = {
  limit: 'The AI assistant limit has been reached for now, so this is a built-in answer.',
  busy: 'The AI assistant is busy right now, so this is a built-in answer.',
} as const;

// Same per-line and total caps as the server, so a long line cannot push the risks and charts out of the request.
function fitContext(context: string): string {
  return context.split('\n').map(line => line.slice(0, CONTEXT_LINE_LIMIT)).join('\n').slice(0, CONTEXT_LIMIT);
}

/**
 * Calls the hardened /api/chat route with the signed-in user's access token.
 * Without a session (the no-login demo) nothing is sent: callers use their built-in behaviour.
 * On 401/403/429/503 the call is not repeated.
 */
export async function askAssistant(task: 'advisor' | 'insights', context: string, question?: string): Promise<AssistantOutcome> {
  try {
    const sb = getSupabase();
    const token = sb ? (await sb.auth.getSession()).data.session?.access_token : undefined;
    if (!token) return { ok: false, reason: 'no-session' };
    const res = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ task, ...(question ? { question } : {}), history: [], context: fitContext(context) }),
    });
    if (res.status === 429) return { ok: false, reason: 'limit' };
    if (res.status === 503) return { ok: false, reason: 'busy' };
    if (!res.ok) return { ok: false, reason: 'error' };
    const data = await res.json();
    return typeof data?.result === 'string' && data.result.trim() ? { ok: true, result: data.result } : { ok: false, reason: 'error' };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

function fallback(p: PipelineResult): AIInsights {
  return {
    executiveSummary: `Analysed ${p.source.rowCount} rows, ${p.profile.columnCount} cols, health ${p.decision.health.total}/100, quality ${p.quality.overallScore}/100.`,
    riskExplanations: p.decision.risks.map(r=>({title:r.title, impact:r.desc.slice(0,150), action:'See Risk Detection page for mitigation.'})),
    recommendations: p.decision.recommendations.map(r=>({title:r.title, action:r.desc.slice(0,150), impactEstimate:r.impact, timeline:'This month', priority:'high' as any})),
    keyInsights: [`${p.source.rowCount} rows`, `Health ${p.decision.health.total}`, `Quality ${p.quality.overallScore}`, `${p.analyses.length} charts`],
    analysisNarratives: p.analyses.map(a=>({analysisId:a.id, title:a.title, narrative:a.explanation.slice(0,200)}))
  };
}

export async function generateAIInsights(p: PipelineResult): Promise<AIInsights> {
  try {
    const outcome = await askAssistant('insights', buildAdvisorContext(p));
    if(!outcome.ok) throw new Error(outcome.reason);
    const raw = outcome.result.trim().replace(/^```json/i,'').replace(/^```/,'').replace(/```$/,'').trim();
    let parsed:any;
    try{ parsed=JSON.parse(raw); } catch {
      // Try to repair truncated
      const lastBrace = raw.lastIndexOf('}');
      if(lastBrace>0) { try{ parsed=JSON.parse(raw.slice(0,lastBrace+1)); }catch{ parsed=null; } }
      if(!parsed) throw new Error('parse');
    }
    return {
      executiveSummary: parsed.executiveSummary || fallback(p).executiveSummary,
      riskExplanations: parsed.riskExplanations || fallback(p).riskExplanations,
      recommendations: parsed.recommendations || fallback(p).recommendations,
      keyInsights: parsed.keyInsights || fallback(p).keyInsights,
      analysisNarratives: parsed.analysisNarratives || fallback(p).analysisNarratives,
    };
  } catch(e){
    console.warn('AI fallback', e);
    return fallback(p);
  }
}

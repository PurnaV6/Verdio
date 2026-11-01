import type { PipelineResult } from "../types/pipeline";
import type { AIInsights } from "../types/aiInsights";
import { buildAdvisorContext } from "../lib/analysis/factSummary";
import { getSupabase } from "../lib/auth/supabaseClient";
import { noticeFor, type AssistantFailureReason } from "./aiNotice";

const PROXY = '/api/chat';
const CONTEXT_LIMIT = 12000;
const CONTEXT_LINE_LIMIT = 1500;

export type AssistantOutcome =
  | { ok: true; result: string }
  | { ok: false; reason: AssistantFailureReason; retryAfterSeconds?: number };

const REQUEST_TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 2000;
const RETRY_JITTER_MS = 500;

// Same per-line and total caps as the server, so a long line cannot push the risks and charts out of the request.
function fitContext(context: string): string {
  return context.split('\n').map(line => line.slice(0, CONTEXT_LINE_LIMIT)).join('\n').slice(0, CONTEXT_LIMIT);
}

/** One HTTP attempt. `code` is the server's stable code, kept so the caller can decide on a retry. */
type Attempt =
  | { ok: true; result: string }
  | { ok: false; reason: AssistantFailureReason; code?: string; status?: number; retryAfterSeconds?: number };

const BY_CODE: Record<string, AssistantFailureReason> = {
  too_fast: 'too-fast', daily_limit: 'limit', global_limit: 'busy', busy: 'busy',
  sign_in: 'sign-in', not_allowed: 'not-allowed', unavailable: 'unavailable', bad_request: 'error',
};

// Used only when an older server answers without a code.
function reasonForStatus(status: number): AssistantFailureReason {
  if (status === 401) return 'sign-in';
  if (status === 403) return 'not-allowed';
  if (status === 429) return 'limit';
  if (status === 503) return 'busy';
  if (status === 502) return 'unavailable';
  return 'error';
}

async function attempt(body: string, token: string): Promise<Attempt> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      return typeof data?.result === 'string' && data.result.trim() ? { ok: true, result: data.result } : { ok: false, reason: 'error' };
    }
    const code = typeof data?.code === 'string' ? data.code : undefined;
    const reason = (code && BY_CODE[code]) || reasonForStatus(res.status);
    const seconds = Number(data?.retryAfterSeconds);
    return { ok: false, reason, code, status: res.status, ...(reason === 'too-fast' && seconds > 0 ? { retryAfterSeconds: seconds } : {}) };
  } catch {
    return { ok: false, reason: timedOut ? 'timeout' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Calls the hardened /api/chat route with the signed-in user's access token.
 * Without a session (the no-login demo) nothing is sent: callers use their built-in behaviour.
 * Failures are reported with a reason the UI can explain. Recovery:
 *  - a 401 refreshes the Supabase session once and retries once, then reports 'sign-in';
 *  - a server 'busy' code or a 30 second timeout is retried once after about 2 seconds;
 *  - quota and sign-in codes are never retried.
 */
export async function askAssistant(task: 'advisor' | 'insights', context: string, question?: string): Promise<AssistantOutcome> {
  try {
    const sb = getSupabase();
    let token = sb ? (await sb.auth.getSession()).data.session?.access_token : undefined;
    if (!sb || !token) return { ok: false, reason: 'no-session' };
    const body = JSON.stringify({ task, ...(question ? { question } : {}), history: [], context: fitContext(context) });

    let result = await attempt(body, token);
    if (!result.ok && result.status === 401) {
      token = (await sb.auth.refreshSession()).data.session?.access_token;
      if (!token) return { ok: false, reason: 'sign-in' };
      result = await attempt(body, token);
      if (!result.ok && result.status === 401) return { ok: false, reason: 'sign-in' };
    }
    if (!result.ok && (result.code === 'busy' || result.reason === 'timeout')) {
      await sleep(RETRY_DELAY_MS + Math.random() * RETRY_JITTER_MS);
      result = await attempt(body, token);
    }
    if (result.ok) return result;
    return { ok: false, reason: result.reason, ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}) };
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
    if(!outcome.ok) return { ...fallback(p), source: 'built-in', notice: noticeFor(outcome.reason, outcome.retryAfterSeconds) };
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
      source: 'ai',
    };
  } catch(e){
    console.warn('AI fallback', e);
    return { ...fallback(p), source: 'built-in', notice: noticeFor('error') };
  }
}

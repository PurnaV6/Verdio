// POST /api/chat - the only route that talks to the AI provider.
//
// Hardening, in the order it is applied:
//   1. CORS allow-list (APP_ORIGINS or same-origin); anything else gets 403.
//   2. A signed-in user is required: the Supabase access token is verified with the
//      user's own token + anon key (the service-role key is never used on this path).
//   3. Strict request shape. The browser sends a question, short history and the data
//      context of its own file. It never sends a system prompt, messages or max_tokens;
//      the server builds the prompt and sets the token limit.
//   4. Cheap pre-check for override / off-topic / other-user requests, before any tokens are spent.
//   5. Per-user and global daily quota, atomically in Postgres via consume_ai_quota.
//   6. Provider call through the neutral adapter, then an output scrub.
// Isolation: the model has no tools or database access, the server never queries user data
// for the AI, nothing is stored server-side about a conversation, and prompts and replies
// are never logged.

import { createHash } from 'node:crypto';
import { aiConfig, getProvider, ProviderError } from './_lib/aiProvider.js';
import { buildMessages, screenText } from './_lib/prompts.js';

const LIMITS = { question: 500, historyTurns: 6, historyContent: 1000, context: 12000 };
const MAX_TOKENS = { advisor: 500, insights: 1800 };
const MAX_ANSWER_CHARS = { advisor: 2500, insights: 14000 };
const DAILY_DEFAULTS = {
  advisor: { user: 20, global: 400, userEnv: 'AI_ADVISOR_DAILY_LIMIT', globalEnv: 'AI_GLOBAL_ADVISOR_DAILY_LIMIT' },
  insights: { user: 5, global: 60, userEnv: 'AI_INSIGHTS_DAILY_LIMIT', globalEnv: 'AI_GLOBAL_INSIGHTS_DAILY_LIMIT' },
};
const MIN_GAP_SECONDS = 3;
const SUPABASE_TIMEOUT_MS = 5000;
const ALLOWED_KEYS = new Set(['task', 'question', 'history', 'context']);
const DROPPED_ROLES = new Set(['system', 'developer', 'tool']);

// Secondary burst guard ONLY. On serverless every instance has its own memory and instances
// are recycled, so this cannot enforce a limit; the Postgres quota (consume_ai_quota) does.
const lastCallByUser = new Map();

export function resetBurstGuard() { lastCallByUser.clear(); }

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hashUser(userId) {
  return createHash('sha256').update(String(userId)).digest('hex').slice(0, 12);
}

function secondsUntilUtcMidnight() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

// ---- CORS -----------------------------------------------------------------

function originAllowed(req) {
  const origin = req.headers?.origin;
  if (!origin) return { origin: null, allowed: true };
  const listed = (process.env.APP_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
  if (listed.includes(origin)) return { origin, allowed: true };
  try {
    if (req.headers.host && new URL(origin).host === req.headers.host) return { origin, allowed: true };
  } catch { /* malformed Origin: not allowed */ }
  return { origin, allowed: false };
}

// ---- request validation ----------------------------------------------------

function parseBody(raw) {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return raw;
}

/** Returns { value } or { error }. Drops system/developer/tool history turns; rejects everything else unexpected. */
function validate(raw) {
  const body = parseBody(raw);
  if (!isPlainObject(body)) return { error: true };
  if (Object.keys(body).some(key => !ALLOWED_KEYS.has(key))) return { error: true };
  const { task, question, history, context } = body;
  if (task !== 'advisor' && task !== 'insights') return { error: true };
  if (typeof context !== 'string' || !context.trim() || context.length > LIMITS.context) return { error: true };

  if (question !== undefined && (typeof question !== 'string' || question.length > LIMITS.question)) return { error: true };
  if (task === 'advisor' && !(typeof question === 'string' && question.trim())) return { error: true };

  let turns = [];
  if (history !== undefined) {
    if (!Array.isArray(history) || history.length > LIMITS.historyTurns) return { error: true };
    for (const turn of history) {
      if (!isPlainObject(turn) || typeof turn.role !== 'string') return { error: true };
      if (DROPPED_ROLES.has(turn.role)) continue;
      if (turn.role !== 'user' && turn.role !== 'assistant') return { error: true };
      if (Object.keys(turn).some(key => key !== 'role' && key !== 'content')) return { error: true };
      if (typeof turn.content !== 'string' || turn.content.length > LIMITS.historyContent) return { error: true };
      turns.push({ role: turn.role, content: turn.content });
    }
  }
  // Forged earlier user turns that look like overrides are discarded; the conversation must start with a user turn.
  turns = turns.filter(turn => turn.role !== 'user' || screenText(turn.content) === null);
  while (turns.length && turns[0].role !== 'user') turns.shift();

  return { value: { task, question: (question || '').trim(), history: task === 'advisor' ? turns : [], context } };
}

// ---- output scrub ----------------------------------------------------------

const URL_PATTERN = /https?:\/\/|\bwww\./i;

/** Returns the cleaned answer, or null when it must not be shown (caller sends the fallback signal). */
function scrubAnswer(task, text) {
  let out = String(text ?? '').trim();
  if (task === 'insights') out = out.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!out || out.includes('```') || URL_PATTERN.test(out)) return null;
  if (out.length > MAX_ANSWER_CHARS[task]) {
    if (task === 'insights') return null;
    out = `${out.slice(0, MAX_ANSWER_CHARS[task]).trimEnd()}...`;
  }
  return out;
}

// ---- Supabase (user's own token + anon key) --------------------------------

async function verifyUser(supabaseUrl, anonKey, jwt) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` },
    signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('auth unavailable');
  const user = await response.json();
  return typeof user?.id === 'string' && user.id ? user : null;
}

async function consumeQuota(supabaseUrl, anonKey, jwt, task) {
  const defaults = DAILY_DEFAULTS[task];
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_ai_quota`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_kind: task,
      p_user_max: intFromEnv(defaults.userEnv, defaults.user),
      p_global_max: intFromEnv(defaults.globalEnv, defaults.global),
      p_min_gap_seconds: MIN_GAP_SECONDS,
    }),
    signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('quota unavailable');
  return response.json();
}

// ---- handler ---------------------------------------------------------------

export default async function handler(req, res) {
  const started = Date.now();
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  const { origin, allowed } = originAllowed(req);
  if (allowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') return allowed ? res.status(204).end() : res.status(403).json({ error: 'Forbidden' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed, use POST' });
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });

  let userHash = null;
  let task = null;
  // Fixed error strings only. Logs: hashed user id, status, token counts, latency. Never prompts or replies.
  const finish = (status, body, extra = {}) => {
    console.log(JSON.stringify({ event: 'ai_chat', user: userHash, task, status, latencyMs: Date.now() - started, ...extra }));
    return res.status(status).json(body);
  };
  const busy = () => finish(503, { error: 'Assistant busy', fallback: true });

  const jwt = /^Bearer\s+(\S+)$/i.exec(req.headers?.authorization || '')?.[1];
  if (!jwt) return finish(401, { error: 'Sign in to use the assistant' });

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.error('AI chat: Supabase URL or anon key not configured');
    return busy();
  }

  let user;
  try { user = await verifyUser(supabaseUrl, anonKey, jwt); } catch { return busy(); }
  if (!user) return finish(401, { error: 'Sign in to use the assistant' });
  userHash = hashUser(user.id);

  const checked = validate(req.body);
  if (checked.error) return finish(400, { error: 'Invalid request' });
  const request = checked.value;
  task = request.task;

  // Cheap pre-check: refuse before any quota or tokens are spent. Insights ignore the question.
  if (task === 'advisor') {
    const refusal = screenText(request.question);
    if (refusal) return finish(200, { result: refusal, source: 'ai' }, { refused: true });
  }

  const provider = getProvider(aiConfig());
  if (!provider) {
    console.error('AI chat: provider not configured');
    return busy();
  }

  const gapMs = Number.parseInt(process.env.AI_BURST_GAP_MS ?? '', 10);
  const burstGapMs = Number.isFinite(gapMs) && gapMs >= 0 ? gapMs : 1000;
  const lastCall = lastCallByUser.get(user.id);
  if (burstGapMs > 0 && lastCall !== undefined && started - lastCall < burstGapMs) {
    res.setHeader('Retry-After', String(MIN_GAP_SECONDS));
    return finish(429, { error: 'Please wait a moment' });
  }
  lastCallByUser.set(user.id, started);
  if (lastCallByUser.size > 2000) lastCallByUser.clear();

  let quota;
  try { quota = await consumeQuota(supabaseUrl, anonKey, jwt, task); } catch { return busy(); }
  if (quota === 'too_fast') {
    res.setHeader('Retry-After', String(MIN_GAP_SECONDS));
    return finish(429, { error: 'Please wait a moment' });
  }
  if (quota === 'user_limit') {
    res.setHeader('Retry-After', String(secondsUntilUtcMidnight()));
    return finish(429, { error: 'Daily limit reached' });
  }
  if (quota === 'global_limit') return busy();
  if (quota !== 'ok') return busy();

  let completion;
  try {
    const { system, messages } = buildMessages(request);
    completion = await provider.complete({ system, messages, maxTokens: MAX_TOKENS[task] });
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'busy') return busy();
    return finish(502, { error: 'Assistant unavailable', fallback: true });
  }

  const usage = { inputTokens: completion.usage?.inputTokens, outputTokens: completion.usage?.outputTokens };
  const result = scrubAnswer(task, completion.text);
  if (result === null) return finish(502, { error: 'Assistant unavailable', fallback: true }, usage);
  return finish(200, { result, source: 'ai' }, usage);
}

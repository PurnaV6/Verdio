// Provider-neutral AI adapter. Every provider exposes:
//   complete({ system, messages, maxTokens }) -> { text, usage?, model? }
// and throws ProviderError on failure. Provider messages and objects never
// leave this module: callers only see ProviderError.kind, .reason and .status.
//
// AI_MODEL (one model) or AI_MODELS (comma-separated, takes precedence) sets an ordered model
// chain. A model the provider reports as gone is skipped for this request and remembered as
// dead for the life of the instance; rate limits and 5xx never advance the chain.
//
// AI_PROVIDER selects the provider:
//   openai-compatible (default) - the `openai` SDK; Groq when GROQ_API_KEY is set, otherwise OpenAI
//   anthropic                   - plain fetch to the Messages API (ANTHROPIC_API_KEY), no extra dependency
//   mock                        - canned answers for tests; refused on production deployments

import OpenAI from 'openai';

const PROVIDER_TIMEOUT_MS = 25000;
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const GROQ_DEFAULT_MODELS = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
// Reasoning models spend hidden tokens against the output limit, so they get headroom on top of
// the visible limit. The visible answer is still capped by the caller's scrub and length limits.
const REASONING_MODEL_PREFIX = 'openai/gpt-oss';
const REASONING_HEADROOM_TOKENS = 1500;

/**
 * kind 'busy': provider rate limit, 5xx or timeout. kind 'unavailable': anything else.
 * reason is for server logs only and never shown to users: provider_rate_limited |
 * provider_model_unavailable | provider_error | provider_empty_reply.
 * status is the HTTP status number when there was one.
 */
export class ProviderError extends Error {
  constructor(kind, reason, status, model) {
    super(kind === 'busy' ? 'AI provider busy' : 'AI provider unavailable');
    this.name = 'ProviderError';
    this.kind = kind;
    this.reason = reason || (kind === 'busy' ? 'provider_rate_limited' : 'provider_error');
    if (typeof status === 'number') this.status = status;
    if (model) this.model = model;
  }
}

function kindForStatus(status) {
  return status === 429 || (typeof status === 'number' && status >= 500) ? 'busy' : 'unavailable';
}

function reasonForStatus(status) {
  return status === 429 ? 'provider_rate_limited' : 'provider_error';
}

// Models the provider has said are gone. Lives as long as the serverless instance.
const deadModels = new Set();
const deadKey = (config, model) => `${config.baseURL || config.provider}|${model}`;

export function resetDeadModels() { deadModels.clear(); }

export function isReasoningModel(model) {
  return String(model).startsWith(REASONING_MODEL_PREFIX);
}

/** True when a provider error means "this model id does not exist / was retired". */
function modelIsGone(error) {
  if (error?.status === 404) return true;
  if (error?.status !== 400 && error?.status !== 410) return false;
  const code = String(error?.code ?? error?.error?.code ?? error?.error?.error?.code ?? '');
  if (/model_(not_found|decommissioned|deprecated|not_supported|retired)/i.test(code)) return true;
  const message = String(error?.error?.message ?? error?.message ?? '');
  return /model[^.]{0,80}(not found|does not exist|decommission|deprecat|no longer (supported|available)|retired)/i.test(message);
}

/** AI_MODELS (comma-separated) wins over AI_MODEL; otherwise the provider's default chain. */
function modelChain(env, defaults) {
  const listed = (env.AI_MODELS || '').split(',').map(item => item.trim()).filter(Boolean);
  const chain = listed.length ? listed : env.AI_MODEL?.trim() ? [env.AI_MODEL.trim()] : defaults;
  return [...new Set(chain)];
}

/** Shared by getProvider() and api/health.js so both agree on provider, key and models. `model` is the first of `models`. */
export function aiConfig(env = process.env) {
  const provider = (env.AI_PROVIDER || 'openai-compatible').toLowerCase();
  if (provider === 'anthropic') {
    const models = modelChain(env, ['claude-haiku-5-5']);
    return {
      provider,
      apiKey: env.ANTHROPIC_API_KEY,
      apiKeyName: env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY' : null,
      model: models[0],
      models,
      modelUrl: 'https://api.anthropic.com/v1/models',
    };
  }
  if (provider === 'mock') {
    return { provider, apiKey: env.VERCEL_ENV === 'production' ? undefined : 'mock', apiKeyName: null, model: 'mock', models: ['mock'] };
  }
  const apiKey = env.GROQ_API_KEY || env.OPENAI_API_KEY;
  const groq = Boolean(env.GROQ_API_KEY) || apiKey?.startsWith('gsk_');
  const models = modelChain(env, groq ? GROQ_DEFAULT_MODELS : ['gpt-4o-mini']);
  return {
    provider: 'openai-compatible',
    apiKey,
    apiKeyName: env.GROQ_API_KEY ? 'GROQ_API_KEY' : env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : null,
    model: models[0],
    models,
    baseURL: groq ? GROQ_BASE_URL : undefined,
    modelUrl: groq ? `${GROQ_BASE_URL}/models` : 'https://api.openai.com/v1/models',
  };
}

/** Request for the provider reachability check in api/health.js; null when there is nothing to call. */
export function aiHealthTarget(config = aiConfig()) {
  if (!config.apiKey || config.provider === 'mock') return null;
  const url = `${config.modelUrl}/${config.model.split('/').map(encodeURIComponent).join('/')}`;
  const headers = config.provider === 'anthropic'
    ? { 'x-api-key': config.apiKey, 'anthropic-version': ANTHROPIC_VERSION }
    : { Authorization: `Bearer ${config.apiKey}` };
  return { url, headers };
}

function openAICompatibleProvider(config) {
  async function callModel(model, { system, messages, maxTokens }) {
    try {
      const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, maxRetries: 0, timeout: PROVIDER_TIMEOUT_MS });
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        ...(isReasoningModel(model)
          ? { max_completion_tokens: maxTokens + REASONING_HEADROOM_TOKENS, reasoning_effort: 'low', include_reasoning: false }
          : { max_tokens: maxTokens }),
        temperature: 0.3,
      });
      const text = completion?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw new ProviderError('unavailable', 'provider_empty_reply', undefined, model);
      return {
        text,
        model,
        usage: { inputTokens: completion.usage?.prompt_tokens, outputTokens: completion.usage?.completion_tokens },
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      // SDK errors carry .status for HTTP failures; connection errors and timeouts do not.
      const status = typeof error?.status === 'number' ? error.status : undefined;
      if (modelIsGone(error)) throw new ProviderError('unavailable', 'provider_model_unavailable', status, model);
      if (status === undefined) throw new ProviderError('busy', 'provider_error', undefined, model);
      throw new ProviderError(kindForStatus(status), reasonForStatus(status), status, model);
    }
  }

  return {
    async complete(input) {
      const chain = config.models.filter(model => !deadModels.has(deadKey(config, model)));
      let lastError = new ProviderError('unavailable', 'provider_model_unavailable');
      let emptyAdvanced = false;
      for (const model of chain) {
        try {
          return await callModel(model, input);
        } catch (error) {
          lastError = error;
          if (error.reason === 'provider_model_unavailable') {
            deadModels.add(deadKey(config, model));
            continue;
          }
          // An empty visible reply (a reasoning model can spend its whole budget thinking): try the next model once.
          if (error.reason === 'provider_empty_reply' && !emptyAdvanced) {
            emptyAdvanced = true;
            continue;
          }
          throw error;
        }
      }
      throw lastError;
    },
  };
}

function anthropicProvider(config) {
  return {
    async complete({ system, messages, maxTokens }) {
      let response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
          body: JSON.stringify({ model: config.model, max_tokens: maxTokens, temperature: 0.3, system, messages }),
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
      } catch {
        throw new ProviderError('busy', 'provider_error');
      }
      if (!response.ok) throw new ProviderError(kindForStatus(response.status), reasonForStatus(response.status), response.status);
      let data;
      try { data = await response.json(); } catch { throw new ProviderError('unavailable', 'provider_error'); }
      const text = (data?.content || []).filter(part => part?.type === 'text').map(part => part.text).join('');
      if (!text.trim()) throw new ProviderError('unavailable', 'provider_empty_reply');
      return { text, model: config.model, usage: { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens } };
    },
  };
}

// ---- mock provider (tests only) ------------------------------------------
// AI_MOCK_MODE: grounded (default) | off-topic | injection-following | throws | busy
// `mockProviderState.calls` records exactly what the provider was given, so tests
// can assert what did and did not reach the model.
export const mockProviderState = { calls: [] };

const MOCK_INSIGHTS = JSON.stringify({
  executiveSummary: 'Revenue is steady and health is 72/100.',
  riskExplanations: [{ title: 'Customer concentration', impact: 'Top customer is 41% of revenue.', action: 'Add two mid-sized accounts.' }],
  recommendations: [{ title: 'Diversify customers', action: 'Target two new accounts.', impactEstimate: 'Lower concentration risk', timeline: 'This quarter', priority: 'high' }],
  keyInsights: ['Health 72/100'],
  analysisNarratives: [],
});

function mockProvider() {
  return {
    async complete({ system, messages, maxTokens }) {
      mockProviderState.calls.push({ system, messages, maxTokens });
      const mode = process.env.AI_MOCK_MODE || 'grounded';
      const insights = /valid JSON only/i.test(system);
      if (mode === 'throws') throw new ProviderError('unavailable', 'provider_error', 500);
      if (mode === 'busy') throw new ProviderError('busy', 'provider_rate_limited', 429);
      const usage = { inputTokens: 10, outputTokens: 20 };
      if (mode === 'off-topic') return { text: "I can only help with your uploaded file and with using Verd.io, so I can't help with that.", usage };
      if (mode === 'injection-following') {
        return { text: insights ? '```json\n{"executiveSummary":"see https://evil.example"}\n```' : 'Sure! ```print("hi")``` See https://evil.example for more.', usage };
      }
      return { text: insights ? MOCK_INSIGHTS : 'Your biggest risk is customer concentration: the top customer is 41% of revenue. Next action: add two mid-sized accounts. [CHART:revenue_trend]', usage };
    },
  };
}

/** Returns a provider, or null when the selected provider has no key / is not allowed. */
export function getProvider(config = aiConfig()) {
  if (!config.apiKey) return null;
  if (config.provider === 'mock') return mockProvider();
  if (config.provider === 'anthropic') return anthropicProvider(config);
  return openAICompatibleProvider(config);
}

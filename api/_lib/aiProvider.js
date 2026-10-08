// Provider-neutral AI adapter. Every provider exposes:
//   complete({ system, messages, maxTokens }) -> { text, usage? }
// and throws ProviderError on failure. Provider messages and objects never
// leave this module: callers only see ProviderError.kind.
//
// AI_PROVIDER selects the provider:
//   openai-compatible (default) - the `openai` SDK; Groq when GROQ_API_KEY is set, otherwise OpenAI
//   anthropic                   - plain fetch to the Messages API (ANTHROPIC_API_KEY), no extra dependency
//   mock                        - canned answers for tests; refused on production deployments

import OpenAI from 'openai';

const PROVIDER_TIMEOUT_MS = 25000;
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const ANTHROPIC_VERSION = '2023-06-01';

/** kind 'busy': provider rate limit, 5xx or timeout. kind 'unavailable': anything else. */
export class ProviderError extends Error {
  constructor(kind) {
    super(kind === 'busy' ? 'AI provider busy' : 'AI provider unavailable');
    this.name = 'ProviderError';
    this.kind = kind;
  }
}

function kindForStatus(status) {
  return status === 429 || (typeof status === 'number' && status >= 500) ? 'busy' : 'unavailable';
}

/** Shared by getProvider() and api/health.js so both agree on provider, key and model. */
export function aiConfig(env = process.env) {
  const provider = (env.AI_PROVIDER || 'openai-compatible').toLowerCase();
  if (provider === 'anthropic') {
    return {
      provider,
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.AI_MODEL || 'claude-haiku-5-5',
      modelUrl: 'https://api.anthropic.com/v1/models',
    };
  }
  if (provider === 'mock') {
    return { provider, apiKey: env.VERCEL_ENV === 'production' ? undefined : 'mock', model: 'mock' };
  }
  const apiKey = env.GROQ_API_KEY || env.OPENAI_API_KEY;
  const groq = Boolean(env.GROQ_API_KEY) || apiKey?.startsWith('gsk_');
  return {
    provider: 'openai-compatible',
    apiKey,
    model: env.AI_MODEL || (groq ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'),
    baseURL: groq ? GROQ_BASE_URL : undefined,
    modelUrl: groq ? `${GROQ_BASE_URL}/models` : 'https://api.openai.com/v1/models',
  };
}

/** Request for the provider reachability check in api/health.js; null when there is nothing to call. */
export function aiHealthTarget(config = aiConfig()) {
  if (!config.apiKey || config.provider === 'mock') return null;
  const url = `${config.modelUrl}/${encodeURIComponent(config.model)}`;
  const headers = config.provider === 'anthropic'
    ? { 'x-api-key': config.apiKey, 'anthropic-version': ANTHROPIC_VERSION }
    : { Authorization: `Bearer ${config.apiKey}` };
  return { url, headers };
}

function openAICompatibleProvider(config) {
  return {
    async complete({ system, messages, maxTokens }) {
      try {
        const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, maxRetries: 0, timeout: PROVIDER_TIMEOUT_MS });
        const completion = await client.chat.completions.create({
          model: config.model,
          messages: [{ role: 'system', content: system }, ...messages],
          max_tokens: maxTokens,
          temperature: 0.3,
        });
        const text = completion?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) throw new ProviderError('unavailable');
        return {
          text,
          usage: { inputTokens: completion.usage?.prompt_tokens, outputTokens: completion.usage?.completion_tokens },
        };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        // SDK errors carry .status for HTTP failures; connection errors and timeouts do not.
        throw new ProviderError(typeof error?.status === 'number' ? kindForStatus(error.status) : 'busy');
      }
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
        throw new ProviderError('busy');
      }
      if (!response.ok) throw new ProviderError(kindForStatus(response.status));
      let data;
      try { data = await response.json(); } catch { throw new ProviderError('unavailable'); }
      const text = (data?.content || []).filter(part => part?.type === 'text').map(part => part.text).join('');
      if (!text.trim()) throw new ProviderError('unavailable');
      return { text, usage: { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens } };
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
      if (mode === 'throws') throw new ProviderError('unavailable');
      if (mode === 'busy') throw new ProviderError('busy');
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

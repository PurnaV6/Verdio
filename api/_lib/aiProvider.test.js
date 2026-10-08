import { afterEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();
vi.mock('openai', () => ({
  default: class FakeOpenAI {
    constructor(options) { FakeOpenAI.lastOptions = options; this.chat = { completions: { create: createMock } }; }
  },
}));

const { aiConfig, aiHealthTarget, getProvider, ProviderError } = await import('./aiProvider.js');
const OpenAI = (await import('openai')).default;

afterEach(() => { vi.unstubAllGlobals(); createMock.mockReset(); });

const input = { system: 'SYS', messages: [{ role: 'user', content: 'hello' }], maxTokens: 300 };

describe('aiConfig', () => {
  it('defaults to openai-compatible and picks Groq when GROQ_API_KEY is set', () => {
    const config = aiConfig({ GROQ_API_KEY: 'k' });
    expect(config).toMatchObject({ provider: 'openai-compatible', model: 'llama-3.3-70b-versatile', baseURL: 'https://api.groq.com/openai/v1' });
  });

  it('uses OpenAI defaults for an OpenAI key and honours AI_MODEL', () => {
    expect(aiConfig({ OPENAI_API_KEY: 'k' })).toMatchObject({ model: 'gpt-4o-mini', baseURL: undefined });
    expect(aiConfig({ OPENAI_API_KEY: 'k', AI_MODEL: 'custom' }).model).toBe('custom');
  });

  it('configures anthropic from ANTHROPIC_API_KEY with the default model', () => {
    expect(aiConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).toMatchObject({ provider: 'anthropic', apiKey: 'k', model: 'claude-haiku-5-5' });
  });

  it('refuses the mock provider on a production deployment', () => {
    expect(getProvider(aiConfig({ AI_PROVIDER: 'mock' }))).not.toBeNull();
    expect(getProvider(aiConfig({ AI_PROVIDER: 'mock', VERCEL_ENV: 'production' }))).toBeNull();
  });

  it('returns no provider when there is no key', () => {
    expect(getProvider(aiConfig({}))).toBeNull();
    expect(getProvider(aiConfig({ AI_PROVIDER: 'anthropic' }))).toBeNull();
  });
});

describe('aiHealthTarget', () => {
  it('builds the reachability request per provider and is null when unconfigured', () => {
    expect(aiHealthTarget(aiConfig({}))).toBeNull();
    expect(aiHealthTarget(aiConfig({ AI_PROVIDER: 'mock' }))).toBeNull();
    expect(aiHealthTarget(aiConfig({ GROQ_API_KEY: 'k' }))).toEqual({
      url: 'https://api.groq.com/openai/v1/models/llama-3.3-70b-versatile', headers: { Authorization: 'Bearer k' },
    });
    expect(aiHealthTarget(aiConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).headers['x-api-key']).toBe('k');
  });
});

describe('openai-compatible provider', () => {
  const provider = () => getProvider(aiConfig({ GROQ_API_KEY: 'k' }));

  it('sends the system prompt first, passes the token cap and disables SDK retries', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 5, completion_tokens: 7 } });
    const result = await provider().complete(input);
    expect(result).toEqual({ text: 'hi', usage: { inputTokens: 5, outputTokens: 7 } });
    const args = createMock.mock.calls[0][0];
    expect(args.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(args.max_tokens).toBe(300);
    expect(OpenAI.lastOptions.maxRetries).toBe(0);
  });

  it.each([[429, 'busy'], [503, 'busy'], [400, 'unavailable'], [401, 'unavailable'], [undefined, 'busy']])(
    'maps provider status %s to %s without leaking the provider message', async (status, kind) => {
      createMock.mockRejectedValue(Object.assign(new Error('Rate limit for model llama on org org_123'), { status }));
      const error = await provider().complete(input).catch(e => e);
      expect(error).toBeInstanceOf(ProviderError);
      expect(error.kind).toBe(kind);
      expect(error.message).not.toContain('org_123');
    });

  it('treats an empty completion as unavailable', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: '' } }] });
    expect((await provider().complete(input).catch(e => e)).kind).toBe('unavailable');
  });
});

describe('anthropic provider', () => {
  const provider = () => getProvider(aiConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'anthropic-test-value' }));

  it('calls the Messages API with fetch and returns text and usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'hello' }], usage: { input_tokens: 3, output_tokens: 4 } }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await provider().complete(input);
    expect(result).toEqual({ text: 'hello', usage: { inputTokens: 3, outputTokens: 4 } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('anthropic-test-value');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ model: 'claude-haiku-5-5', max_tokens: 300, system: 'SYS', messages: input.messages });
  });

  it.each([[429, 'busy'], [529, 'busy'], [400, 'unavailable'], [401, 'unavailable']])('maps HTTP %s to %s', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ error: { message: 'secret provider text' } }) }));
    const error = await provider().complete(input).catch(e => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.kind).toBe(kind);
    expect(error.message).not.toContain('secret');
  });

  it('maps a network failure to busy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    expect((await provider().complete(input).catch(e => e)).kind).toBe('busy');
  });
});

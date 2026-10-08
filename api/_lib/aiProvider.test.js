import { afterEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();
vi.mock('openai', () => ({
  default: class FakeOpenAI {
    constructor(options) { FakeOpenAI.lastOptions = options; this.chat = { completions: { create: createMock } }; }
  },
}));

const { aiConfig, aiHealthTarget, getProvider, ProviderError, resetDeadModels } = await import('./aiProvider.js');
const OpenAI = (await import('openai')).default;

afterEach(() => { vi.unstubAllGlobals(); createMock.mockReset(); resetDeadModels(); });

const input = { system: 'SYS', messages: [{ role: 'user', content: 'hello' }], maxTokens: 300 };

describe('aiConfig', () => {
  it('defaults to openai-compatible and picks Groq when GROQ_API_KEY is set', () => {
    const config = aiConfig({ GROQ_API_KEY: 'k' });
    expect(config).toMatchObject({
      provider: 'openai-compatible', baseURL: 'https://api.groq.com/openai/v1', apiKeyName: 'GROQ_API_KEY',
      model: 'openai/gpt-oss-120b', models: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    });
  });

  it('builds the model chain from AI_MODELS (precedence), then AI_MODEL, then the default', () => {
    expect(aiConfig({ GROQ_API_KEY: 'k', AI_MODEL: 'single', AI_MODELS: ' a/one , b-two,,a/one ' }).models).toEqual(['a/one', 'b-two']);
    expect(aiConfig({ GROQ_API_KEY: 'k', AI_MODEL: 'single' }).models).toEqual(['single']);
    expect(aiConfig({ GROQ_API_KEY: 'k', AI_MODELS: ' , ' }).models).toHaveLength(3);
    expect(aiConfig({ OPENAI_API_KEY: 'k' })).toMatchObject({ models: ['gpt-4o-mini'], apiKeyName: 'OPENAI_API_KEY' });
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
      url: 'https://api.groq.com/openai/v1/models/openai/gpt-oss-120b', headers: { Authorization: 'Bearer k' },
    });
    expect(aiHealthTarget(aiConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' })).headers['x-api-key']).toBe('k');
  });
});

describe('openai-compatible provider', () => {
  const provider = (env = {}) => getProvider(aiConfig({ GROQ_API_KEY: 'k', ...env }));
  const ok = content => ({ choices: [{ message: { content } }], usage: { prompt_tokens: 5, completion_tokens: 7 } });
  const gone = (status = 404, extra = {}) => Object.assign(new Error('provider text'), { status, ...extra });
  const modelsCalled = () => createMock.mock.calls.map(([args]) => args.model);

  it('sends the system prompt first, passes the token cap and disables SDK retries (non-reasoning model)', async () => {
    createMock.mockResolvedValue(ok('hi'));
    const result = await provider({ AI_MODEL: 'llama-3.1-8b-instant' }).complete(input);
    expect(result).toEqual({ text: 'hi', model: 'llama-3.1-8b-instant', usage: { inputTokens: 5, outputTokens: 7 } });
    const args = createMock.mock.calls[0][0];
    expect(args.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(args.max_tokens).toBe(300);
    expect(args).not.toHaveProperty('max_completion_tokens');
    expect(args).not.toHaveProperty('reasoning_effort');
    expect(args).not.toHaveProperty('include_reasoning');
    expect(OpenAI.lastOptions.maxRetries).toBe(0);
  });

  it('gives gpt-oss reasoning models low effort, no reasoning output and token headroom', async () => {
    createMock.mockResolvedValue(ok('hi'));
    const result = await provider().complete(input);
    expect(result.model).toBe('openai/gpt-oss-120b');
    const args = createMock.mock.calls[0][0];
    expect(args).toMatchObject({ model: 'openai/gpt-oss-120b', max_completion_tokens: 1800, reasoning_effort: 'low', include_reasoning: false });
    expect(args).not.toHaveProperty('max_tokens');
  });

  it('moves to the next model when the provider says a model is gone, and remembers it', async () => {
    createMock.mockRejectedValueOnce(gone(404)).mockResolvedValue(ok('hi'));
    const live = provider();
    expect((await live.complete(input)).model).toBe('llama-3.3-70b-versatile');
    expect(modelsCalled()).toEqual(['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']);
    // Dead-model memory: the next request (even from a fresh provider object) skips the gone model.
    createMock.mockClear();
    expect((await provider().complete(input)).model).toBe('llama-3.3-70b-versatile');
    expect(modelsCalled()).toEqual(['llama-3.3-70b-versatile']);
  });

  it.each([
    ['400 with code model_decommissioned', gone(400, { code: 'model_decommissioned' })],
    ['400 with nested model_not_found code', gone(400, { error: { code: 'model_not_found' } })],
    ['410 with a decommissioned message', gone(410, { message: 'The model `x` has been decommissioned and is no longer supported' })],
    ['400 with a does-not-exist message', gone(400, { message: 'The model `x` does not exist or you do not have access to it' })],
  ])('treats %s as model gone', async (_label, error) => {
    createMock.mockRejectedValueOnce(error).mockResolvedValue(ok('hi'));
    expect((await provider().complete(input)).model).toBe('llama-3.3-70b-versatile');
  });

  it('does not treat an unrelated 400 as model gone', async () => {
    createMock.mockRejectedValue(gone(400, { message: 'messages must not be empty' }));
    const error = await provider().complete(input).catch(e => e);
    expect(error).toMatchObject({ kind: 'unavailable', reason: 'provider_error', status: 400 });
    expect(modelsCalled()).toHaveLength(1);
  });

  it.each([[429, 'provider_rate_limited'], [503, 'provider_error']])('does not advance the chain on HTTP %s', async (status, reason) => {
    createMock.mockRejectedValue(gone(status));
    const error = await provider().complete(input).catch(e => e);
    expect(error).toMatchObject({ kind: 'busy', reason, status });
    expect(modelsCalled()).toEqual(['openai/gpt-oss-120b']);
    // ...and the model is not remembered as dead.
    createMock.mockClear();
    await provider().complete(input).catch(() => {});
    expect(modelsCalled()).toEqual(['openai/gpt-oss-120b']);
  });

  it('returns unavailable (provider_model_unavailable) when every model in the chain is gone, then fails fast', async () => {
    createMock.mockRejectedValue(gone(404));
    const error = await provider().complete(input).catch(e => e);
    expect(error).toMatchObject({ kind: 'unavailable', reason: 'provider_model_unavailable' });
    expect(modelsCalled()).toHaveLength(3);
    createMock.mockClear();
    const again = await provider().complete(input).catch(e => e);
    expect(again).toMatchObject({ kind: 'unavailable', reason: 'provider_model_unavailable' });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('honours AI_MODELS order', async () => {
    createMock.mockRejectedValueOnce(gone(404)).mockResolvedValue(ok('hi'));
    expect((await provider({ AI_MODELS: 'custom/a, custom/b' }).complete(input)).model).toBe('custom/b');
  });

  it('tries the next model once when the visible reply is empty, without marking the model dead', async () => {
    createMock.mockResolvedValueOnce(ok('')).mockResolvedValue(ok('visible answer'));
    const result = await provider().complete(input);
    expect(result.text).toBe('visible answer');
    expect(modelsCalled()).toEqual(['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']);
    createMock.mockClear();
    createMock.mockResolvedValue(ok('again'));
    await provider().complete(input);
    expect(modelsCalled()).toEqual(['openai/gpt-oss-120b']);
  });

  it('gives up after one empty-reply fallback with provider_empty_reply', async () => {
    createMock.mockResolvedValue(ok(' '));
    const error = await provider().complete(input).catch(e => e);
    expect(error).toMatchObject({ kind: 'unavailable', reason: 'provider_empty_reply' });
    expect(modelsCalled()).toHaveLength(2);
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

  it('records a network failure as busy with reason provider_error and no status', async () => {
    createMock.mockRejectedValue(new Error('socket hang up'));
    const error = await provider().complete(input).catch(e => e);
    expect(error).toMatchObject({ kind: 'busy', reason: 'provider_error' });
    expect(error.status).toBeUndefined();
  });
});

describe('anthropic provider', () => {
  const provider = () => getProvider(aiConfig({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'anthropic-test-value' }));

  it('calls the Messages API with fetch and returns text and usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'hello' }], usage: { input_tokens: 3, output_tokens: 4 } }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await provider().complete(input);
    expect(result).toEqual({ text: 'hello', model: 'claude-haiku-5-5', usage: { inputTokens: 3, outputTokens: 4 } });
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

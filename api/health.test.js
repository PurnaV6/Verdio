import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './health.js';

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; vi.unstubAllGlobals(); });

describe('production health endpoint', () => {
  it('provides a public liveness response without exposing configuration', async () => {
    const res = response();
    await handler({ method: 'GET', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('operational');
    expect(res.body.services).toBeUndefined();
  });

  it('protects detailed dependency diagnostics', async () => {
    process.env.HEALTH_CHECK_SECRET = 'health-secret';
    const res = response();
    await handler({ method: 'GET', query: { details: '1' }, headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it('checks every production dependency', async () => {
    Object.assign(process.env, {
      HEALTH_CHECK_SECRET: 'health-secret', OPENAI_API_KEY: 'test-key', AI_MODEL: 'test-model',
      SUPABASE_URL: 'https://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      RESEND_API_KEY: 'resend-key', REPORT_FROM_EMAIL: 'reports@example.com',
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const res = response();
    await handler({ method: 'GET', query: { details: '1' }, headers: { authorization: 'Bearer health-secret' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.services).toHaveLength(5);
    expect(res.body.services.every(service => service.status === 'operational')).toBe(true);
  });
});

describe('AI setup checklist', () => {
  const KEY_VALUE = 'gsk_test_secret_value';
  const ANON_VALUE = 'anon-test-secret-value';
  const authorized = { method: 'GET', query: { details: '1' }, headers: { authorization: 'Bearer health-secret' } };

  function configure(extra = {}) {
    for (const name of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'AI_MODEL', 'AI_MODELS', 'AI_PROVIDER', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL']) delete process.env[name];
    Object.assign(process.env, {
      HEALTH_CHECK_SECRET: 'health-secret', GROQ_API_KEY: KEY_VALUE,
      SUPABASE_URL: 'https://supabase.test/', SUPABASE_ANON_KEY: ANON_VALUE, ...extra,
    });
  }

  function mockFetch(rpc) {
    const fetchMock = vi.fn(async url => (String(url).endsWith('/rpc/consume_ai_quota') ? rpc() : { ok: true, status: 200, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  async function run() {
    const res = response();
    await handler(authorized, res);
    return res.body.ai;
  }

  it('reports a complete setup and probes the RPC with the anon key only', async () => {
    configure();
    const fetchMock = mockFetch(() => ({ ok: false, status: 401, json: async () => ({ code: '42501', message: 'permission denied for function consume_ai_quota' }) }));
    const ai = await run();
    expect(ai).toEqual({
      supabase_url_set: true, supabase_anon_key_set: true, provider_key_set: true, provider_key_env: 'GROQ_API_KEY', provider_name: 'groq',
      model_chain: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
      quota_function_present: true, quota_function_http_status: 401,
      next_step: expect.stringContaining('Setup looks complete'),
    });
    const probe = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/rpc/consume_ai_quota'));
    expect(probe[0]).toBe('https://supabase.test/rest/v1/rpc/consume_ai_quota');
    expect(probe[1].method).toBe('POST');
    expect(probe[1].headers.apikey).toBe(ANON_VALUE);
    expect(probe[1].headers.Authorization).toBe(`Bearer ${ANON_VALUE}`);
  });

  it.each([
    ['HTTP 404', { ok: false, status: 404, json: async () => ({}) }],
    ['PGRST202', { ok: false, status: 400, json: async () => ({ code: 'PGRST202', message: 'Could not find the function' }) }],
  ])('flags a missing quota function (%s) and says which migration to apply', async (_label, answer) => {
    configure();
    mockFetch(() => answer);
    const ai = await run();
    expect(ai.quota_function_present).toBe(false);
    expect(ai.next_step).toContain('supabase/migrations/202607270001_ai_usage_limits.sql');
  });

  it.each([[403, true], [401, true], [500, null]])('maps RPC HTTP %s to quota_function_present=%s', async (status, expected) => {
    configure();
    mockFetch(() => ({ ok: false, status, json: async () => ({}) }));
    expect((await run()).quota_function_present).toBe(expected);
  });

  it('reports unknown when the probe cannot connect', async () => {
    configure();
    mockFetch(() => { throw new Error('socket hang up'); });
    const ai = await run();
    expect(ai.quota_function_present).toBeNull();
    expect(ai.quota_function_http_status).toBeNull();
  });

  it('reports a missing provider key and which variable supplies one, without any value', async () => {
    configure({ OPENAI_API_KEY: 'sk-openai-secret-value', AI_MODELS: 'a/one, b-two' });
    delete process.env.GROQ_API_KEY;
    mockFetch(() => ({ ok: false, status: 401, json: async () => ({}) }));
    const supplied = await run();
    expect(supplied).toMatchObject({ provider_key_set: true, provider_key_env: 'OPENAI_API_KEY', provider_name: 'openai', model_chain: ['a/one', 'b-two'] });

    configure();
    delete process.env.GROQ_API_KEY;
    const missing = await run();
    expect(missing).toMatchObject({ provider_key_set: false, provider_key_env: null });
    expect(missing.next_step).toContain('GROQ_API_KEY');
  });

  it('asks for the Supabase variables when they are missing and skips the probe', async () => {
    configure();
    delete process.env.SUPABASE_URL;
    const fetchMock = mockFetch(() => ({ ok: true, status: 200 }));
    const ai = await run();
    expect(ai).toMatchObject({ supabase_url_set: false, quota_function_present: null });
    expect(ai.next_step).toContain('SUPABASE_URL');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('consume_ai_quota'))).toBe(false);
  });

  it('never includes a key value, and stays hidden from unauthenticated callers', async () => {
    configure({ SUPABASE_SERVICE_ROLE_KEY: 'service-secret-value' });
    mockFetch(() => ({ ok: false, status: 401, json: async () => ({}) }));
    const res = response();
    await handler(authorized, res);
    const text = JSON.stringify(res.body);
    for (const secret of [KEY_VALUE, ANON_VALUE, 'service-secret-value', 'health-secret']) expect(text).not.toContain(secret);

    const anonymous = response();
    await handler({ method: 'GET', query: { details: '1' }, headers: {} }, anonymous);
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.body).toEqual({ error: 'Unauthorized' });
    const publicRes = response();
    await handler({ method: 'GET', query: {}, headers: {} }, publicRes);
    expect(publicRes.body.ai).toBeUndefined();
  });
});

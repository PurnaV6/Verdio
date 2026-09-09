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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from './invitations.js';
import { normalizeOrigin } from './_lib/origin.js';

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

const originalEnv = { ...process.env };
let fetchMock;

beforeEach(() => {
  for (const name of ['APP_ORIGINS', 'VERCEL_PROJECT_PRODUCTION_URL']) delete process.env[name];
  Object.assign(process.env, {
    SUPABASE_URL: 'https://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    RESEND_API_KEY: 'resend-key', REPORT_FROM_EMAIL: 'invites@example.com',
  });
  fetchMock = vi.fn(async url => {
    if (String(url).includes('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'user-1' }) };
    if (String(url).includes('/rest/v1/organization_invitations')) {
      return { ok: true, json: async () => ([{ id: 'inv-1', email: 'new@example.com', role: 'member', token: 'tok123', expires_at: '2030-01-01T00:00:00Z', organizations: { name: 'Acme' } }]) };
    }
    if (String(url) === 'https://api.resend.com/emails') return { ok: true, json: async () => ({}) };
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { process.env = { ...originalEnv }; vi.unstubAllGlobals(); });

const emailCalls = () => fetchMock.mock.calls.filter(([url]) => String(url) === 'https://api.resend.com/emails');
const sentHtml = () => JSON.parse(emailCalls()[0][1].body).html;

async function invite(headers = {}) {
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer session', host: 'app.example.com', ...headers }, body: { invitationId: 'inv-1' } }, res);
  return res;
}

describe('invitation link origin', () => {
  it('never uses a foreign Origin in the link or email', async () => {
    process.env.APP_ORIGINS = 'https://app.example.com';
    const res = await invite({ origin: 'https://evil.example' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ delivered: true });
    const html = sentHtml();
    expect(html).not.toContain('evil.example');
    expect(html).toContain('href="https://app.example.com/?invite=tok123"');
  });

  it('uses an Origin listed in APP_ORIGINS', async () => {
    process.env.APP_ORIGINS = 'https://app.example.com, https://staging.example.com';
    const res = await invite({ origin: 'https://staging.example.com' });
    expect(res.statusCode).toBe(200);
    expect(sentHtml()).toContain('href="https://staging.example.com/?invite=tok123"');
  });

  it('uses a same-origin Origin even when APP_ORIGINS is unset', async () => {
    const res = await invite({ origin: 'https://app.example.com', host: 'app.example.com' });
    expect(res.statusCode).toBe(200);
    expect(sentHtml()).toContain('href="https://app.example.com/?invite=tok123"');
  });

  it('falls back to the first APP_ORIGINS entry when Origin is missing', async () => {
    process.env.APP_ORIGINS = 'https://first.example.com,https://second.example.com';
    const res = await invite();
    expect(res.statusCode).toBe(200);
    expect(sentHtml()).toContain('href="https://first.example.com/?invite=tok123"');
  });

  it('falls back to VERCEL_PROJECT_PRODUCTION_URL when APP_ORIGINS is unset and the origin is untrusted', async () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'verdio.example.app';
    const res = await invite({ origin: 'https://evil.example' });
    expect(res.statusCode).toBe(200);
    const html = sentHtml();
    expect(html).not.toContain('evil.example');
    expect(html).toContain('href="https://verdio.example.app/?invite=tok123"');
  });

  it('does not use the Host header as a fallback when Origin is missing', async () => {
    const res = await invite({ host: 'evil.example' });
    expect(res.statusCode).toBe(500);
    expect(emailCalls()).toHaveLength(0);
  });

  it('returns a safe 500 and sends nothing when no trusted origin is available', async () => {
    const res = await invite({ origin: 'https://evil.example' });
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Invitations are not configured' });
    expect(JSON.stringify(res.body)).not.toContain('evil.example');
    expect(emailCalls()).toHaveLength(0);
  });

  it('rejects origins with a path, credentials or a non-http scheme', async () => {
    process.env.APP_ORIGINS = 'https://app.example.com';
    for (const origin of ['https://evil.example/phish', 'https://user:pw@evil.example', 'javascript://evil.example', 'ftp://evil.example', 'https://app.example.com/extra']) {
      fetchMock.mockClear();
      const res = await invite({ origin, host: 'evil.example' });
      expect(res.statusCode).toBe(200);
      expect(sentHtml()).toContain('href="https://app.example.com/?invite=tok123"');
      expect(sentHtml()).not.toContain('evil.example');
    }
  });

  it('ignores invalid APP_ORIGINS entries', async () => {
    process.env.APP_ORIGINS = 'javascript:alert(1), https://evil.example/path, https://ok.example.com';
    const res = await invite();
    expect(res.statusCode).toBe(200);
    expect(sentHtml()).toContain('href="https://ok.example.com/?invite=tok123"');
  });
});

describe('normalizeOrigin', () => {
  it('reduces valid values to scheme and host', () => {
    expect(normalizeOrigin('https://App.Example.com')).toBe('https://app.example.com');
    expect(normalizeOrigin('https://app.example.com/')).toBe('https://app.example.com');
    expect(normalizeOrigin('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('rejects anything else', () => {
    for (const value of [undefined, '', 'null', 'app.example.com', 'https://a.example/p', 'https://a.example?x=1', 'https://u@a.example', 'file:///etc/passwd', 'data:text/html,hi']) {
      expect(normalizeOrigin(value)).toBeNull();
    }
  });
});

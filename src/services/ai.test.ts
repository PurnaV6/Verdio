import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let session: { access_token: string } | null = null;
vi.mock('../lib/auth/supabaseClient', () => ({
  getSupabase: () => ({ auth: { getSession: async () => ({ data: { session } }) } }),
}));

import { askAssistant } from './ai';

const fetchMock = vi.fn();

beforeEach(() => { session = { access_token: 'user-token' }; vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); });

describe('askAssistant', () => {
  it('makes no network call without a session (no-login demo)', async () => {
    session = null;
    expect(await askAssistant('advisor', 'ctx', 'q')).toEqual({ ok: false, reason: 'no-session' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the strict request shape with the access token and nothing else', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: 'answer', source: 'ai' }) });
    const outcome = await askAssistant('advisor', 'ctx', 'What is my biggest risk?');
    expect(outcome).toEqual({ ok: true, result: 'answer' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/chat');
    expect(options.headers.Authorization).toBe('Bearer user-token');
    expect(JSON.parse(options.body)).toEqual({ task: 'advisor', question: 'What is my biggest risk?', history: [], context: 'ctx' });
  });

  it('keeps the context within the server limits', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: 'x' }) });
    await askAssistant('insights', `${'a'.repeat(5000)}\n${'b'.repeat(11000)}`);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.context.length).toBeLessThanOrEqual(12000);
    expect(body.context.split('\n')[0].length).toBeLessThanOrEqual(1500);
    expect(body.question).toBeUndefined();
  });

  it.each([[429, 'limit'], [503, 'busy'], [401, 'error'], [403, 'error'], [502, 'error']])('maps HTTP %s to %s and does not retry', async (status, reason) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({}) });
    expect(await askAssistant('advisor', 'ctx', 'q')).toEqual({ ok: false, reason });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a network failure or an empty result as an error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await askAssistant('advisor', 'ctx', 'q')).toEqual({ ok: false, reason: 'error' });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: '' }) });
    expect(await askAssistant('advisor', 'ctx', 'q')).toEqual({ ok: false, reason: 'error' });
  });
});

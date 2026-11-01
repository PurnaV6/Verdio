import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let session: { access_token: string } | null = null;
let refreshed: { access_token: string } | null = null;
const refreshSession = vi.fn(async () => ({ data: { session: refreshed } }));
vi.mock('../lib/auth/supabaseClient', () => ({
  getSupabase: () => ({ auth: { getSession: async () => ({ data: { session } }), refreshSession } }),
}));

vi.mock('../lib/analysis/factSummary', () => ({ buildAdvisorContext: () => 'ctx' }));

import { askAssistant, generateAIInsights } from './ai';

const fetchMock = vi.fn();

const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const good = () => reply(200, { result: 'answer', source: 'ai' });

beforeEach(() => {
  session = { access_token: 'user-token' };
  refreshed = { access_token: 'fresh-token' };
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});
afterEach(() => {
  fetchMock.mockReset();
  refreshSession.mockClear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs askAssistant to the end, advancing the fake clock past any retry wait or timeout. */
async function run(question = 'q') {
  const pending = askAssistant('advisor', 'ctx', question);
  await vi.advanceTimersByTimeAsync(100000);
  return pending;
}

describe('askAssistant request', () => {
  it('makes no network call without a session (no-login demo)', async () => {
    session = null;
    expect(await askAssistant('advisor', 'ctx', 'q')).toEqual({ ok: false, reason: 'no-session' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the strict request shape with the access token and nothing else', async () => {
    fetchMock.mockResolvedValue(good());
    const outcome = await run('What is my biggest risk?');
    expect(outcome).toEqual({ ok: true, result: 'answer' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/chat');
    expect(options.headers.Authorization).toBe('Bearer user-token');
    expect(JSON.parse(options.body)).toEqual({ task: 'advisor', question: 'What is my biggest risk?', history: [], context: 'ctx' });
  });

  it('keeps the context within the server limits', async () => {
    fetchMock.mockResolvedValue(good());
    const pending = askAssistant('insights', `${'a'.repeat(5000)}\n${'b'.repeat(11000)}`);
    await vi.advanceTimersByTimeAsync(0);
    await pending;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.context.length).toBeLessThanOrEqual(12000);
    expect(body.context.split('\n')[0].length).toBeLessThanOrEqual(1500);
    expect(body.question).toBeUndefined();
  });
});

describe('askAssistant failure reasons', () => {
  it.each([
    [429, 'too_fast', 'too-fast'],
    [429, 'daily_limit', 'limit'],
    [503, 'global_limit', 'busy'],
    [503, 'unavailable', 'unavailable'],
    [502, 'unavailable', 'unavailable'],
    [403, 'not_allowed', 'not-allowed'],
    [400, 'bad_request', 'error'],
  ])('maps HTTP %s with code %s to %s', async (status, code, reason) => {
    fetchMock.mockResolvedValue(reply(status, { error: 'x', code }));
    expect(await run()).toMatchObject({ ok: false, reason });
  });

  it('passes retryAfterSeconds through for too-fast', async () => {
    fetchMock.mockResolvedValue(reply(429, { code: 'too_fast', retryAfterSeconds: 3 }));
    expect(await run()).toEqual({ ok: false, reason: 'too-fast', retryAfterSeconds: 3 });
  });

  it('falls back to the status when an older server sends no code', async () => {
    for (const [status, reason] of [[429, 'limit'], [403, 'not-allowed'], [502, 'unavailable'], [500, 'error']] as const) {
      fetchMock.mockResolvedValueOnce(reply(status, {}));
      expect(await run()).toMatchObject({ ok: false, reason });
    }
  });

  it('treats a network failure, a non-JSON error body or an empty result as an error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await run()).toEqual({ ok: false, reason: 'error' });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('not json'); } });
    expect(await run()).toEqual({ ok: false, reason: 'error' });
    fetchMock.mockResolvedValueOnce(reply(200, { result: '  ' }));
    expect(await run()).toEqual({ ok: false, reason: 'error' });
  });
});

describe('askAssistant retries', () => {
  it.each([
    ['too_fast', 429], ['daily_limit', 429], ['global_limit', 503], ['unavailable', 502], ['not_allowed', 403], ['bad_request', 400],
  ])('never retries code %s', async (code, status) => {
    fetchMock.mockResolvedValue(reply(status, { code }));
    await run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('retries a busy answer once, after about 2 seconds, and returns the second answer', async () => {
    fetchMock.mockResolvedValueOnce(reply(503, { code: 'busy' })).mockResolvedValueOnce(good());
    const pending = askAssistant('advisor', 'ctx', 'q');
    await vi.advanceTimersByTimeAsync(1900);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(700);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await pending).toEqual({ ok: true, result: 'answer' });
  });

  it('reports busy after exactly one retry', async () => {
    fetchMock.mockResolvedValue(reply(503, { code: 'busy' }));
    expect(await run()).toEqual({ ok: false, reason: 'busy' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('askAssistant timeout', () => {
  /** A fetch that never answers and rejects when it is aborted, like the real one. */
  function hang() {
    return (_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  }

  it('gives up after 30 seconds, retries once, then reports timeout', async () => {
    fetchMock.mockImplementation(hang());
    const pending = askAssistant('advisor', 'ctx', 'q');
    await vi.advanceTimersByTimeAsync(29000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(80000);
    expect(await pending).toEqual({ ok: false, reason: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recovers when the retry after a timeout answers', async () => {
    fetchMock.mockImplementationOnce(hang()).mockResolvedValueOnce(good());
    expect(await run()).toEqual({ ok: true, result: 'answer' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('askAssistant expired session', () => {
  it('refreshes the session once on 401 and retries with the new token', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { code: 'sign_in' })).mockResolvedValueOnce(good());
    expect(await run()).toEqual({ ok: true, result: 'answer' });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh-token');
  });

  it('reports sign-in when the retry is still refused', async () => {
    fetchMock.mockResolvedValue(reply(401, { code: 'sign_in' }));
    expect(await run()).toEqual({ ok: false, reason: 'sign-in' });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports sign-in without a second call when the refresh gives no session', async () => {
    refreshed = null;
    fetchMock.mockResolvedValue(reply(401, { code: 'sign_in' }));
    expect(await run()).toEqual({ ok: false, reason: 'sign-in' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('generateAIInsights', () => {
  const pipeline = {
    source: { rowCount: 10 }, profile: { columnCount: 3 }, quality: { overallScore: 90 },
    decision: { health: { total: 70 }, risks: [], recommendations: [] }, analyses: [],
  } as never;

  it('returns the built-in insights with a plain notice when the assistant is limited', async () => {
    fetchMock.mockResolvedValue(reply(429, { code: 'daily_limit' }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pending = generateAIInsights(pipeline);
    await vi.advanceTimersByTimeAsync(100000);
    expect(await pending).toMatchObject({ source: 'built-in', notice: expect.stringContaining("You have used today's") });
  });
});

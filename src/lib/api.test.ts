import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, askAssistant } from './api';

const endpoint = { url: 'https://x.test/fn', anonKey: 'anon' };
afterEach(() => vi.unstubAllGlobals());

describe('askAssistant', () => {
  it('posts query + history with auth header and returns the reply', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ response: 'hi', source: 'rules', toolsUsed: [] })));
    vi.stubGlobal('fetch', fetchMock);
    const out = await askAssistant('q', [{ role: 'user', content: 'a' }], 'Mumbai', undefined, endpoint);
    expect(out.response).toBe('hi');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer anon');
    expect(JSON.parse(init.body as string)).toMatchObject({ query: 'q', city: 'Mumbai', history: [{ role: 'user', content: 'a' }] });
  });

  it('surfaces server error messages', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'Too many requests.' }), { status: 429 }));
    await expect(askAssistant('q', [], 'Kolkata', undefined, endpoint)).rejects.toMatchObject({ message: 'Too many requests.', status: 429 });
  });

  it('wraps network failures', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });
    await expect(askAssistant('q', [], 'Kolkata', undefined, endpoint)).rejects.toThrow(/Network error/);
  });

  it('fails fast when unconfigured', async () => {
    await expect(askAssistant('q', [], 'Kolkata', undefined, { url: '', anonKey: '' })).rejects.toBeInstanceOf(ApiError);
  });
});

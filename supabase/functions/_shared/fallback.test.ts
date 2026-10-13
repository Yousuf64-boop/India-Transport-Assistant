import { describe, expect, it, vi } from 'vitest';
import { answerWithRules, parseIntent } from './fallback.ts';
import type { Route, RouteProvider } from './routes.ts';

describe('parseIntent', () => {
  it.each([
    ['Howrah to Salt Lake Sector V by metro', { kind: 'journey', from: 'Howrah', to: 'Salt Lake Sector V', mode: 'TRANSIT' }],
    ['Connaught Place to Cyber Hub by bike', { kind: 'journey', from: 'Connaught Place', to: 'Cyber Hub', mode: 'TWO_WHEELER' }],
    ['How do I get from Andheri to Nariman Point by cab?', { kind: 'journey', from: 'Andheri', to: 'Nariman Point', mode: 'DRIVE' }],
    ['route from Soho Road to Camden by walking', { kind: 'journey', from: 'Soho Road', to: 'Camden', mode: 'WALK' }],
    ['Compare ways to get from Bandra to Churchgate', { kind: 'compare', from: 'Bandra', to: 'Churchgate' }],
    ['fastest way from Dum Dum to Airport', { kind: 'compare', from: 'Dum Dum', to: 'Airport' }],
    ['tell me a joke', { kind: 'help' }],
    ['is my PNR confirmed', { kind: 'help' }],
  ])('%s', (q, expected) => {
    expect(parseIntent(q)).toEqual(expected);
  });

  it('refuses to treat a sentence-length chunk as a place name', () => {
    expect(parseIntent('from the old market near my childhood home in the village to the airport')).toEqual({ kind: 'help' });
  });
});

const route = (mode: Route['mode'], minutes: number): Route => ({ mode, minutes, distanceKm: 10, steps: [] });

describe('answerWithRules', () => {
  const provider = (): RouteProvider => ({
    name: 'google',
    plan: vi.fn(async (_f: string, _t: string, mode: Route['mode']) => (mode === 'WALK' ? [] : [route(mode, mode === 'DRIVE' ? 50 : 30)])),
  });

  it('adds the selected city to both places before calling the provider', async () => {
    const p = provider();
    await answerWithRules(p, 'Kolkata', 'Howrah to Sector V by metro');
    expect(p.plan).toHaveBeenCalledWith('Howrah, Kolkata', 'Sector V, Kolkata', 'TRANSIT');
  });

  it('compares modes in parallel and tolerates partial failure', async () => {
    const p: RouteProvider = {
      name: 'google',
      plan: async (_f, _t, mode) => {
        if (mode === 'TWO_WHEELER') throw new Error('not available here');
        return [route(mode, 25)];
      },
    };
    const r = await answerWithRules(p, 'Mumbai', 'compare ways from Bandra to Churchgate');
    expect(r.toolsUsed).toEqual(['compare_modes']);
    expect(r.response).toContain('25 min');
    expect(r.response).toContain('unavailable (not available here)');
  });

  it('returns help text without calling the provider for unknown intents', async () => {
    const p = provider();
    const r = await answerWithRules(p, 'Kolkata', 'hello there');
    expect(p.plan).not.toHaveBeenCalled();
    expect(r.response).toMatch(/PNR/);
  });

  it('states when no route exists', async () => {
    const r = await answerWithRules(provider(), 'Kolkata', 'A to B by walking');
    expect(r.response).toMatch(/couldn't find/);
  });
});

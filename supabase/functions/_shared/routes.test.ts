import { describe, expect, it, vi } from 'vitest';
import { OsmProvider, parseGoogleRoute, RoutesClient, secondsToMinutes } from './routes.ts';

const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const asFetch = (f: unknown) => f as unknown as typeof fetch;

const googleTransitRoute = {
  duration: '2520s',
  distanceMeters: 14200,
  travelAdvisory: { transitFare: { currencyCode: 'INR', units: '30', nanos: 0 } },
  legs: [{
    steps: [
      { travelMode: 'WALK', staticDuration: '300s', navigationInstruction: { instructions: 'Walk to station' } },
      {
        travelMode: 'TRANSIT',
        staticDuration: '1800s',
        transitDetails: {
          stopDetails: { departureStop: { name: 'Dum Dum' }, arrivalStop: { name: 'Esplanade' }, departureTime: '2026-10-13T04:30:00Z' },
          headsign: 'Kavi Subhash',
          stopCount: 10,
          transitLine: { name: 'Blue Line', vehicle: { type: 'SUBWAY' } },
        },
      },
    ],
  }],
};

describe('parseGoogleRoute', () => {
  it('maps transit steps, walking steps, INR fare and distance', () => {
    const r = parseGoogleRoute(googleTransitRoute, 'TRANSIT');
    expect(r).toMatchObject({ minutes: 42, distanceKm: 14.2, fareINR: 30 });
    expect(r.steps[0]).toMatchObject({ kind: 'walk', minutes: 5 });
    expect(r.steps[1]).toMatchObject({ kind: 'transit', label: 'Metro · Blue Line', from: 'Dum Dum', to: 'Esplanade', stops: 10, headsign: 'Kavi Subhash' });
  });

  it('ignores fares in non-INR currencies and tolerates missing fields', () => {
    const r = parseGoogleRoute({ duration: '60s', travelAdvisory: { transitFare: { currencyCode: 'USD', units: '1' } } }, 'DRIVE');
    expect(r.fareINR).toBeUndefined();
    expect(r.steps).toEqual([]);
  });

  it('rounds duration strings', () => expect(secondsToMinutes('90s')).toBe(2));
});

describe('RoutesClient', () => {
  it('sends region, key, field mask and traffic preference for two-wheelers', async () => {
    const f = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => res({ routes: [{ duration: '600s', staticDuration: '500s', distanceMeters: 3000 }] }));
    const out = await new RoutesClient('K', asFetch(f)).plan('A', 'B', 'TWO_WHEELER');
    const init = f.mock.calls[0][1];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ travelMode: 'TWO_WHEELER', regionCode: 'IN', routingPreference: 'TRAFFIC_AWARE' });
    expect(body.computeAlternativeRoutes).toBeUndefined();
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe('K');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toContain('routes.legs.steps.transitDetails');
    expect(out[0]).toMatchObject({ minutes: 10, staticMinutes: 8 });
  });

  it('requests alternatives for transit but no traffic preference', async () => {
    const f = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => res({ routes: [] }));
    await new RoutesClient('K', asFetch(f)).plan('A', 'B', 'TRANSIT');
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body.computeAlternativeRoutes).toBe(true);
    expect(body.routingPreference).toBeUndefined();
  });

  it.each([[403, /key was rejected/i], [429, /quota/i], [500, /Routing API error/]])('maps HTTP %i to a friendly error', async (status, msg) => {
    await expect(new RoutesClient('K', asFetch(async () => res({}, status))).plan('A', 'B', 'DRIVE')).rejects.toThrow(msg);
  });

  it('treats 400 (unresolvable address) as no route', async () => {
    expect(await new RoutesClient('K', asFetch(async () => res({}, 400))).plan('A', 'B', 'DRIVE')).toEqual([]);
  });

  it('wraps network failures', async () => {
    const f = async () => { throw new TypeError('offline'); };
    await expect(new RoutesClient('K', asFetch(f)).plan('A', 'B', 'DRIVE')).rejects.toThrow(/Could not reach/);
  });
});

describe('OsmProvider', () => {
  it('geocodes both ends then routes by car', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(res([{ lat: '22.5', lon: '88.3' }]))
      .mockResolvedValueOnce(res([{ lat: '22.6', lon: '88.4' }]))
      .mockResolvedValueOnce(res({ routes: [{ duration: 1200, distance: 8500 }] }));
    const out = await new OsmProvider('me', asFetch(f)).plan('A', 'B', 'DRIVE');
    expect(out).toEqual([{ mode: 'DRIVE', minutes: 20, distanceKm: 8.5, steps: [] }]);
    expect(String(f.mock.calls[2][0])).toContain('88.3,22.5;88.4,22.6');
  });

  it('is honest about unsupported modes', async () => {
    await expect(new OsmProvider('me', asFetch(vi.fn())).plan('A', 'B', 'TRANSIT')).rejects.toThrow(/Google Maps key/);
  });

  it('returns no route when a place cannot be geocoded', async () => {
    const f = vi.fn().mockResolvedValueOnce(res([])).mockResolvedValueOnce(res([{ lat: '1', lon: '1' }]));
    expect(await new OsmProvider('me', asFetch(f)).plan('Nowhere', 'B', 'DRIVE')).toEqual([]);
  });
});

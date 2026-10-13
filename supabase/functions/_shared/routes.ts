/**
 * Route providers.
 *  - RoutesClient: Google Routes API v2 (transit, traffic-aware drive/two-wheeler, walk). Needs GOOGLE_MAPS_API_KEY.
 *  - OsmProvider:  keyless fallback using Nominatim + OSRM demo server. Road routes only, no live traffic.
 *    Both public OSM services have fair-use policies - fine for demos, not for production traffic.
 */
import { UserFacingError } from './types.ts';

export type Fetcher = typeof fetch;
export type TravelMode = 'TRANSIT' | 'DRIVE' | 'TWO_WHEELER' | 'WALK';

export interface Step {
  kind: 'transit' | 'walk' | 'other';
  minutes: number;
  /** Human label, e.g. "Metro · Blue Line". */
  label?: string;
  from?: string;
  to?: string;
  headsign?: string;
  stops?: number;
  departure?: string;
}

export interface Route {
  mode: TravelMode;
  minutes: number;
  /** Duration ignoring live traffic, when the API provides it. */
  staticMinutes?: number;
  distanceKm: number;
  fareINR?: number;
  steps: Step[];
}

export interface RouteProvider {
  readonly name: 'google' | 'osm';
  plan(from: string, to: string, mode: TravelMode): Promise<Route[]>;
}

const TIMEOUT_MS = 10_000;

async function request(doFetch: Fetcher, url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await doFetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new UserFacingError('The routing service timed out.', 504);
    throw new UserFacingError('Could not reach the routing service.', 502);
  } finally {
    clearTimeout(timer);
  }
}

/** "1234s" -> minutes (rounded). */
export const secondsToMinutes = (d: unknown): number => Math.round(parseFloat(String(d ?? '0')) / 60);

const VEHICLE_LABEL: Record<string, string> = {
  SUBWAY: 'Metro', METRO_RAIL: 'Metro', MONORAIL: 'Monorail',
  HEAVY_RAIL: 'Train', COMMUTER_TRAIN: 'Local train', RAIL: 'Train', LONG_DISTANCE_TRAIN: 'Train', HIGH_SPEED_TRAIN: 'Train',
  BUS: 'Bus', INTERCITY_BUS: 'Bus', TROLLEYBUS: 'Bus', SHARE_TAXI: 'Shared taxi',
  TRAM: 'Tram', FERRY: 'Ferry', CABLE_CAR: 'Cable car',
};

export const vehicleLabel = (type: unknown, fallback?: string): string =>
  VEHICLE_LABEL[String(type)] ?? fallback ?? 'Transit';

/* eslint-disable @typescript-eslint/no-explicit-any -- raw Google JSON is untyped; narrowed into Route below. */
export function parseGoogleRoute(r: any, mode: TravelMode): Route {
  const steps: Step[] = [];
  for (const leg of r.legs ?? []) {
    for (const s of leg.steps ?? []) {
      const t = s.transitDetails;
      if (t) {
        const line = t.transitLine?.nameShort ?? t.transitLine?.name;
        const vehicle = vehicleLabel(t.transitLine?.vehicle?.type, t.transitLine?.vehicle?.name?.text);
        steps.push({
          kind: 'transit',
          minutes: secondsToMinutes(s.staticDuration),
          label: line ? `${vehicle} · ${line}` : vehicle,
          from: t.stopDetails?.departureStop?.name,
          to: t.stopDetails?.arrivalStop?.name,
          headsign: t.headsign,
          stops: t.stopCount,
          departure: t.stopDetails?.departureTime,
        });
      } else {
        steps.push({
          kind: s.travelMode === 'WALK' ? 'walk' : 'other',
          minutes: secondsToMinutes(s.staticDuration),
          label: s.navigationInstruction?.instructions,
        });
      }
    }
  }
  const fare = r.travelAdvisory?.transitFare;
  const fareINR =
    fare && fare.currencyCode === 'INR'
      ? Number(fare.units ?? 0) + (fare.nanos ?? 0) / 1e9
      : undefined;

  return {
    mode,
    minutes: secondsToMinutes(r.duration),
    staticMinutes: r.staticDuration ? secondsToMinutes(r.staticDuration) : undefined,
    distanceKm: Math.round(((r.distanceMeters ?? 0) / 1000) * 10) / 10,
    fareINR,
    steps,
  };
}

export class RoutesClient implements RouteProvider {
  readonly name = 'google' as const;
  constructor(private apiKey: string, private doFetch: Fetcher = fetch) {}

  async plan(from: string, to: string, mode: TravelMode): Promise<Route[]> {
    const body: Record<string, unknown> = {
      origin: { address: from },
      destination: { address: to },
      travelMode: mode,
      regionCode: 'IN',
      languageCode: 'en-IN',
      units: 'METRIC',
    };
    if (mode === 'TRANSIT') body.computeAlternativeRoutes = true;
    if (mode === 'DRIVE' || mode === 'TWO_WHEELER') body.routingPreference = 'TRAFFIC_AWARE';

    const res = await request(this.doFetch, 'https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': [
          'routes.duration', 'routes.staticDuration', 'routes.distanceMeters', 'routes.travelAdvisory',
          'routes.legs.steps.transitDetails', 'routes.legs.steps.travelMode',
          'routes.legs.steps.staticDuration', 'routes.legs.steps.navigationInstruction',
        ].join(','),
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401 || res.status === 403) throw new UserFacingError('Maps API key was rejected.', 502);
    if (res.status === 429) throw new UserFacingError('Routing quota exceeded. Try again shortly.', 503);
    if (res.status === 404) return [];
    if (!res.ok) {
      // 400 is also returned for unresolvable addresses; treat as "no route" rather than a server fault.
      if (res.status === 400) return [];
      throw new UserFacingError(`Routing API error (${res.status}).`, 502);
    }
    const data = (await res.json()) as { routes?: unknown[] };
    return (data.routes ?? []).slice(0, 3).map((r) => parseGoogleRoute(r, mode));
  }
}

export class OsmProvider implements RouteProvider {
  readonly name = 'osm' as const;
  constructor(private contact = 'india-transport-assistant', private doFetch: Fetcher = fetch) {}

  private async geocode(place: string): Promise<{ lat: string; lon: string } | null> {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(place)}`;
    const res = await request(this.doFetch, url, { headers: { 'User-Agent': this.contact } });
    if (!res.ok) throw new UserFacingError(`Geocoding error (${res.status}).`, 502);
    const hits = (await res.json()) as { lat: string; lon: string }[];
    return hits[0] ?? null;
  }

  async plan(from: string, to: string, mode: TravelMode): Promise<Route[]> {
    if (mode !== 'DRIVE') {
      throw new UserFacingError(
        'Metro, bus, train and bike routing need a Google Maps key on the server. Only driving estimates work without one.',
        501,
      );
    }
    const [a, b] = await Promise.all([this.geocode(from), this.geocode(to)]);
    if (!a || !b) return [];
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const res = await request(this.doFetch, url);
    if (!res.ok) throw new UserFacingError(`Routing error (${res.status}).`, 502);
    const data = (await res.json()) as { routes?: { duration: number; distance: number }[] };
    return (data.routes ?? []).slice(0, 1).map((r) => ({
      mode,
      minutes: Math.round(r.duration / 60),
      distanceKm: Math.round(r.distance / 100) / 10,
      steps: [],
    }));
  }
}

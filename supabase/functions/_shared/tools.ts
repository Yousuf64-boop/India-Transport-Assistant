import type { City } from './cities.ts';
import { withCity } from './cities.ts';
import type { ModeResult } from './format.ts';
import type { RouteProvider, TravelMode } from './routes.ts';

export const TOOL_DEFINITIONS = [
  {
    name: 'plan_journey',
    description:
      'Plan a journey between two places in India. Returns up to 3 options with duration, distance, and (for public transport) lines, stops, departure times and estimated fare in INR. Driving/two-wheeler durations include live traffic.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Origin: landmark, station, area or address.' },
        to: { type: 'string', description: 'Destination.' },
        mode: {
          type: 'string',
          enum: ['transit', 'drive', 'two_wheeler', 'walk'],
          description: 'Travel mode. Default transit (metro, local train, bus).',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'compare_modes',
    description:
      'Compare public transport vs car vs two-wheeler for the same trip: duration, distance and fare where available. Use when the user asks which is faster/cheaper or does not specify a mode.',
    input_schema: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
] as const;

const MODE_MAP: Record<string, TravelMode> = {
  transit: 'TRANSIT', drive: 'DRIVE', two_wheeler: 'TWO_WHEELER', walk: 'WALK',
};

export const COMPARE_MODES: TravelMode[] = ['TRANSIT', 'DRIVE', 'TWO_WHEELER'];

export async function compareModes(provider: RouteProvider, from: string, to: string): Promise<ModeResult[]> {
  const settled = await Promise.allSettled(COMPARE_MODES.map((m) => provider.plan(from, to, m)));
  return settled.map((s, i) => {
    const mode = COMPARE_MODES[i];
    if (s.status === 'rejected') return { mode, error: (s.reason as Error).message };
    // Fastest option for that mode.
    const best = [...s.value].sort((a, b) => a.minutes - b.minutes)[0];
    return best ? { mode, route: best } : { mode, error: 'no route found' };
  });
}

/** Executes a tool call and returns compact JSON for the model. Never throws. */
export async function runTool(
  provider: RouteProvider,
  city: City,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    const from = typeof input.from === 'string' ? withCity(input.from, city) : '';
    const to = typeof input.to === 'string' ? withCity(input.to, city) : '';
    if (!from || !to) return JSON.stringify({ error: 'from and to are required' });

    switch (name) {
      case 'plan_journey': {
        const mode = MODE_MAP[String(input.mode ?? 'transit')] ?? 'TRANSIT';
        return JSON.stringify(await provider.plan(from, to, mode));
      }
      case 'compare_modes':
        return JSON.stringify(await compareModes(provider, from, to));
      default:
        return JSON.stringify({ error: `Unknown tool ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

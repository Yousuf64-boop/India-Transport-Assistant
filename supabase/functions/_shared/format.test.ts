import { describe, expect, it } from 'vitest';
import { formatRoutes } from './format.ts';
import type { Route } from './routes.ts';

describe('formatRoutes', () => {
  const r: Route = {
    mode: 'TRANSIT', minutes: 42, distanceKm: 14.2, fareINR: 1250,
    steps: [{ kind: 'transit', minutes: 30, label: 'Metro · Blue Line', from: 'Dum Dum', to: 'Esplanade', stops: 10 }],
  };

  it('uses Indian digit grouping and flags schedule-based transit times', () => {
    const out = formatRoutes('A', 'B', 'TRANSIT', [r]);
    expect(out).toContain('₹1,250');
    expect(out).toContain('Metro · Blue Line: Dum Dum → Esplanade, 10 stops');
    expect(out).toMatch(/published schedules/);
  });

  it('does not add the schedule disclaimer to traffic-aware modes', () => {
    expect(formatRoutes('A', 'B', 'DRIVE', [{ ...r, mode: 'DRIVE', steps: [] }])).not.toMatch(/published schedules/);
  });
});

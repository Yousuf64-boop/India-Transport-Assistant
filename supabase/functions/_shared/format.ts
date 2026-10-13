import type { Route, Step, TravelMode } from './routes.ts';

const inr = (n: number) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const hhmm = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';

export const MODE_LABEL: Record<TravelMode, string> = {
  TRANSIT: '🚇 Public transport',
  DRIVE: '🚗 Car / cab (live traffic)',
  TWO_WHEELER: '🏍️ Two-wheeler (live traffic)',
  WALK: '🚶 Walking',
};

function formatStep(s: Step): string {
  if (s.kind === 'transit') {
    const stops = s.stops ? `, ${s.stops} stop${s.stops > 1 ? 's' : ''}` : '';
    const dep = s.departure ? ` · departs ${hhmm(s.departure)}` : '';
    const head = s.headsign ? ` towards ${s.headsign}` : '';
    return `   - ${s.label}${head}: ${s.from} → ${s.to}${stops}${dep}`;
  }
  if (s.kind === 'walk') return `   - 🚶 Walk ${s.minutes} min`;
  return s.label ? `   - ${s.label}` : '';
}

export function formatRoutes(from: string, to: string, mode: TravelMode, routes: Route[]): string {
  if (routes.length === 0) {
    return `I couldn't find a ${MODE_LABEL[mode].replace(/^\S+\s/, '').toLowerCase()} route from ${from} to ${to}. Try more specific place names.`;
  }
  const blocks = routes.map((r, i) => {
    const bits = [`${r.minutes} min`, `${r.distanceKm} km`];
    if (r.fareINR !== undefined) bits.push(`≈ ${inr(r.fareINR)}`);
    const steps = r.steps.map(formatStep).filter(Boolean).join('\n');
    return `**Option ${i + 1}**: ${bits.join(' · ')}${steps ? `\n${steps}` : ''}`;
  });
  const note = mode === 'TRANSIT' ? '\n\nℹ️ Transit times follow published schedules and may not reflect live delays.' : '';
  return `${MODE_LABEL[mode]}: ${from} → ${to}\n\n${blocks.join('\n\n')}${note}`;
}

export interface ModeResult {
  mode: TravelMode;
  route?: Route;
  error?: string;
}

export function formatComparison(from: string, to: string, results: ModeResult[]): string {
  const rows = results.map((r) => {
    if (!r.route) return `• ${MODE_LABEL[r.mode]}: unavailable${r.error ? ` (${r.error})` : ''}`;
    const fare = r.route.fareINR !== undefined ? ` · ≈ ${inr(r.route.fareINR)}` : '';
    return `• ${MODE_LABEL[r.mode]}: **${r.route.minutes} min** · ${r.route.distanceKm} km${fare}`;
  });
  return [`⏱️ ${from} → ${to}`, '', ...rows].join('\n');
}

export const HELP_TEXT = [
  '🇮🇳 I plan journeys across Indian cities using live map data. Try:',
  '',
  '• "Howrah to Salt Lake Sector V by metro"',
  '• "Compare ways to get from Bandra to Churchgate"',
  '• "Connaught Place to Cyber Hub by bike"',
  '',
  'Pick your city above so place names resolve correctly.',
  'I can\'t check Indian Railways PNR, seat availability or live train running status - use NTES or IRCTC for those.',
].join('\n');

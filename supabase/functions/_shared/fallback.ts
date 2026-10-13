/**
 * Deterministic router used when no ANTHROPIC_API_KEY is configured (or the LLM call fails).
 */
import { withCity } from './cities.ts';
import type { City } from './cities.ts';
import { formatComparison, formatRoutes, HELP_TEXT } from './format.ts';
import type { RouteProvider, TravelMode } from './routes.ts';
import { compareModes } from './tools.ts';
import type { AssistantResult } from './types.ts';

export type Intent =
  | { kind: 'journey'; from: string; to: string; mode: TravelMode }
  | { kind: 'compare'; from: string; to: string }
  | { kind: 'help' };

const MODE_WORDS: [RegExp, TravelMode][] = [
  [/\b(metro|train|local|bus|transit|public transport|tram|monorail)\b/i, 'TRANSIT'],
  [/\b(car|cab|taxi|drive|driving|auto|uber|ola)\b/i, 'DRIVE'],
  [/\b(bike|scooter|two[- ]?wheeler|motorcycle|motorbike)\b/i, 'TWO_WHEELER'],
  [/\b(walk|walking|on foot)\b/i, 'WALK'],
];

const clean = (s: string) => s.replace(/[?.!,]+$/g, '').trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function parseIntent(query: string): Intent {
  let q = query.trim();
  const wantsCompare = /\b(compare|fastest|cheapest|which is faster|best way|ways to)\b/i.test(q);

  // Trailing "by metro" / "by bike" etc. selects the mode and is removed from the destination.
  let mode: TravelMode = 'TRANSIT';
  const by = q.match(/\s+(?:by|via|using|on)\s+(?:a |an |the )?([a-z -]+?)[?.!]*$/i);
  if (by) {
    const hit = MODE_WORDS.find(([re]) => re.test(by[1]));
    if (hit) {
      mode = hit[1];
      q = q.slice(0, by.index).trim();
    }
  } else {
    const hit = MODE_WORDS.find(([re]) => re.test(q) && /\b(by|via)\b/i.test(q));
    if (hit) mode = hit[1];
  }

  const m =
    q.match(/from\s+(.+?)\s+to\s+(.+)/i) ??
    q.match(/^(?:how (?:do i |to )?get\s+|route\s+|compare (?:ways )?(?:to get )?)?(.+?)\s+to\s+(.+)$/i);
  if (!m) return { kind: 'help' };

  const from = clean(m[1]).replace(/^(how (do i )?get|route|compare( ways)?( to get)?)\s+/i, '');
  const to = clean(m[2]);
  if (!from || !to || words(from) > 6 || words(to) > 6) return { kind: 'help' };

  return wantsCompare ? { kind: 'compare', from, to } : { kind: 'journey', from, to, mode };
}

export async function answerWithRules(provider: RouteProvider, city: City, query: string): Promise<AssistantResult> {
  const intent = parseIntent(query);
  if (intent.kind === 'help') return { response: HELP_TEXT, source: 'rules', toolsUsed: [] };

  const from = withCity(intent.from, city);
  const to = withCity(intent.to, city);

  if (intent.kind === 'compare') {
    return {
      response: formatComparison(intent.from, intent.to, await compareModes(provider, from, to)),
      source: 'rules',
      toolsUsed: ['compare_modes'],
    };
  }
  const routes = await provider.plan(from, to, intent.mode);
  return {
    response: formatRoutes(intent.from, intent.to, intent.mode, routes),
    source: 'rules',
    toolsUsed: ['plan_journey'],
  };
}

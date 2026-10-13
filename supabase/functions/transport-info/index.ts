import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { answerWithAgent } from '../_shared/agent.ts';
import { answerWithRules } from '../_shared/fallback.ts';
import { RateLimiter } from '../_shared/rateLimit.ts';
import { OsmProvider, RoutesClient } from '../_shared/routes.ts';
import type { RouteProvider } from '../_shared/routes.ts';
import { UserFacingError } from '../_shared/types.ts';
import type { AssistantResult } from '../_shared/types.ts';
import { validateRequest } from '../_shared/validate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const limiter = new RateLimiter(20, 60_000);
// Google Routes (transit + live traffic) when a key is set; keyless OSM driving-only fallback otherwise.
const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
const provider: RouteProvider = mapsKey
  ? new RoutesClient(mapsKey)
  : new OsmProvider(Deno.env.get('OSM_CONTACT') ?? 'india-transport-assistant');
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5';

// Service-role client: query logging is write-only from the server, never from the browser.
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const admin = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const started = Date.now();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!limiter.allow(ip)) return json({ error: 'Too many requests. Please slow down.' }, 429);

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new UserFacingError('Invalid JSON body.');
    }
    const { query, history, sessionId, city } = validateRequest(body);

    let result: AssistantResult;
    if (anthropicKey) {
      try {
        result = await answerWithAgent(provider, city, query, history, { apiKey: anthropicKey, model });
      } catch (err) {
        console.error('agent failed, falling back to rules', (err as Error).message);
        result = await answerWithRules(provider, city, query);
      }
    } else {
      result = await answerWithRules(provider, city, query);
    }

    const latencyMs = Date.now() - started;
    console.log(JSON.stringify({ evt: 'query', provider: provider.name, city, source: result.source, tools: result.toolsUsed, latencyMs }));

    if (admin) {
      const { error } = await admin.from('transport_queries').insert({
        query,
        session_id: sessionId,
        source: result.source,
        tools_used: result.toolsUsed,
        latency_ms: latencyMs,
      });
      if (error) console.error('log insert failed', error.message);
    }

    return json({ response: result.response, source: result.source, toolsUsed: result.toolsUsed });
  } catch (err) {
    if (err instanceof UserFacingError) return json({ error: err.message }, err.status);
    console.error('unhandled', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

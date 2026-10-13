import { describe, expect, it, vi } from 'vitest';
import { answerWithAgent, systemPrompt } from './agent.ts';
import type { RouteProvider } from './routes.ts';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const asFetch = (f: unknown) => f as unknown as typeof fetch;
const provider = (plan = vi.fn(async () => [{ mode: 'TRANSIT', minutes: 40, distanceKm: 12, steps: [] }])): RouteProvider => ({
  name: 'google',
  plan: plan as unknown as RouteProvider['plan'],
});
const toolUse = (name: string, input: Record<string, unknown>) =>
  reply({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name, input }] });
const lastToolResult = (f: ReturnType<typeof vi.fn>, call: number) =>
  JSON.parse((f.mock.calls[call][1] as RequestInit).body as string).messages.at(-1).content[0];

describe('answerWithAgent', () => {
  it('runs plan_journey with the user city appended and returns the final text', async () => {
    const p = provider();
    const f = vi
      .fn()
      .mockResolvedValueOnce(toolUse('plan_journey', { from: 'Howrah', to: 'Sector V', mode: 'transit' }))
      .mockResolvedValueOnce(reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'About 40 min by metro.' }] }));

    const out = await answerWithAgent(p, 'Kolkata', 'howrah to sector v', [], { apiKey: 'k', model: 'm', doFetch: asFetch(f) });

    expect(out).toEqual({ response: 'About 40 min by metro.', source: 'agent', toolsUsed: ['plan_journey'] });
    expect(p.plan).toHaveBeenCalledWith('Howrah, Kolkata', 'Sector V, Kolkata', 'TRANSIT');
    expect(lastToolResult(f, 1)).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
  });

  it('supports compare_modes across three modes', async () => {
    const p = provider();
    const f = vi
      .fn()
      .mockResolvedValueOnce(toolUse('compare_modes', { from: 'A', to: 'B' }))
      .mockResolvedValueOnce(reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }));
    await answerWithAgent(p, 'Mumbai', 'which is faster', [], { apiKey: 'k', model: 'm', doFetch: asFetch(f) });
    expect(p.plan).toHaveBeenCalledTimes(3);
  });

  it('stops after the step budget', async () => {
    const f = vi.fn(async () => toolUse('plan_journey', { from: 'A', to: 'B' }));
    const out = await answerWithAgent(provider(), 'Kolkata', 'q', [], { apiKey: 'k', model: 'm', doFetch: asFetch(f) });
    expect(f).toHaveBeenCalledTimes(4);
    expect(out.response).toMatch(/too many lookups/);
  });

  it('throws on upstream API failure so the caller can fall back', async () => {
    await expect(
      answerWithAgent(provider(), 'Kolkata', 'q', [], { apiKey: 'k', model: 'm', doFetch: asFetch(async () => reply({}, 500)) }),
    ).rejects.toThrow(/500/);
  });

  it('feeds tool failures back as data instead of throwing', async () => {
    const p = provider(vi.fn(async () => { throw new Error('quota exceeded'); }));
    const f = vi
      .fn()
      .mockResolvedValueOnce(toolUse('plan_journey', { from: 'A', to: 'B' }))
      .mockResolvedValueOnce(reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Routing is unavailable.' }] }));
    const out = await answerWithAgent(p, 'Kolkata', 'q', [], { apiKey: 'k', model: 'm', doFetch: asFetch(f) });
    expect(out.response).toBe('Routing is unavailable.');
    expect(lastToolResult(f, 1).content).toContain('quota exceeded');
  });

  it('rejects tool calls with missing arguments without hitting the provider', async () => {
    const p = provider();
    const f = vi
      .fn()
      .mockResolvedValueOnce(toolUse('plan_journey', { from: 'A' }))
      .mockResolvedValueOnce(reply({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Where to?' }] }));
    await answerWithAgent(p, 'Kolkata', 'q', [], { apiKey: 'k', model: 'm', doFetch: asFetch(f) });
    expect(p.plan).not.toHaveBeenCalled();
  });
});

describe('systemPrompt', () => {
  it('encodes the honesty rules that matter in India', () => {
    const s = systemPrompt('Delhi NCR');
    expect(s).toContain('Delhi NCR');
    expect(s).toMatch(/Never estimate auto-rickshaw/);
    expect(s).toMatch(/PNR/);
    expect(s).toMatch(/Asia\/Kolkata|India time/);
  });
});

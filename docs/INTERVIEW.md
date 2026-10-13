# Interview cheat sheet

## 30-second pitch
"I built a transport assistant for Indian cities. India has no free TfL-style API, so I put a provider interface behind an LLM tool-calling agent: it can plan metro, local-train and bus journeys with fares in rupees, and compare them against live-traffic car and two-wheeler times. The model only reports what the tools return. It's React and TypeScript with a Supabase Edge Function, three tiers of graceful degradation, validation, rate limiting, 60 tests and CI."

## Things to be ready to explain
1. **Why tool use?** Data is live; the model picks the tool; answers are grounded; the tool list is an auditable boundary.
2. **How do you stop hallucination?** The prompt forbids inventing facts; fares appear only if returned; tool errors are passed back so the model says "no data"; auto/cab fares are explicitly never estimated.
3. **Why a RouteProvider interface?** India's data is fragmented. Google covers many metros today; city GTFS feeds can slot in without touching tools, agent or UI.
4. **Why a city picker?** Place names are ambiguous across India ("Sector 62", "Civil Lines"). The city is appended server-side and given to the model; it is allow-listed to prevent prompt injection through that field.
5. **Failure modes.** Claude down → rules + Google. Google key missing → OSM driving only, with an honest message for other modes. One mode failing in `compare_modes` doesn't fail the others (`Promise.allSettled`).
6. **Security.** RLS originally let anyone read all queries (`USING (true)`) - fixed; writes via service role; input validated; output rendered without HTML injection; Google key is billable so it needs restriction and quota.
7. **Cost/latency.** 4-step cap, small model, token cap, 10 s timeouts, per-IP rate limit, Maps field mask limits billed fields.
8. **Testing.** Pure logic in `_shared/` (testable in Node), fetch injected, all upstreams mocked.

## Honest trade-offs (say these)
- Transit is schedule-based, not live positions.
- Not verified against live Google/OSM in CI; only mocked contracts.
- Rate limiter is in-memory per isolate.
- Rule-based parser handles English patterns only.

## Likely follow-ups
- "How would you add live buses?" → GTFS-realtime provider (e.g. Delhi OTD) behind the same interface; new `get_live_buses` tool.
- "Indian Railways?" → no official API; I'd rather say so than scrape unofficial endpoints with unclear terms. Possible later via a licensed provider.
- "Multilingual?" → the model handles Hindi/Bengali input; I'd add language to the system prompt and localise the UI strings.
- "How to evaluate quality?" → fixed query set with expected tool calls plus LLM-as-judge on final text.

## Before the interview
- [ ] Get a Google Maps key (Routes API), restrict it, set a quota, and run 5 real queries in *your* city
- [ ] Deploy and put the live URL in the README
- [ ] Record `docs/demo.gif`; replace `OWNER/REPO` in the badge

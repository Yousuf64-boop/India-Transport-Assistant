/**
 * Best-effort sliding-window limiter held in isolate memory.
 * Edge isolates are ephemeral and not shared, so this blunts bursts from one
 * client but is NOT a hard guarantee - see README "Known limitations".
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private limit: number, private windowMs: number) {}

  /** Returns true if the request is allowed. */
  allow(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    // Opportunistic cleanup so the map cannot grow without bound.
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) {
        if (v.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
      }
    }
    return true;
  }
}

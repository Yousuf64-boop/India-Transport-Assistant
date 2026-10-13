import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimit.ts';

describe('RateLimiter', () => {
  it('blocks after the limit and recovers after the window', () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('a', 100)).toBe(true);
    expect(rl.allow('a', 200)).toBe(false);
    expect(rl.allow('a', 1201)).toBe(true);
  });

  it('tracks keys independently', () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('b', 0)).toBe(true);
    expect(rl.allow('a', 1)).toBe(false);
  });
});

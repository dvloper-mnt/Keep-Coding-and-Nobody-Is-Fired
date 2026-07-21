import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit, type RateLimitStore } from './rate-limit';

function storeReturning(count: number): RateLimitStore {
  return { hit: vi.fn(async () => count) };
}

describe('checkRateLimit', () => {
  it('allows when the hit count is at or under the limit', async () => {
    const result = await checkRateLimit(storeReturning(1), 'ip:1.2.3.4', {
      limit: 5,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(true);
  });

  it('allows exactly at the limit (Nth request)', async () => {
    const result = await checkRateLimit(storeReturning(5), 'ip:1.2.3.4', {
      limit: 5,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks once the hit count exceeds the limit', async () => {
    const result = await checkRateLimit(storeReturning(6), 'ip:1.2.3.4', {
      limit: 5,
      windowSeconds: 60,
    });
    expect(result.allowed).toBe(false);
  });

  it('uses the key and window when hitting the store', async () => {
    const store = storeReturning(1);
    await checkRateLimit(store, 'ip:9.9.9.9', { limit: 3, windowSeconds: 30 });
    expect(store.hit).toHaveBeenCalledWith('ip:9.9.9.9', 30);
  });

  it('fails open if the store throws (never blocks a real player on infra error)', async () => {
    const store: RateLimitStore = {
      hit: vi.fn(async () => {
        throw new Error('redis down');
      }),
    };
    const result = await checkRateLimit(store, 'ip:1.2.3.4', { limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
  });
});

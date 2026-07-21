import type Redis from 'ioredis';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
}

// Abstracts the storage so the decision logic is testable without Redis.
export interface RateLimitStore {
  // Records one hit for `key`, returns the running count in the current window.
  hit(key: string, windowSeconds: number): Promise<number>;
}

// Fixed-window counter. Fails OPEN: if the store errors we let the request
// through — a transient Redis hiccup must never block a real player mid-demo.
export async function checkRateLimit(
  store: RateLimitStore,
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  try {
    const count = await store.hit(key, options.windowSeconds);
    return { allowed: count <= options.limit };
  } catch {
    return { allowed: true };
  }
}

// Redis-backed store: INCR the key, set its TTL on first hit so the window
// slides forward and the counter self-expires.
export function redisRateLimitStore(redis: Redis): RateLimitStore {
  return {
    async hit(key, windowSeconds) {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      return count;
    },
  };
}

import type Redis from 'ioredis';

export interface GenerationLockStore {
  acquire(key: string, ttlSeconds: number): Promise<boolean>;
}

// Fails CLOSED on a store error: skipping a generation (loser falls back to the
// curated challenge) is cheaper than risking a duplicate billable Bedrock call.
export async function tryAcquireGenerationLock(
  store: GenerationLockStore,
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  try {
    return await store.acquire(key, ttlSeconds);
  } catch {
    return false;
  }
}

// SET NX is atomic: the first caller gets 'OK', concurrent callers get null. The
// TTL self-releases the lock if the holder dies mid-generation.
export function redisGenerationLockStore(redis: Redis): GenerationLockStore {
  return {
    async acquire(key, ttlSeconds) {
      const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    },
  };
}

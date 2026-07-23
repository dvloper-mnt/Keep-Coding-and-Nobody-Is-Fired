import type Redis from 'ioredis';

export interface SessionLockStore {
  acquire(key: string, ttlSeconds?: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

export interface SessionLockOptions {
  retries?: number;
  retryDelayMs?: number;
  ttlSeconds?: number;
}

const DEFAULT_RETRIES = 25;
const DEFAULT_RETRY_DELAY_MS = 20;
const DEFAULT_TTL_SECONDS = 5;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Serializes a read-modify-write critical section per session so two concurrent
// requests can't clobber each other's writes. If the lock can't be acquired
// within the retry budget the section runs anyway WITHOUT the lock: a stuck lock
// must never freeze a real player mid-demo (availability over strict safety).
export async function withSessionLock<T>(
  store: SessionLockStore,
  sessionId: string,
  critical: () => Promise<T>,
  options: SessionLockOptions = {},
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = `lock:session:${sessionId}`;

  let acquired = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (await store.acquire(key, ttlSeconds)) {
      acquired = true;
      break;
    }
    if (attempt < retries) await delay(retryDelayMs);
  }

  if (!acquired) return critical();

  try {
    return await critical();
  } finally {
    await store.release(key);
  }
}

export function redisSessionLockStore(redis: Redis): SessionLockStore {
  return {
    async acquire(key, ttlSeconds = DEFAULT_TTL_SECONDS) {
      const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    },
    async release(key) {
      await redis.del(key);
    },
  };
}

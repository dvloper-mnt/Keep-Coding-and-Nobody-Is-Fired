import { describe, expect, it } from 'vitest';
import {
  tryAcquireGenerationLock,
  type GenerationLockStore,
} from './generation-lock';

// In-memory stand-in for Redis SET NX: first acquire for a key wins, the rest
// lose until the key is released. Models the atomicity the real lock relies on.
function fakeAtomicStore(): GenerationLockStore & { release(key: string): void } {
  const held = new Set<string>();
  return {
    async acquire(key) {
      if (held.has(key)) return false;
      held.add(key);
      return true;
    },
    release(key) {
      held.delete(key);
    },
  };
}

describe('tryAcquireGenerationLock', () => {
  it('grants the lock to the first caller', async () => {
    const store = fakeAtomicStore();
    expect(await tryAcquireGenerationLock(store, 'lock:gen:ROOM', 30)).toBe(true);
  });

  it('denies a second caller while the lock is held', async () => {
    const store = fakeAtomicStore();
    await tryAcquireGenerationLock(store, 'lock:gen:ROOM', 30);
    expect(await tryAcquireGenerationLock(store, 'lock:gen:ROOM', 30)).toBe(false);
  });

  it('lets exactly ONE of many concurrent callers win (the race the bug was)', async () => {
    const store = fakeAtomicStore();
    const attempts = Array.from({ length: 10 }, () =>
      tryAcquireGenerationLock(store, 'lock:gen:ROOM', 30),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((won) => won)).toHaveLength(1);
  });

  it('isolates locks per session key', async () => {
    const store = fakeAtomicStore();
    expect(await tryAcquireGenerationLock(store, 'lock:gen:A', 30)).toBe(true);
    expect(await tryAcquireGenerationLock(store, 'lock:gen:B', 30)).toBe(true);
  });

  it('re-grants after release', async () => {
    const store = fakeAtomicStore();
    await tryAcquireGenerationLock(store, 'lock:gen:ROOM', 30);
    store.release('lock:gen:ROOM');
    expect(await tryAcquireGenerationLock(store, 'lock:gen:ROOM', 30)).toBe(true);
  });

  it('fails closed when the store throws (never risks a duplicate generation)', async () => {
    const store: GenerationLockStore = {
      acquire: () => Promise.reject(new Error('redis down')),
    };
    expect(await tryAcquireGenerationLock(store, 'lock:gen:ROOM', 30)).toBe(false);
  });
});

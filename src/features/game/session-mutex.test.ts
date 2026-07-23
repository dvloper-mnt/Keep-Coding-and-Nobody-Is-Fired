import { describe, expect, it } from 'vitest';
import { withSessionLock, type SessionLockStore } from './session-mutex';

// Fake atomic store: SET NX semantics + manual release, models the real Redis lock.
function fakeStore(): SessionLockStore & { heldKeys: () => string[] } {
  const held = new Set<string>();
  return {
    async acquire(key) {
      if (held.has(key)) return false;
      held.add(key);
      return true;
    },
    async release(key) {
      held.delete(key);
    },
    heldKeys: () => [...held],
  };
}

describe('withSessionLock', () => {
  it('runs the critical section and returns its result', async () => {
    const store = fakeStore();
    const result = await withSessionLock(store, 'S1', async () => 42);
    expect(result).toBe(42);
  });

  it('releases the lock after the critical section (success)', async () => {
    const store = fakeStore();
    await withSessionLock(store, 'S1', async () => 'ok');
    expect(store.heldKeys()).toEqual([]);
  });

  it('releases the lock even if the critical section throws', async () => {
    const store = fakeStore();
    await expect(
      withSessionLock(store, 'S1', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(store.heldKeys()).toEqual([]);
  });

  it('serializes two concurrent critical sections on the same session (no interleave)', async () => {
    const store = fakeStore();
    const log: string[] = [];
    const critical = (id: string) =>
      withSessionLock(store, 'S1', async () => {
        log.push(`${id}:start`);
        await Promise.resolve();
        log.push(`${id}:end`);
      });

    await Promise.all([critical('A'), critical('B')]);

    // Whatever order, each section must finish before the other starts.
    const aStart = log.indexOf('A:start');
    const aEnd = log.indexOf('A:end');
    const bStart = log.indexOf('B:start');
    const bEnd = log.indexOf('B:end');
    const noOverlap =
      (aEnd < bStart) || (bEnd < aStart);
    expect(noOverlap).toBe(true);
  });

  it('does not block different sessions from running concurrently', async () => {
    const store = fakeStore();
    const r = await Promise.all([
      withSessionLock(store, 'S1', async () => 'a'),
      withSessionLock(store, 'S2', async () => 'b'),
    ]);
    expect(r).toEqual(['a', 'b']);
  });

  it('retries until the lock frees, then runs (does not give up immediately)', async () => {
    const store = fakeStore();
    await store.acquire('S1'); // pre-held by someone else
    const run = withSessionLock(store, 'S1', async () => 'got-it', {
      retries: 5,
      retryDelayMs: 1,
    });
    // free it shortly after
    setTimeout(() => void store.release('S1'), 2);
    await expect(run).resolves.toBe('got-it');
  });

  it('falls through and runs WITHOUT the lock if it can never be acquired (never deadlock the game)', async () => {
    const store = fakeStore();
    await store.acquire('S1'); // held forever
    const result = await withSessionLock(store, 'S1', async () => 'ran-anyway', {
      retries: 2,
      retryDelayMs: 1,
    });
    // Availability over strict safety: a stuck lock must not freeze a real player.
    expect(result).toBe('ran-anyway');
  });
});

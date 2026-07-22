import { MAX_LIVES } from '@/src/lib/constants';
import { describe, expect, it } from 'vitest';
import {
  createInitialLives,
  getLivesForRole,
  loseLife,
  normalizeSessionLives,
} from './lives-engine';
import { makeSession } from './testing/fixtures';

describe('createInitialLives', () => {
  it('returns MAX_LIVES for both roles', () => {
    expect(createInitialLives()).toStrictEqual({
      coderLives: MAX_LIVES,
      helperLives: MAX_LIVES,
    });
  });
});

describe('normalizeSessionLives', () => {
  it('fills missing lives fields with MAX_LIVES', () => {
    const session = makeSession({
      coderLives: undefined as unknown as number,
      helperLives: undefined as unknown as number,
    });

    const normalized = normalizeSessionLives(session);

    expect(normalized.coderLives).toBe(MAX_LIVES);
    expect(normalized.helperLives).toBe(MAX_LIVES);
  });
});

describe('loseLife', () => {
  it('decrements coder lives without ending the game when lives remain', () => {
    const session = makeSession({ coderLives: 3, helperLives: 3 });

    const updated = loseLife(session, 'coder');

    expect(updated.coderLives).toBe(2);
    expect(updated.helperLives).toBe(3);
    expect(updated.status).toBe('playing');
    expect(updated.defeatReason).toBeUndefined();
  });

  it('decrements helper lives without affecting coder lives', () => {
    const session = makeSession({ coderLives: 3, helperLives: 3 });

    const updated = loseLife(session, 'helper');

    expect(updated.helperLives).toBe(2);
    expect(updated.coderLives).toBe(3);
    expect(updated.status).toBe('playing');
  });

  it('triggers defeat with coder_lives when coder reaches 0', () => {
    const session = makeSession({ coderLives: 1 });

    const updated = loseLife(session, 'coder');

    expect(updated.coderLives).toBe(0);
    expect(updated.status).toBe('defeat');
    expect(updated.defeatReason).toBe('coder_lives');
  });

  it('triggers defeat with helper_lives when helper reaches 0', () => {
    const session = makeSession({ helperLives: 1 });

    const updated = loseLife(session, 'helper');

    expect(updated.helperLives).toBe(0);
    expect(updated.status).toBe('defeat');
    expect(updated.defeatReason).toBe('helper_lives');
  });

  it('does not change session when already terminal', () => {
    const session = makeSession({ status: 'defeat', coderLives: 1 });

    const updated = loseLife(session, 'coder');

    expect(updated).toStrictEqual(session);
  });

  it('does not decrement below 0', () => {
    const session = makeSession({ coderLives: 0, status: 'defeat' });

    const updated = loseLife(session, 'coder');

    expect(updated.coderLives).toBe(0);
  });
});

describe('getLivesForRole', () => {
  it('returns role-specific lives with fallback', () => {
    const session = makeSession({ coderLives: 2, helperLives: 1 });

    expect(getLivesForRole(session, 'coder')).toBe(2);
    expect(getLivesForRole(session, 'helper')).toBe(1);
  });
});
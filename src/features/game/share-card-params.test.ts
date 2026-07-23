import { describe, expect, it } from 'vitest';
import { parseShareCardParams } from './share-card-params';

// ---------------------------------------------------------------------------
// parseShareCardParams reads and validates untrusted query params for the OG
// share-card endpoint. It composes `sanitizeTeamName` for the team name and
// validates score/rounds as non-negative integers under a sane upper bound.
// Since the payload is rendered as a PNG (never as HTML), we do not defend
// against XSS here — we defend against control chars in the team name and
// nonsense/huge numeric values that could break the layout.
// ---------------------------------------------------------------------------

function url(search: Record<string, string>): URL {
  const u = new URL('https://example.com/api/game/share-card');
  for (const [k, v] of Object.entries(search)) u.searchParams.set(k, v);
  return u;
}

describe('parseShareCardParams — happy path', () => {
  it('accepts a valid triple and returns cleaned values', () => {
    const result = parseShareCardParams(url({ score: '12345', rounds: '7', team: 'Los Debuggers' }));

    expect(result).toEqual({
      ok: true,
      score: 12345,
      rounds: 7,
      team: 'Los Debuggers',
    });
  });

  it('trims and sanitizes the team name via sanitizeTeamName', () => {
    const result = parseShareCardParams(
      url({ score: '10', rounds: '1', team: '  Los\n  Debuggers  ' }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.team).toBe('Los Debuggers');
  });
});

describe('parseShareCardParams — team fallback', () => {
  it('uses the anonymous fallback when the team param is absent', () => {
    const result = parseShareCardParams(url({ score: '10', rounds: '1' }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.team).toBe('Equipo anónimo');
  });

  it('uses the anonymous fallback when the team is only whitespace', () => {
    const result = parseShareCardParams(url({ score: '10', rounds: '1', team: '   ' }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.team).toBe('Equipo anónimo');
  });
});

describe('parseShareCardParams — score validation', () => {
  it('rejects a missing score', () => {
    const result = parseShareCardParams(url({ rounds: '1', team: 'X' }));

    expect(result).toEqual({ ok: false, reason: 'Puntaje inválido.' });
  });

  it('rejects a non-numeric score', () => {
    const result = parseShareCardParams(url({ score: 'abc', rounds: '1', team: 'X' }));

    expect(result.ok).toBe(false);
  });

  it('rejects a negative score', () => {
    const result = parseShareCardParams(url({ score: '-1', rounds: '1', team: 'X' }));

    expect(result.ok).toBe(false);
  });

  it('rejects a non-integer score', () => {
    const result = parseShareCardParams(url({ score: '1.5', rounds: '1', team: 'X' }));

    expect(result.ok).toBe(false);
  });

  it('accepts zero', () => {
    const result = parseShareCardParams(url({ score: '0', rounds: '0', team: 'X' }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toBe(0);
      expect(result.rounds).toBe(0);
    }
  });
});

describe('parseShareCardParams — rounds validation', () => {
  it('rejects a missing rounds', () => {
    const result = parseShareCardParams(url({ score: '1', team: 'X' }));

    expect(result.ok).toBe(false);
  });

  it('rejects a negative rounds value', () => {
    const result = parseShareCardParams(url({ score: '1', rounds: '-3', team: 'X' }));

    expect(result.ok).toBe(false);
  });

  it('rejects a non-integer rounds value', () => {
    const result = parseShareCardParams(url({ score: '1', rounds: '2.7', team: 'X' }));

    expect(result.ok).toBe(false);
  });
});

describe('parseShareCardParams — upper bounds', () => {
  it('rejects a score above the safety cap', () => {
    // The cap is a defense against nonsense that would break the card layout.
    // 100 million rounds is already deep into fantasy territory for this game.
    const result = parseShareCardParams(
      url({ score: '999999999999', rounds: '1', team: 'X' }),
    );

    expect(result.ok).toBe(false);
  });

  it('rejects a rounds count above the safety cap', () => {
    const result = parseShareCardParams(
      url({ score: '10', rounds: '999999999', team: 'X' }),
    );

    expect(result.ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { shouldRunFinalFetch } from './usePolling';

describe('shouldRunFinalFetch', () => {
  const cases: Array<{ wasEnabled: boolean; enabled: boolean; expected: boolean; reason: string }> = [
    { wasEnabled: true, enabled: false, expected: true, reason: 'enabled→disabled edge: run the final fetch' },
    { wasEnabled: false, enabled: false, expected: false, reason: 'never enabled: nothing to fetch' },
    { wasEnabled: true, enabled: true, expected: false, reason: 'still enabled: the interval handles it' },
    { wasEnabled: false, enabled: true, expected: false, reason: 'just enabled: not a final fetch' },
  ];

  it.each(cases)('returns $expected when $reason', ({ wasEnabled, enabled, expected }) => {
    expect(shouldRunFinalFetch(wasEnabled, enabled)).toBe(expected);
  });
});

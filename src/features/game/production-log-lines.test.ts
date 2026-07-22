import { describe, expect, it } from 'vitest';
import { SELECTABLE_LANGUAGES } from './challenge-language';
import { productionLogScript } from './production-log-lines';
import type { ChallengeLanguage } from './game-types';

describe('productionLogScript', () => {
  it('returns a non-empty script for every selectable language', () => {
    for (const language of SELECTABLE_LANGUAGES) {
      const lines = productionLogScript(language);
      expect(lines.length).toBeGreaterThan(0);
    }
  });

  it('resolves "random" to a concrete language script (never empty)', () => {
    const lines = productionLogScript('random');
    expect(lines.length).toBeGreaterThan(0);
  });

  it('builds toward an incident: the last lines are ERROR level', () => {
    for (const language of SELECTABLE_LANGUAGES) {
      const lines = productionLogScript(language);
      expect(lines[lines.length - 1].level).toBe('error');
    }
  });

  it('opens calmly: the first line is not an error', () => {
    for (const language of SELECTABLE_LANGUAGES) {
      const lines = productionLogScript(language);
      expect(lines[0].level).not.toBe('error');
    }
  });

  it('every line has a timestamp and non-empty text', () => {
    for (const language of SELECTABLE_LANGUAGES) {
      for (const line of productionLogScript(language)) {
        expect(line.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        expect(line.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('uses only known log levels', () => {
    const levels = new Set(['info', 'warn', 'error']);
    for (const language of SELECTABLE_LANGUAGES) {
      for (const line of productionLogScript(language)) {
        expect(levels.has(line.level)).toBe(true);
      }
    }
  });

  it('flavours the stack trace per language (PHP shows a Laravel-style frame)', () => {
    const php = productionLogScript('php').map((l) => l.text).join('\n');
    expect(php).toMatch(/App\\Http\\Controllers/);
  });

  it('flavours the stack trace per language (Python shows a Traceback)', () => {
    const py = productionLogScript('python').map((l) => l.text).join('\n');
    expect(py).toMatch(/Traceback/i);
  });

  it('flavours the stack trace per language (Go shows a panic)', () => {
    const go = productionLogScript('go').map((l) => l.text).join('\n');
    expect(go).toMatch(/panic:/);
  });

  it('is deterministic for a concrete language (same input, same script)', () => {
    const a = productionLogScript('typescript');
    const b = productionLogScript('typescript');
    expect(a).toEqual(b);
  });

  it('accepts every ChallengeLanguage value without throwing', () => {
    const all: ChallengeLanguage[] = [...SELECTABLE_LANGUAGES];
    for (const language of all) {
      expect(() => productionLogScript(language)).not.toThrow();
    }
  });
});

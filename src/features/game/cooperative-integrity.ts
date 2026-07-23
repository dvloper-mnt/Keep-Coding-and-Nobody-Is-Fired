import type { Challenge, ChallengeStep } from './game-types';

// ---------------------------------------------------------------------------
// Cooperative integrity: the Coder sees the code + error (the symptom) and the
// Helper sees theory (rules) + domain facts (knowledge) but NOT the code. The
// game only works if neither half can solve alone — they must talk. A challenge
// LEAKS when a Helper rule/knowledge hands over the concrete solution symbol,
// letting the Helper dictate the answer without the Coder's symptom.
//
// This module detects that leak deterministically over the parsed Challenge,
// so a leaky challenge is rejected even when the model ignores the prompt. It
// composes with isValidChallenge: structure first, then cooperative integrity.
// See .kiro/specs/cooperative-prompt-integrity/design.md (D2).
// ---------------------------------------------------------------------------

export type IntegrityResult =
  | { ok: true }
  | { ok: false; step: number; reason: string };

// Tokens that appear in code but are NOT the concrete solution symbol: framework
// names, HTTP status codes, and generic keywords. Mentioning these in abstract
// theory is legitimate and must not trip the diff-symbol detector (D2.b).
const IGNORED_TOKENS = new Set<string>([
  // framework / language surface that theory legitimately names
  'route',
  'controller',
  'class',
  'const',
  'let',
  'var',
  'function',
  'return',
  'import',
  'export',
  'use',
  'public',
  'private',
  'async',
  'await',
  'new',
  'this',
  'null',
  'true',
  'false',
  // HTTP status codes (theory refers to them; they are not the fix)
  '400',
  '401',
  '403',
  '404',
  '405',
  '422',
  '500',
  '502',
  '503',
]);

// A symbol shorter than this is too generic to treat as a leak signal (e.g. a
// single letter or a two-char operator), and risks false positives.
const MIN_SYMBOL_LENGTH = 3;

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase();
}

// Split into identifier-like tokens: letters, digits, underscore. Everything
// else (punctuation, brackets, quotes) is a boundary.
function tokenize(text: string): string[] {
  const matches = normalize(text).match(/[a-z0-9_]+/g);
  return matches ?? [];
}

// The set of tokens that CHANGE between the broken code and the patched code —
// i.e. the symbols the fix introduces or removes. The corrected symbol lives
// here; if a Helper entry names it, the Helper is dictating the fix.
function diffTokens(code: string, patch: string): Set<string> {
  const before = new Set(tokenize(code));
  const after = new Set(tokenize(patch));
  const changed = new Set<string>();

  for (const token of after) {
    if (!before.has(token)) changed.add(token);
  }
  for (const token of before) {
    if (!after.has(token)) changed.add(token);
  }

  // Drop tokens too short or too generic to be a meaningful leak signal.
  for (const token of [...changed]) {
    if (token.length < MIN_SYMBOL_LENGTH || IGNORED_TOKENS.has(token)) {
      changed.delete(token);
    }
  }
  return changed;
}

function stepIntegrity(step: ChallengeStep): { ok: true } | { ok: false; reason: string } {
  const helperEntries = [...step.helper_view.rules, ...step.helper_view.knowledge];
  const normalizedEntries = helperEntries.map(normalize);

  // D2.a — a Helper entry contains the text of the correct option verbatim
  // (normalized substring). The hint IS the answer.
  const correctOption = step.options[step.correct_answer];
  if (typeof correctOption === 'string' && correctOption.trim() !== '') {
    const normalizedOption = normalize(correctOption).trim();
    const leaksOption = normalizedEntries.some((entry) =>
      entry.includes(normalizedOption),
    );
    if (leaksOption) {
      return {
        ok: false,
        reason: 'A Helper rule/knowledge contains the correct option verbatim.',
      };
    }
  }

  // D2.b — a Helper entry names the corrected symbol from the code→patch diff.
  const changed = diffTokens(step.coder_view.code, step.success_state.code_patch);
  if (changed.size > 0) {
    const entryTokenSets = helperEntries.map((entry) => new Set(tokenize(entry)));
    for (const symbol of changed) {
      const leaksSymbol = entryTokenSets.some((tokens) => tokens.has(symbol));
      if (leaksSymbol) {
        return {
          ok: false,
          reason: `A Helper rule/knowledge names the corrected symbol "${symbol}".`,
        };
      }
    }
  }

  return { ok: true };
}

/**
 * Detailed integrity check: returns the first failing step and why, for logging.
 */
export function checkCooperativeIntegrity(challenge: Challenge): IntegrityResult {
  for (const step of challenge.steps) {
    const result = stepIntegrity(step);
    if (!result.ok) {
      return { ok: false, step: step.step, reason: result.reason };
    }
  }
  return { ok: true };
}

/**
 * True when NO step leaks the answer to the Helper — i.e. every step keeps the
 * information split that forces Coder and Helper to talk.
 */
export function hasCooperativeIntegrity(challenge: Challenge): boolean {
  return checkCooperativeIntegrity(challenge).ok;
}

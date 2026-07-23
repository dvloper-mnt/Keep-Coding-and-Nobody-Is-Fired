import type { Challenge, ChallengeStep } from './game-types';

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

const PLACEHOLDER_ENTRIES = new Set(['n/a', 'na', 'none', 'ninguna', 'tbd']);

// A non-empty array whose every entry is real text (not blank, not a placeholder
// like "N/A"). Used for the Helper's rules/knowledge — empty or placeholder
// entries make the challenge unplayable.
function isMeaningfulStringArray(value: unknown): value is string[] {
  if (!isStringArray(value) || value.length === 0) return false;
  return value.every((item) => {
    const trimmed = item.trim();
    return trimmed.length > 0 && !PLACEHOLDER_ENTRIES.has(trimmed.toLowerCase());
  });
}

function isValidStep(x: unknown): x is ChallengeStep {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;

  if (typeof s['step'] !== 'number' || !Number.isInteger(s['step'])) return false;

  // coder_view: { code, error } both non-empty — an empty error gives the Coder
  // no symptom to diagnose.
  const coder = s['coder_view'];
  if (typeof coder !== 'object' || coder === null) return false;
  const cv = coder as Record<string, unknown>;
  if (!isNonEmptyString(cv['code']) || !isNonEmptyString(cv['error'])) return false;

  // helper_view: rules and knowledge must be NON-EMPTY arrays of non-blank,
  // non-placeholder strings — otherwise the Helper has nothing to guide with and
  // the challenge is unplayable even though it is structurally valid.
  const helper = s['helper_view'];
  if (typeof helper !== 'object' || helper === null) return false;
  const hv = helper as Record<string, unknown>;
  if (!isMeaningfulStringArray(hv['rules']) || !isMeaningfulStringArray(hv['knowledge'])) {
    return false;
  }

  // options: exactly 4 non-empty strings
  if (!Array.isArray(s['options']) || s['options'].length !== 4) return false;
  if (!s['options'].every((o) => isNonEmptyString(o))) return false;

  // correct_answer: integer 0..3
  const ca = s['correct_answer'];
  if (typeof ca !== 'number' || !Number.isInteger(ca) || ca < 0 || ca > 3) return false;

  // success_state: { code_patch: non-empty string }
  const success = s['success_state'];
  if (typeof success !== 'object' || success === null) return false;
  const ss = success as Record<string, unknown>;
  if (!isNonEmptyString(ss['code_patch'])) return false;

  // hint is optional but must be a string if present
  if (s['hint'] !== undefined && typeof s['hint'] !== 'string') return false;

  return true;
}

export function isValidChallenge(x: unknown): x is Challenge {
  if (typeof x !== 'object' || x === null) return false;
  const c = x as Record<string, unknown>;

  if (!isNonEmptyString(c['id'])) return false;
  if (!isNonEmptyString(c['title'])) return false;
  if (!VALID_DIFFICULTIES.includes(c['difficulty'] as (typeof VALID_DIFFICULTIES)[number])) {
    return false;
  }
  if (typeof c['story_context'] !== 'string') return false;
  if (typeof c['time_limit'] !== 'number' || c['time_limit'] <= 0) return false;

  // steps: at least one, all valid
  if (!Array.isArray(c['steps']) || c['steps'].length === 0) return false;
  if (!c['steps'].every((step) => isValidStep(step))) return false;

  return true;
}

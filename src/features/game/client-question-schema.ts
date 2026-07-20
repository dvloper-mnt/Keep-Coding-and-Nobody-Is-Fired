import type { ClientQuestion, ClientQuestionCategory } from './game-types';

// ---------------------------------------------------------------------------
// Valid categories — source of truth for validation and prompt building
// ---------------------------------------------------------------------------

export const VALID_CATEGORIES = [
  'sql',
  'design-patterns',
  'architecture',
  'programming',
] as const satisfies readonly ClientQuestionCategory[];

// ---------------------------------------------------------------------------
// Type guard: validates an unknown value against the ClientQuestion contract.
// Zero `any`, zero `as` casts — narrows from `unknown`.
// ---------------------------------------------------------------------------

export function isValidQuestion(x: unknown): x is ClientQuestion {
  if (typeof x !== 'object' || x === null) return false;

  const q = x as Record<string, unknown>;

  // id: non-empty string
  if (typeof q['id'] !== 'string' || q['id'].trim() === '') return false;

  // category: one of the four valid values
  if (!VALID_CATEGORIES.includes(q['category'] as ClientQuestionCategory)) return false;

  // client_prompt: non-empty string
  if (typeof q['client_prompt'] !== 'string' || q['client_prompt'].trim() === '') return false;

  // options: exactly 4 non-empty strings
  if (!Array.isArray(q['options'])) return false;
  if (q['options'].length !== 4) return false;
  if (!q['options'].every((o) => typeof o === 'string' && o.trim() !== '')) return false;

  // correct_answer: integer between 0 and 3 inclusive
  const ca = q['correct_answer'];
  if (typeof ca !== 'number') return false;
  if (!Number.isInteger(ca)) return false;
  if (ca < 0 || ca > 3) return false;

  return true;
}

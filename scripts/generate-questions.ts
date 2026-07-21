/**
 * generate-questions.ts
 *
 * Manual generation script: calls AWS Bedrock (Claude Haiku via Converse API) to
 * propose a fresh pool of client-questions as CANDIDATES, validates them, and writes
 * them to questions.generated.json for human review.
 *
 * IMPORTANT (architecture decision — see code review):
 * - This is NOT a build hook. It does NOT run on `next build`.
 * - questions.json is the curated SOURCE OF TRUTH (committed, human-reviewed).
 * - This script writes CANDIDATES to questions.generated.json. A human reviews them
 *   (especially that each correct_answer is semantically right) before promoting any
 *   into questions.json. The LLM never publishes game content unreviewed.
 * - On any failure it leaves the curated questions.json untouched. Always exits 0.
 *
 * Run: npm run generate:questions   (then review the diff and promote manually)
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VALID_CATEGORIES, isValidQuestion } from '../src/features/game/client-question-schema';
import type { ClientQuestion, ClientQuestionCategory } from '../src/features/game/game-types';

// ---------------------------------------------------------------------------
// Config from environment (with safe defaults)
// ---------------------------------------------------------------------------

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const MODEL_ID =
  process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const QUESTIONS_PER_CATEGORY = Number(process.env['QUESTIONS_PER_CATEGORY'] ?? '5');
const MIN_QUESTIONS = Number(process.env['MIN_QUESTIONS'] ?? '8');
const BEDROCK_TIMEOUT_MS = Number(process.env['BEDROCK_TIMEOUT_MS'] ?? '30000');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DATA_DIR = resolve(import.meta.dirname, '../src/data/client-questions');
// Candidates output — reviewed by a human before promoting to questions.json.
// We never overwrite the curated source of truth (questions.json) from this script.
const OUTPUT_PATH = resolve(DATA_DIR, 'questions.generated.json');
const FALLBACK_PATH = resolve(DATA_DIR, 'questions.fallback.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFallback(): ClientQuestion[] {
  const raw = readFileSync(FALLBACK_PATH, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Fallback file is not a JSON array');
  }
  // Validate the safety net with the SAME guard as the LLM output — no blind cast.
  const valid = parsed.filter(isValidQuestion);
  if (valid.length < MIN_QUESTIONS) {
    console.error(
      `  [CRITICAL] Fallback has only ${valid.length} valid questions (< ${MIN_QUESTIONS}) — the safety net is broken`,
    );
  }
  return valid;
}

function writeFinal(questions: ClientQuestion[]): void {
  writeFileSync(OUTPUT_PATH, JSON.stringify(questions, null, 2) + '\n', 'utf-8');
}

/** Strip markdown code fences that the model might wrap around the JSON. */
function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/** Parse and extract valid ClientQuestion objects from a raw model response. */
function extractQuestions(rawText: string): { valid: ClientQuestion[]; discarded: number } {
  const cleaned = stripMarkdownFences(rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`  [WARN] JSON.parse failed: ${message}`);
    return { valid: [], discarded: 0 };
  }

  if (!Array.isArray(parsed)) {
    console.warn('  [WARN] Model response is not a JSON array');
    return { valid: [], discarded: 0 };
  }

  const valid: ClientQuestion[] = [];
  let discarded = 0;

  for (const item of parsed) {
    if (isValidQuestion(item)) {
      valid.push(item);
    } else {
      discarded++;
      const id = typeof item === 'object' && item !== null && 'id' in item
        ? String((item as Record<string, unknown>)['id'])
        : '(unknown)';
      console.warn(`  [WARN] Discarded invalid question id="${id}"`);
    }
  }

  return { valid, discarded };
}

/** Deduplicate an array of questions by id, keeping the first occurrence. */
function deduplicateById(questions: ClientQuestion[]): ClientQuestion[] {
  const seen = new Set<string>();
  const result: ClientQuestion[] = [];
  for (const q of questions) {
    if (seen.has(q.id)) {
      console.warn(`  [WARN] Duplicate id="${q.id}" — discarded`);
    } else {
      seen.add(q.id);
      result.push(q);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(category: ClientQuestionCategory, count: number): string {
  return `You are generating trivia questions for a cooperative debugging game demo.
Output ONLY a valid JSON array with exactly ${count} question objects. No markdown, no explanation, no preamble.

Each object MUST follow this exact shape:
{
  "id": "cq_${category}_<short_descriptor>",
  "category": "${category}",
  "client_prompt": "El cliente [action] y pregunta: «[question text]»",
  "options": ["option A", "option B", "option C", "option D"],
  "correct_answer": <integer 0-3 indicating the correct option index>
}

Rules:
- id: use pattern cq_${category}_<short_snake_case_descriptor> — no numbers, no sequential ids
- client_prompt: narrative Spanish, starts with "El cliente" and uses «guillemets» for the question
- options: exactly 4 strings, all non-empty, plausible distractors — one correct, three wrong
- correct_answer: integer 0, 1, 2 or 3 pointing to the correct option
- Content domain: ${category} concepts relevant to software development
- Language: Spanish for client_prompt and options
- Output: raw JSON array only, no markdown fences, no additional text`;
}

// ---------------------------------------------------------------------------
// Bedrock invocation per category
// ---------------------------------------------------------------------------

async function generateForCategory(
  client: BedrockRuntimeClient,
  category: ClientQuestionCategory,
): Promise<ClientQuestion[]> {
  console.log(`  Generating ${QUESTIONS_PER_CATEGORY} questions for category "${category}"...`);

  const command = new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: buildSystemPrompt(category, QUESTIONS_PER_CATEGORY) }],
    messages: [
      {
        role: 'user',
        content: [
          {
            text: `Generate ${QUESTIONS_PER_CATEGORY} client-question objects for category "${category}". Output only the JSON array.`,
          },
        ],
      },
    ],
    inferenceConfig: {
      maxTokens: 2048,
      temperature: 0.7,
    },
  });

  const response = await client.send(command);

  const rawText =
    response.output?.message?.content?.[0]?.text ?? '';

  if (!rawText) {
    console.warn(`  [WARN] Empty response for category "${category}"`);
    return [];
  }

  const { valid, discarded } = extractQuestions(rawText);
  console.log(
    `  → ${valid.length} valid, ${discarded} discarded for "${category}"`,
  );
  return valid;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== generate-questions: starting ===');
  console.log(`  Region:  ${REGION}`);
  console.log(`  Model:   ${MODEL_ID}`);
  console.log(`  Target:  ${QUESTIONS_PER_CATEGORY} per category × ${VALID_CATEGORIES.length} categories`);
  console.log(`  Min:     ${MIN_QUESTIONS} valid questions to use generated output`);

  const client = new BedrockRuntimeClient({ region: REGION });

  // Collect results per category; partial failures are tolerated
  const allValid: ClientQuestion[] = [];

  const categoryPromises = VALID_CATEGORIES.map((category) =>
    generateForCategory(client, category).then((questions) => {
      allValid.push(...questions);
    }),
  );

  // Apply timeout to the entire batch
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Bedrock batch timeout after ${BEDROCK_TIMEOUT_MS}ms`)),
      BEDROCK_TIMEOUT_MS,
    ),
  );

  await Promise.race([Promise.allSettled(categoryPromises), timeoutPromise]);

  // Deduplicate
  const deduplicated = deduplicateById(allValid);

  // Threshold check
  if (deduplicated.length >= MIN_QUESTIONS) {
    writeFinal(deduplicated);
    console.log(`✅ GENERATED (${deduplicated.length} fresh questions from Bedrock)`);
  } else {
    const fallback = loadFallback();
    writeFinal(fallback);
    console.log(
      `⚠️  FALLBACK (only ${deduplicated.length} valid questions — below threshold of ${MIN_QUESTIONS})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Entry point — catch-all guarantees exit 0 and a valid questions.json
// ---------------------------------------------------------------------------

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`❌ FALLBACK (${message})`);

  try {
    const fallback = loadFallback();
    writeFinal(fallback);
    console.log('  Fallback written successfully.');
  } catch (fallbackErr: unknown) {
    const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
    console.error(`  [CRITICAL] Could not write fallback: ${fbMsg}`);
    // Still exit 0 — never break the build
  }

  process.exit(0);
});

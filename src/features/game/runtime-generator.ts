import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { dumpBedrockResponse } from './bedrock-response-log';
import { isValidChallenge } from './challenge-schema';
import { difficultyInstruction } from './challenge-difficulty';
import { languageInstruction, resolveLanguage } from './challenge-language';
import type { Challenge, ChallengeLanguage, Difficulty } from './game-types';

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const MODEL_ID =
  process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

const GUARDRAIL_ID = process.env['BEDROCK_GUARDRAIL_ID'];
const GUARDRAIL_VERSION = process.env['BEDROCK_GUARDRAIL_VERSION'];

// Apply the content guardrail when configured. Absent (e.g. local dev without
// the env vars) → undefined, so the call runs without a guardrail.
function guardrailConfig() {
  if (!GUARDRAIL_ID || !GUARDRAIL_VERSION) return undefined;
  return { guardrailIdentifier: GUARDRAIL_ID, guardrailVersion: GUARDRAIL_VERSION };
}
const RUNTIME_TIMEOUT_MS = Number(process.env['BEDROCK_RUNTIME_TIMEOUT_MS'] ?? '30000');

// A valid challenge is a few KB. This caps a runaway/malformed Bedrock response
// from growing the buffer unbounded and exhausting server memory mid-demo.
const MAX_STREAM_BUFFER_BYTES = 200_000;

// In local development, skip the Bedrock call entirely (and fast) if there are
// no obvious signs of AWS credentials. This prevents 10-30s delays on every
// game start when the developer has no Bedrock access configured.
function shouldSkipBedrockInDev(): boolean {
  if (process.env.NODE_ENV !== 'development') return false;

  const hasCredentialHint =
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.AWS_PROFILE ||
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
    process.env.AWS_EXECUTION_ENV; // Lambda / ECS / etc.

  return !hasCredentialHint;
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function logBedrockResponse(
  outcome: string,
  rawText: string,
  meta?: Record<string, unknown>,
): void {
  const dumpPath = dumpBedrockResponse(outcome, rawText, meta);
  if (!dumpPath) return;

  const message = `[bedrock] raw response saved to ${dumpPath}`;
  if (outcome === 'success' || outcome === 'streaming-success') {
    console.log(message);
  } else {
    console.error(message);
  }
}

const SYSTEM_PROMPT = `You generate debugging challenges for a two-player cooperative game.

THE GAME (understand it before generating):
- The CODER sees a code snippet with ONE bug and the error message it produces. The Coder sees no explanation.
- The HELPER does NOT see the code or the error. The Helper only sees "rules" (language/framework theory) and "knowledge" (facts about the system's domain), and guides the Coder by talking to them.
- To solve it, the Coder describes the error out loud and the Helper, using their theory, deduces the cause and guides them. Neither can solve it alone: the Coder lacks the theory, the Helper cannot see the symptom.

WHAT MAKES A GOOD CHALLENGE (this is what matters):
- The bug is ONE concrete, real, common error of the language (a method that does not exist, a wrong HTTP verb, a misused type, an unhandled null, a wrong namespace, a forgotten await, etc.).
- The Helper's "rules" are real, verifiable language/framework theory: they explain HOW something works, they do not describe the code. E.g. "A GET request to a route registered as POST returns 405".
- The Helper's "knowledge" are facts about the system's domain that the Coder cannot deduce from the code they see. E.g. "The demo frontend always sends POST to /logout".
- The correct option names the CAUSE of the bug (a diagnosis), not the literal fix.

FORBIDDEN (this breaks the game — we have seen it fail):
- NEVER generate text-counting rules like "IF the word X appears N times -> ...". That is not theory, it is garbage.
- NEVER use "N/A", "none", empty lists or placeholders in rules, knowledge or hint. If you have nothing useful to put there, the challenge is poorly designed: redo it.
- NEVER repeat the Coder's code inside rules/knowledge. The Helper does not see the code.
- NEVER put the literal answer in the rules.

EXAMPLE OF A PERFECT CHALLENGE (match THIS quality — one step shown):
{
  "step": 1,
  "coder_view": {
    "code": "use Illuminate\\\\Support\\\\Facades\\\\Route;\\nuse App\\\\Http\\\\Controllers\\\\Auth\\\\LoginController;\\n\\nRoute::post('/login', [LoginController::class, 'index']);",
    "error": "500 Internal Server Error"
  },
  "helper_view": {
    "rules": [
      "En Laravel, si una ruta apunta a un método que no existe en el controlador, se lanza un error 500 en runtime, no en el arranque.",
      "El error 500 genérico casi nunca indica la ruta; hay que mirar si el método invocado existe."
    ],
    "knowledge": [
      "En este proyecto, LoginController solo expone los métodos: login y logout.",
      "El frontend de la demo está enviando POST a /login en este momento."
    ]
  },
  "options": [
    "El método index no existe en LoginController",
    "El controlador no está importado",
    "Hay un error de conexión a la base de datos",
    "El verbo HTTP de la ruta es incorrecto"
  ],
  "correct_answer": 0,
  "success_state": { "code_patch": "...the same code with 'index' changed to 'login'..." },
  "hint": "El error 500 aparece al invocar la ruta: revisá si el método llamado existe en el controlador."
}

OUTPUT FORMAT — return ONLY a valid JSON object (no markdown, no extra text):
{
  "id": "lvl_<topic>_<short>",
  "title": "<short title in Spanish>",
  "difficulty": "<must match the difficulty level requested in the user message>",
  "story_context": "<one sentence: a live demo breaking in production>",
  "time_limit": 300,
  "steps": [ /* EXACTLY 3 steps with the shape of the example */ ]
}

STRUCTURE RULES:
- EXACTLY 3 chained steps: each step's code starts from the previous step's code_patch, and each fix reveals the next bug.
- Each step: EXACTLY 4 options, only one correct. correct_answer is the index (0-3) of the correct one.
- rules: 2 or 3 real theory entries. knowledge: 2 or 3 real domain facts. Nothing empty.

LANGUAGE OF THE OUTPUT (critical):
- All player-facing text — title, story_context, options, rules, knowledge and hint — MUST be written in Spanish, exactly like the example above.
- Only the "code" and "error" fields use the programming language requested in the user message.
- The "difficulty" field in the JSON MUST exactly match the difficulty level requested in the user message (easy, medium, hard, or expert).`;

/**
 * Generates a challenge using Bedrock's streaming API (`ConverseStreamCommand`).
 *
 * Accumulates `contentBlockDelta` text fragments in a buffer and calls
 * `onDelta(buffer)` after each new fragment so callers can render progress.
 * Returns the validated `Challenge` when the stream closes, or `null` on any
 * failure (network error, timeout, abort, invalid JSON, validation failure) —
 * identical fallback semantics to `generateChallenge`.
 *
 * @param language   - Challenge language preference (default 'random')
 * @param onDelta    - Called with the full accumulated text after each new fragment
 * @param difficulty - Target difficulty for the generated challenge (default 'easy')
 */
export async function generateChallengeStreaming(
  language: ChallengeLanguage = 'random',
  onDelta: (partialText: string) => void,
  difficulty: Difficulty = 'easy',
): Promise<Challenge | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUNTIME_TIMEOUT_MS);

  try {
    const resolved = resolveLanguage(language);
    const client = new BedrockRuntimeClient({ region: REGION });
    const command = new ConverseStreamCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: 'user',
          content: [
            {
              text: `Genera un desafío nuevo. ${languageInstruction(resolved)} ${difficultyInstruction(difficulty)} Devuelve solo el JSON del objeto challenge.`,
            },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 4096, temperature: 0.8 },
      guardrailConfig: guardrailConfig(),
    });

    const response = await client.send(command, { abortSignal: controller.signal });

    if (!response.stream) {
      console.error('[bedrock] streaming: no stream in response, falling back to curated challenge');
      return null;
    }

    let buffer = '';
    for await (const chunk of response.stream) {
      if (chunk.contentBlockDelta?.delta?.text) {
        buffer += chunk.contentBlockDelta.delta.text;
        if (buffer.length > MAX_STREAM_BUFFER_BYTES) {
          console.error('[bedrock] streaming: response exceeded buffer cap, falling back to curated challenge');
          controller.abort();
          return null;
        }
        onDelta(buffer);
      }
    }

    if (!buffer) {
      console.error('[bedrock] streaming: empty response, falling back to curated challenge');
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripMarkdownFences(buffer));
    } catch {
      console.error('[bedrock] streaming: response was not valid JSON, falling back');
      logBedrockResponse('streaming-invalid-json', buffer);
      return null;
    }

    if (!isValidChallenge(parsed)) {
      console.error('[bedrock] streaming: response failed challenge validation, falling back');
      logBedrockResponse('streaming-validation-failed', buffer, { parsed: typeof parsed });
      return null;
    }

    logBedrockResponse('streaming-success', buffer, {
      challengeId: (parsed as Challenge).id,
    });
    return parsed;
  } catch (error) {
    console.error('[bedrock] streaming: generation failed, falling back to curated challenge:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateChallenge(
  language: ChallengeLanguage = 'random',
  difficulty: Difficulty = 'easy',
): Promise<Challenge | null> {

  if (shouldSkipBedrockInDev()) {
    console.log('[bedrock] no AWS credentials detected in dev, using curated challenge immediately');
    return null;
  }

  console.log('[bedrock] attempting to generate challenge with AWS Bedrock...');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUNTIME_TIMEOUT_MS);

  try {
    const resolved = resolveLanguage(language);
    const client = new BedrockRuntimeClient({ region: REGION });
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: 'user',
          content: [
            {
              text: `Genera un desafío nuevo. ${languageInstruction(resolved)} ${difficultyInstruction(difficulty)} Devuelve solo el JSON del objeto challenge.`,
            },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 4096, temperature: 0.8 },
      guardrailConfig: guardrailConfig(),
    });

    const response = await client.send(command, { abortSignal: controller.signal });
    const rawText = response.output?.message?.content?.[0]?.text ?? '';
    if (!rawText) {
      console.error('[bedrock] empty response, falling back to curated challenge');
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripMarkdownFences(rawText));
    } catch {
      console.error('[bedrock] response was not valid JSON, falling back');
      logBedrockResponse('invalid-json', rawText);
      return null;
    }

    if (!isValidChallenge(parsed)) {
      console.error('[bedrock] response failed challenge validation, falling back');
      logBedrockResponse('validation-failed', rawText, { parsed: typeof parsed });
      return null;
    }

    logBedrockResponse('success', rawText, { challengeId: (parsed as Challenge).id });
    return parsed;
  } catch (error) {
    const isAbort = error instanceof Error && (error.name === 'AbortError' || error.message?.includes('aborted'));
    if (isAbort) {
      console.error('[bedrock] request timed out, falling back to curated challenge');
    } else {
      console.error('[bedrock] generation failed, falling back to curated challenge:', error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

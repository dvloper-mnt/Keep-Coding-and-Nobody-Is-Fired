import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  ChallengeLanguage,
  Difficulty,
  RunSummary,
} from './game-types';

// ---------------------------------------------------------------------------
// Generates a short mentor-style analysis of a finished endless run via
// Bedrock. Streams tokens through `onDelta` so the caller can render the
// analysis appearing in real time (matches the game's initial challenge
// streaming — same visual language).
//
// This module MIRRORS the shape of `runtime-generator.ts` (same client, same
// timeout, same abort, same guardrail) but with a different system prompt and
// a text (not JSON) output. Returns the full text on success, or `null` on
// any failure — callers fall back to a friendly "no se pudo generar" message.
// ---------------------------------------------------------------------------

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const MODEL_ID =
  process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

const GUARDRAIL_ID = process.env['BEDROCK_GUARDRAIL_ID'];
const GUARDRAIL_VERSION = process.env['BEDROCK_GUARDRAIL_VERSION'];

function guardrailConfig() {
  if (!GUARDRAIL_ID || !GUARDRAIL_VERSION) return undefined;
  return { guardrailIdentifier: GUARDRAIL_ID, guardrailVersion: GUARDRAIL_VERSION };
}

const RUNTIME_TIMEOUT_MS = Number(process.env['BEDROCK_RUNTIME_TIMEOUT_MS'] ?? '30000');

// A mentor answer is a few hundred words. Cap the buffer to catch any runaway
// model output — same defensive limit used by challenge generation.
const MAX_STREAM_BUFFER_BYTES = 20_000;

function shouldSkipBedrockInDev(): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  const hasCredentialHint =
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.AWS_PROFILE ||
    process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
    process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
    process.env.AWS_EXECUTION_ENV;
  return !hasCredentialHint;
}

const SYSTEM_PROMPT = `Eres un mentor senior de programación que analiza partidas del juego cooperativo "Keep Coding and Nobody Is Fired".

Recibes las métricas de una partida terminada del modo infinito y devuelves un análisis breve para el jugador. Tu tono es cálido pero directo, como un mentor que quiere que la persona mejore.

FORMATO DE SALIDA:
- Escribe entre 120 y 220 palabras.
- Español neutro, tuteo (no voseo).
- Texto plano sin markdown, sin emojis, sin listas con viñetas. Puedes separar en 2 o 3 párrafos con saltos de línea.
- No inventes datos que no vengan en las métricas. Si una métrica es "—" o "0", trátalo como ausencia, no como logro.

ESTRUCTURA:
1. Reconoce lo que hicieron bien (una o dos frases concretas apoyadas en las métricas).
2. Identifica el patrón de fallo si lo hay (lenguaje con más fallos, dificultad máxima alcanzada, razón de derrota).
3. Da UN consejo concreto y accionable para la próxima partida (no más de dos frases). Que sea específico al patrón que ves.

NO hagas moralina, NO uses frases genéricas tipo "sigue practicando", NO pidas más datos, NO expliques cómo funciona el juego. Solo el análisis directo.`;

// Human-readable language labels for the prompt — matches the UI labels.
const LANGUAGE_LABEL: Record<ChallengeLanguage, string> = {
  random: 'variado',
  php: 'PHP',
  sql: 'SQL',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  go: 'Go',
  java: 'Java',
  ruby: 'Ruby',
};

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'fácil',
  medium: 'media',
  hard: 'difícil',
  expert: 'experto',
};

const DEFEAT_REASON_LABEL: Record<NonNullable<RunSummary['defeatReason']>, string> = {
  timeout: 'se les acabó el tiempo',
  coder_lives: 'el Coder perdió todas las vidas',
  helper_lives: 'el Helper perdió todas las vidas',
};

/**
 * Renders the run summary into a compact human-readable block that the LLM
 * turns into feedback. Pure and testable — used by the streaming generator
 * as its single user-message payload.
 */
export function formatSummaryForPrompt(summary: RunSummary): string {
  const parts: string[] = [
    `Rondas alcanzadas: ${summary.roundsReached}`,
    `Puntaje final: ${summary.score}`,
    `Tiempo sobrevivido: ${summary.secondsSurvived} segundos`,
    `Mejor racha de aciertos consecutivos: ${summary.bestStreak}`,
    `Dificultad máxima alcanzada: ${
      summary.maxDifficulty ? DIFFICULTY_LABEL[summary.maxDifficulty] : 'no disponible'
    }`,
    `Razón de derrota: ${
      summary.defeatReason ? DEFEAT_REASON_LABEL[summary.defeatReason] : 'no disponible'
    }`,
  ];

  if (summary.topFailure) {
    parts.push(
      `Lenguaje con más fallos: ${LANGUAGE_LABEL[summary.topFailure.language]} (${summary.topFailure.count} errores)`,
    );
  } else {
    parts.push('Lenguaje con más fallos: ninguno registrado');
  }

  return parts.join('\n');
}

/**
 * Streams a mentor-style analysis of the given run summary via Bedrock's
 * ConverseStreamCommand. Calls `onDelta(buffer)` after each token so the
 * caller can render the text appearing live. Resolves to the full analysis
 * text on success, or `null` on any failure (network, timeout, abort, empty
 * response, dev without credentials).
 *
 * The buffer is text — no JSON parsing, no schema validation. If Bedrock
 * refuses (guardrail hit) or errors out, we return null and the UI falls
 * back to a friendly message. The game never blocks on this analysis.
 */
export async function generateFeedbackStreaming(
  summary: RunSummary,
  onDelta: (partialText: string) => void,
): Promise<string | null> {
  if (shouldSkipBedrockInDev()) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUNTIME_TIMEOUT_MS);

  try {
    const client = new BedrockRuntimeClient({ region: REGION });
    const command = new ConverseStreamCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: 'user',
          content: [{ text: formatSummaryForPrompt(summary) }],
        },
      ],
      inferenceConfig: { maxTokens: 800, temperature: 0.6 },
      guardrailConfig: guardrailConfig(),
    });

    const response = await client.send(command, { abortSignal: controller.signal });

    if (!response.stream) {
      console.error('[bedrock-feedback] no stream in response');
      return null;
    }

    let buffer = '';
    for await (const chunk of response.stream) {
      const delta = chunk.contentBlockDelta?.delta?.text;
      if (!delta) continue;

      buffer += delta;
      if (buffer.length > MAX_STREAM_BUFFER_BYTES) {
        console.error('[bedrock-feedback] response exceeded buffer cap, cutting stream');
        controller.abort();
        break;
      }
      onDelta(buffer);
    }

    return buffer.trim() === '' ? null : buffer.trim();
  } catch (error) {
    console.error('[bedrock-feedback] generation failed:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

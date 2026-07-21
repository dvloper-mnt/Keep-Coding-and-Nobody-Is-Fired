import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { isValidChallenge } from './challenge-schema';
import { languageInstruction, resolveLanguage } from './challenge-language';
import type { Challenge, ChallengeLanguage } from './game-types';

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const MODEL_ID =
  process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const RUNTIME_TIMEOUT_MS = Number(process.env['BEDROCK_RUNTIME_TIMEOUT_MS'] ?? '10000');

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

const SYSTEM_PROMPT = `Generás un desafío de debugging para un juego cooperativo. El Coder ve código roto y un error; el Helper ve reglas y conocimiento para guiarlo. Ninguno puede resolverlo solo.

Devolvé SOLO un objeto JSON válido (sin markdown, sin texto extra) con esta forma EXACTA:
{
  "id": "lvl_<tema>_<corto>",
  "title": "<título corto en español>",
  "difficulty": "medium",
  "story_context": "<una frase: una demo en vivo que se rompe en producción>",
  "time_limit": 180,
  "steps": [
    {
      "step": 1,
      "coder_view": { "code": "<código PHP/Laravel con UN bug>", "error": "<mensaje de error, ej 500 Internal Server Error>" },
      "helper_view": { "rules": ["<regla 1>", "<regla 2>"], "knowledge": ["<dato de dominio que el Coder NO ve>"] },
      "options": ["<diagnóstico correcto>", "<distractor>", "<distractor>", "<distractor>"],
      "correct_answer": 0,
      "success_state": { "code_patch": "<el código ya corregido>" },
      "hint": "<pista breve>"
    }
  ]
}

Reglas:
- EXACTAMENTE 3 steps, encadenados: cada fix revela el siguiente bug. El código de cada step parte del code_patch del anterior.
- Cada step: EXACTAMENTE 4 options, una correcta. correct_answer es el índice (0-3) de la correcta.
- El bug debe ser diagnosticable SOLO combinando lo que ve el Coder (error) con lo que ve el Helper (knowledge). Esa es la regla de oro.
- Bugs reales y verosímiles del lenguaje que se indique en el mensaje del usuario (rutas, tipos, queries, concurrencia, dependencias, según corresponda).
- Español en title, story_context, options, rules, knowledge, hint. El code va en el lenguaje indicado.
- Salida: solo el JSON, sin fences markdown.`;

export async function generateChallenge(
  language: ChallengeLanguage = 'random',
): Promise<Challenge | null> {
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
              text: `Generá un desafío nuevo. ${languageInstruction(resolved)} Devolvé solo el JSON del objeto challenge.`,
            },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 4096, temperature: 0.8 },
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
      return null;
    }

    if (!isValidChallenge(parsed)) {
      console.error('[bedrock] response failed challenge validation, falling back');
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('[bedrock] generation failed, falling back to curated challenge:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

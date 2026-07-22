import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const LOG_DIR = join(process.cwd(), 'logs', 'bedrock');

function shouldDumpToFile(): boolean {
  if (process.env['BEDROCK_DUMP_RESPONSE'] === '0') return false;
  if (process.env['BEDROCK_DUMP_RESPONSE'] === '1') return true;
  return process.env.NODE_ENV === 'development';
}

/**
 * Persists every raw Bedrock response (success or failure).
 * Active by default in development; set BEDROCK_DUMP_RESPONSE=1 to force, =0 to disable.
 *
 * Files land in: <project-root>/logs/bedrock/
 */
export function dumpBedrockResponse(
  reason: string,
  rawText: string,
  meta?: Record<string, unknown>,
): string | null {
  if (!shouldDumpToFile() || !rawText) return null;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeReason = reason.replace(/[^a-z0-9-]/gi, '-').slice(0, 48);
  const filename = `${ts}-${safeReason}.txt`;
  const filepath = join(LOG_DIR, filename);

  const body = [
    `reason: ${reason}`,
    `at: ${new Date().toISOString()}`,
    meta ? `meta: ${JSON.stringify(meta, null, 2)}` : '',
    '--- raw response ---',
    rawText,
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  try {
    mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(filepath, body, 'utf8');
    return filepath;
  } catch (error) {
    console.error('[bedrock] failed to write response dump:', error);
    return null;
  }
}
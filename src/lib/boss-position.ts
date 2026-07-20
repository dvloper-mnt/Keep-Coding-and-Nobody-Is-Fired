import { BOSS_PRESSURE_CONFIG } from '@/src/lib/constants';

export type BossPressureConfig = typeof BOSS_PRESSURE_CONFIG;
export type BossEmphasis = 'center' | 'random';

export interface BossPlacement {
  topPercent: number;
  leftPercent: number;
  emphasis: BossEmphasis;
}

export interface BossToast {
  id: string;
  message: string;
  placement: BossPlacement;
}

const MIN_PLACEMENT_DISTANCE = 12;
const MAX_PLACEMENT_ATTEMPTS = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function placementDistance(a: BossPlacement, b: BossPlacement): number {
  const dx = a.leftPercent - b.leftPercent;
  const dy = a.topPercent - b.topPercent;
  return Math.sqrt(dx * dx + dy * dy);
}

export function pickBossMessage(
  messages: readonly string[],
  recentMessages: string[] = [],
): string {
  if (messages.length === 0) return '';
  if (messages.length === 1) return messages[0];

  const candidates = messages.filter(
    (message) => !recentMessages.includes(message) || recentMessages.length >= messages.length,
  );
  const pool = candidates.length > 0 ? candidates : [...messages];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function generateBossPlacement(
  config: BossPressureConfig,
  existingPlacements: BossPlacement[] = [],
): BossPlacement {
  const margin = config.edgeMarginPercent;
  const maxCoord = 100 - margin;

  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
    const emphasis: BossEmphasis =
      Math.random() < config.centerEmphasisChance ? 'center' : 'random';

    let topPercent: number;
    let leftPercent: number;

    if (emphasis === 'center') {
      const radius = config.centerZoneRadiusPercent;
      topPercent = clamp(50 + randomInRange(-radius, radius), margin, maxCoord);
      leftPercent = clamp(50 + randomInRange(-radius, radius), margin, maxCoord);
    } else {
      topPercent = randomInRange(margin, maxCoord);
      leftPercent = randomInRange(margin, maxCoord);
    }

    const placement: BossPlacement = { topPercent, leftPercent, emphasis };
    const tooClose = existingPlacements.some(
      (existing) => placementDistance(existing, placement) < MIN_PLACEMENT_DISTANCE,
    );

    if (!tooClose || attempt === MAX_PLACEMENT_ATTEMPTS - 1) {
      return placement;
    }
  }

  return { topPercent: 50, leftPercent: 50, emphasis: 'center' };
}

export function createBossToast(
  config: BossPressureConfig,
  existingPlacements: BossPlacement[],
  recentMessages: string[] = [],
): BossToast {
  return {
    id: crypto.randomUUID(),
    message: pickBossMessage(config.messages, recentMessages),
    placement: generateBossPlacement(config, existingPlacements),
  };
}
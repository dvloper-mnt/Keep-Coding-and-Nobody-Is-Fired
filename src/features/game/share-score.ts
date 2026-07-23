// ---------------------------------------------------------------------------
// Pure helpers for sharing a run's score on social networks. No backend: each
// network has a "share intent" URL that opens its native dialog with the text
// and game link prefilled. Nothing here calls SES, Bedrock, or any API.
//
// All player-facing copy is neutral Latin American Spanish with tuteo (never
// voseo): "¿puedes superarme?", not "¿podés superarme?".
// ---------------------------------------------------------------------------

const GAME_NAME = 'Keep Coding and Nobody Is Fired';

export interface ShareStats {
  roundsReached: number;
  score: number;
}

export type ShareNetwork = 'x' | 'linkedin' | 'facebook';

export interface ShareTarget {
  id: ShareNetwork;
  label: string;
  href: string;
}

/**
 * The text posted alongside the game link. Neutral Spanish, tuteo — invites
 * others to beat the score. Thousands separators for readability.
 */
export function buildShareText(stats: ShareStats): string {
  const score = stats.score.toLocaleString('es');
  const rounds = stats.roundsReached.toLocaleString('es');
  return `Llegué a la ronda ${rounds} con ${score} puntos en ${GAME_NAME}. ¿Puedes superarme?`;
}

/**
 * Builds the per-network intent URLs. Each opens the network's share dialog with
 * the text and the game link prefilled — the user confirms and posts. Text and
 * URL are URL-encoded so special characters and spaces never break the link.
 *
 * @param stats   the run's rounds + score
 * @param gameUrl the canonical game URL to link back to
 */
export function shareTargets(stats: ShareStats, gameUrl: string): ShareTarget[] {
  const text = buildShareText(stats);
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(gameUrl);
  // Some networks (X) put the URL in a separate param; others (LinkedIn,
  // Facebook) only take the URL and pull the preview from the page's OG tags.
  // We include the text where the network supports it.
  const textWithUrl = encodeURIComponent(`${text} ${gameUrl}`);

  return [
    {
      id: 'x',
      label: 'Compartir en X',
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    },
    {
      id: 'linkedin',
      label: 'Compartir en LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    },
    {
      id: 'facebook',
      label: 'Compartir en Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${textWithUrl}`,
    },
  ];
}

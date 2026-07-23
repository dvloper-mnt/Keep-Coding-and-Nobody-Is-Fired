import { describe, expect, it } from 'vitest';
import {
  buildShareText,
  shareTargets,
  type ShareStats,
} from './share-score';

// ---------------------------------------------------------------------------
// Pure share helpers: build the neutral-Spanish share text (no voseo) and the
// per-network intent URLs. No backend, no SES — each network opens its own
// share dialog with the text + game link prefilled. See share-score.ts.
// ---------------------------------------------------------------------------

const STATS: ShareStats = { roundsReached: 14, score: 12400 };
const GAME_URL = 'https://hackaton.dvloper.com.co';

describe('buildShareText', () => {
  it('includes the rounds and the score, formatted with thousands separators', () => {
    const text = buildShareText(STATS);
    expect(text).toContain('14');
    expect(text).toContain('12.400');
  });

  it('names the game and invites others to beat the score', () => {
    const text = buildShareText(STATS);
    expect(text).toContain('Keep Coding and Nobody Is Fired');
    // Neutral Spanish, tuteo — must NOT contain voseo forms.
    expect(text.toLowerCase()).not.toMatch(/pod[eé]s|super[aá]me vos|ten[eé]s/);
  });

  it('uses "puedes" (tuteo), never "podés" (voseo)', () => {
    const text = buildShareText(STATS).toLowerCase();
    expect(text).not.toContain('podés');
  });

  it('handles a zero-round run without breaking', () => {
    const text = buildShareText({ roundsReached: 0, score: 0 });
    expect(text).toContain('0');
  });
});

describe('shareTargets', () => {
  it('builds an intent URL for each supported network', () => {
    const targets = shareTargets(STATS, GAME_URL);
    const ids = targets.map((t) => t.id);
    expect(ids).toContain('x');
    expect(ids).toContain('linkedin');
    expect(ids).toContain('facebook');
  });

  it('URL-encodes the share text and the game link in each target', () => {
    const targets = shareTargets(STATS, GAME_URL);
    for (const target of targets) {
      // The raw URL must be encoded (no bare "https://" of the game link in a query).
      expect(target.href).toContain(encodeURIComponent(GAME_URL));
      // No unencoded spaces leak into the href.
      expect(target.href).not.toContain(' ');
    }
  });

  it('points X at its intent endpoint with the text prefilled', () => {
    const x = shareTargets(STATS, GAME_URL).find((t) => t.id === 'x');
    expect(x?.href).toContain('twitter.com/intent/tweet');
    expect(x?.href).toContain(encodeURIComponent(buildShareText(STATS)));
  });

  it('points LinkedIn and Facebook at their share endpoints with the game URL', () => {
    const targets = shareTargets(STATS, GAME_URL);
    const linkedin = targets.find((t) => t.id === 'linkedin');
    const facebook = targets.find((t) => t.id === 'facebook');
    expect(linkedin?.href).toContain('linkedin.com/sharing');
    expect(facebook?.href).toContain('facebook.com/sharer');
  });

  it('gives every target a human label for the button', () => {
    for (const target of shareTargets(STATS, GAME_URL)) {
      expect(target.label.length).toBeGreaterThan(0);
    }
  });
});

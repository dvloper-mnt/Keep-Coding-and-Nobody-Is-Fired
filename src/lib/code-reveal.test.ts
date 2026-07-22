import { describe, expect, it } from 'vitest';
import loginChaos from '@/src/data/challenges/login-chaos.json';
import { getCodeRevealSegments, getRevealCharIntervalMs } from './code-reveal';

describe('getCodeRevealSegments', () => {
  it('returns full code as stable when both strings are identical', () => {
    const code = 'line one\nline two';
    expect(getCodeRevealSegments(code, code)).toEqual({
      stable: code,
      animated: '',
    });
  });

  it('keeps shared prefix lines stable and animates from the first diff', () => {
    const previous = 'alpha\nbeta\nold line';
    const next = 'alpha\nbeta\nnew line\nextra';

    expect(getCodeRevealSegments(previous, next)).toEqual({
      stable: 'alpha\nbeta\n',
      animated: 'new line\nextra',
    });
  });

  it('animates the entire next code when the first line already differs', () => {
    const previous = 'old start';
    const next = 'new start\nsecond';

    expect(getCodeRevealSegments(previous, next)).toEqual({
      stable: '',
      animated: 'new start\nsecond',
    });
  });

  it('reveals only the delta between login-chaos step 1 and step 2', () => {
    const step1 = loginChaos.steps[0].coder_view.code;
    const step2 = loginChaos.steps[1].coder_view.code;
    const { stable, animated } = getCodeRevealSegments(step1, step2);

    expect(stable).toBe('use Illuminate\\Support\\Facades\\Route;\n');
    expect(animated.startsWith('use App\\Http\\Controllers\\LoginController;')).toBe(true);
    expect(`${stable}${animated}`).toBe(step2);
  });
});

describe('getRevealCharIntervalMs', () => {
  it('returns 0 for empty animated text', () => {
    expect(getRevealCharIntervalMs(0)).toBe(0);
  });

  it('clamps interval between 2ms and 24ms', () => {
    expect(getRevealCharIntervalMs(10)).toBe(24);
    expect(getRevealCharIntervalMs(500)).toBe(4);
    expect(getRevealCharIntervalMs(5000)).toBe(2);
  });
});
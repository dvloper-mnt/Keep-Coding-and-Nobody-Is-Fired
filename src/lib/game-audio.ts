export const SOUND_PATHS = {
  correct: '/audio/correct_response.mp3',
  wrong: '/audio/wrong_response.mp3',
  clockTik: '/audio/clock_tik.mp3',
  clockTak: '/audio/clock_tak.mp3',
} as const;

type SoundKey = keyof typeof SOUND_PATHS;

const sounds: Partial<Record<SoundKey, HTMLAudioElement>> = {};
let isTikTurn = true;
let unlocked = false;

function getSound(key: SoundKey): HTMLAudioElement {
  if (!sounds[key]) {
    sounds[key] = new Audio(SOUND_PATHS[key]);
  }
  return sounds[key]!;
}

async function playSound(key: SoundKey): Promise<void> {
  try {
    const audio = getSound(key);
    audio.currentTime = 0;
    await audio.play();
  } catch {
    // Browser autoplay policy or missing file — fail silently
  }
}

export function preloadSounds(): void {
  (Object.keys(SOUND_PATHS) as SoundKey[]).forEach((key) => {
    const audio = getSound(key);
    audio.preload = 'auto';
    audio.load();
  });
}

export async function unlockAudio(): Promise<void> {
  if (unlocked) return;

  try {
    const audio = getSound('clockTik');
    audio.volume = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    unlocked = true;
  } catch {
    // Will unlock on next user interaction
  }
}

export function playCorrect(): void {
  void playSound('correct');
}

export function playWrong(): void {
  void playSound('wrong');
}

export function playClockTick(): void {
  void playSound(isTikTurn ? 'clockTik' : 'clockTak');
  isTikTurn = !isTikTurn;
}
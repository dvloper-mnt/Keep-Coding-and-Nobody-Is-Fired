'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { OnboardingSlide as SlideType } from '../onboarding-types';

interface OnboardingSlideProps {
  readonly slide: SlideType;
}

export function OnboardingSlide({ slide }: OnboardingSlideProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div>
      <h2
        id="onboarding-heading"
        className="text-2xl font-bold mb-4 text-zinc-100"
      >
        {slide.heading}
      </h2>

      <div id="onboarding-content" className="text-zinc-300">
        {slide.content}
      </div>

      {slide.screenshot && (
        <div className="mt-6 rounded-lg overflow-hidden border border-zinc-800">
          {imgError ? (
            <div className="flex items-center justify-center bg-zinc-900 w-full aspect-video">
              <span className="text-zinc-500 text-sm">Screenshot no disponible</span>
            </div>
          ) : (
            <Image
              src={slide.screenshot}
              alt={slide.screenshotAlt ?? 'Screenshot del juego'}
              width={1200}
              height={675}
              className="w-full h-auto"
              priority={slide.id <= 2}
              onError={() => setImgError(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}

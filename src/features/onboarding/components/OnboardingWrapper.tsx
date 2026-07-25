'use client';

import { useOnboarding } from '../hooks/useOnboarding';
import { OnboardingModal } from './OnboardingModal';
import { TutorialTriggerButton } from './TutorialTriggerButton';

export function OnboardingWrapper() {
  const onboardingState = useOnboarding();

  return (
    <>
      {/* Persistent trigger button - fixed bottom-right */}
      <div className="fixed bottom-6 right-6 z-40">
        <TutorialTriggerButton onClick={onboardingState.openTutorial} />
      </div>

      {/* Modal - renders conditionally */}
      <OnboardingModal hookState={onboardingState} />
    </>
  );
}

'use client';

import { BossMessageToast } from '@/src/components/molecules/BossMessageToast';
import {
  createBossToast,
  generateBossPlacement,
  type BossToast,
} from '@/src/lib/boss-position';
import { BOSS_PRESSURE_CONFIG } from '@/src/lib/constants';
import { useCallback, useEffect, useState } from 'react';

interface BossOverlayProps {
  active: boolean;
}

export function BossOverlay({ active }: BossOverlayProps) {
  const [toasts, setToasts] = useState<BossToast[]>([]);

  const handleDismiss = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((toast) => {
        if (toast.id !== id) return toast;

        const otherPlacements = prev
          .filter((item) => item.id !== id)
          .map((item) => item.placement);

        return {
          ...toast,
          placement: generateBossPlacement(BOSS_PRESSURE_CONFIG, otherPlacements),
        };
      }),
    );
  }, []);

  useEffect(() => {
    if (!active) return;

    function spawnToast() {
      setToasts((prev) => {
        if (prev.length >= BOSS_PRESSURE_CONFIG.maxVisibleMessages) {
          return prev;
        }

        const newToast = createBossToast(
          BOSS_PRESSURE_CONFIG,
          prev.map((toast) => toast.placement),
          prev.map((toast) => toast.message),
        );

        return [...prev, newToast];
      });
    }

    spawnToast();
    const interval = setInterval(spawnToast, BOSS_PRESSURE_CONFIG.spawnIntervalMs);

    return () => {
      clearInterval(interval);
      setToasts([]);
    };
  }, [active]);

  if (!active || toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {toasts.map((toast) => (
        <BossMessageToast key={toast.id} toast={toast} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}
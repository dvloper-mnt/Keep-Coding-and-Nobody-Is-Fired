'use client';

import type {
  HelperGuideSection,
  HelperRevealTarget,
} from '@/src/features/game/game-types';
import {
  HELPER_HINT_REVEAL_COST_SECONDS,
  HELPER_KNOWLEDGE_REVEAL_COST_SECONDS,
} from '@/src/lib/constants';

interface ManualPanelProps {
  title: string;
  storyContext: string;
  sections: HelperGuideSection[];
  // When present, each locked knowledge item / hint renders as a "🔒 Revelar
  // (−Ns)" button that calls back with the reveal target. When absent (e.g.
  // tests, previews), locked items still hide their text — the panel is a
  // read-only view of the guide.
  onReveal?: (target: HelperRevealTarget) => void;
  // Disables reveal buttons while a request is in flight to prevent double-
  // clicks from being counted twice by the server.
  revealing?: boolean;
}

const LOCK_COPY_KNOWLEDGE = `Revelar (−${HELPER_KNOWLEDGE_REVEAL_COST_SECONDS}s)`;
const LOCK_COPY_HINT = `Revelar pista (−${HELPER_HINT_REVEAL_COST_SECONDS}s)`;

export function ManualPanel({
  title,
  storyContext,
  sections,
  onReveal,
  revealing = false,
}: ManualPanelProps) {
  return (
    <div className="space-y-6">
      <header className="border-b border-amber-500/30 pb-4">
        <p className="text-xs font-bold tracking-widest text-amber-500 uppercase">
          Manual de debugging
        </p>
        <h1 className="mt-1 text-2xl font-bold text-amber-100">{title}</h1>
        <p className="mt-2 text-sm text-amber-200/70">{storyContext}</p>
      </header>

      <div className="space-y-4">
        {sections.map((section) => (
          <details
            key={section.exercise}
            className="group rounded-lg border border-amber-500/20 bg-amber-950/20"
            open
          >
            <summary className="cursor-pointer px-4 py-3 font-semibold text-amber-200 select-none">
              Ejercicio {section.exercise}
            </summary>
            <div className="space-y-3 border-t border-amber-500/10 px-4 py-3">
              <div>
                <h3 className="text-xs font-bold tracking-wider text-amber-500/80 uppercase">
                  Reglas
                </h3>
                <ul className="mt-1 space-y-1">
                  {section.rules.map((rule) => (
                    <li key={rule} className="text-sm text-amber-100/90">
                      • {rule}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-bold tracking-wider text-amber-500/80 uppercase">
                  Conocimiento
                </h3>
                <ul className="mt-1 space-y-1">
                  {section.knowledge.map((item, index) => {
                    const locked = section.lockedKnowledgeIndices.includes(index);
                    return (
                      <li key={`${section.exercise}-k-${index}`} className="text-sm">
                        {locked ? (
                          <button
                            type="button"
                            disabled={revealing || !onReveal}
                            onClick={() =>
                              onReveal?.({ type: 'knowledge', step: section.exercise, index })
                            }
                            className="w-full rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-left text-xs font-medium text-amber-200/80 transition-colors hover:border-amber-400 hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            🔒 {LOCK_COPY_KNOWLEDGE}
                          </button>
                        ) : (
                          <span className="text-amber-100/70">• {item}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {section.hint ? (
                section.hintLocked ? (
                  <button
                    type="button"
                    disabled={revealing || !onReveal}
                    onClick={() => onReveal?.({ type: 'hint', step: section.exercise })}
                    className="w-full rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-left text-xs font-medium text-amber-300/80 transition-colors hover:border-amber-400 hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    🔒 {LOCK_COPY_HINT}
                  </button>
                ) : (
                  <p className="text-xs text-amber-400/60 italic">Pista: {section.hint}</p>
                )
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

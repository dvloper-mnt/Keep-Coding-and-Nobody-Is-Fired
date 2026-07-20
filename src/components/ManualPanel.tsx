import type { HelperGuideSection } from '@/src/features/game/game-types';

interface ManualPanelProps {
  title: string;
  storyContext: string;
  sections: HelperGuideSection[];
}

export function ManualPanel({ title, storyContext, sections }: ManualPanelProps) {
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
                  {section.knowledge.map((item) => (
                    <li key={item} className="text-sm text-amber-100/70">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
              {section.hint && (
                <p className="text-xs text-amber-400/60 italic">Pista: {section.hint}</p>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
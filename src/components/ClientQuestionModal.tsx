'use client';

import type { ClientQuestionCategory, ClientQuestionView } from '@/src/features/game/game-types';

const CATEGORY_LABELS: Record<ClientQuestionCategory, string> = {
  architecture: 'Arquitectura',
  programming: 'Programación',
  sql: 'SQL',
  'design-patterns': 'Patrones de diseño',
};

interface ClientQuestionModalProps {
  question: ClientQuestionView;
  submitting: boolean;
  feedback: string | null;
  lastResult: 'correct' | 'incorrect' | null;
  onAnswer: (answerIndex: number) => void;
}

export function ClientQuestionModal({
  question,
  submitting,
  feedback,
  lastResult,
  onAnswer,
}: ClientQuestionModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-question-title"
        className="w-full max-w-xl rounded-2xl border border-amber-500/40 bg-amber-950 shadow-2xl shadow-amber-950/60"
      >
        <div className="border-b border-amber-500/20 px-6 py-4">
          <p className="text-xs font-bold tracking-widest text-amber-500 uppercase">
            Consulta del cliente
          </p>
          <p className="mt-1 text-xs text-amber-400/70">
            {CATEGORY_LABELS[question.category]}
          </p>
          <h2 id="client-question-title" className="mt-3 text-lg leading-snug text-amber-50">
            {question.client_prompt}
          </h2>
          <p className="mt-2 text-xs text-amber-400/60">
            Respondé correctamente para cerrar la consulta. No podés omitirla.
          </p>
        </div>

        <div className="space-y-2 px-6 py-5">
          {question.options.map((option, index) => (
            <button
              key={option}
              type="button"
              disabled={submitting}
              onClick={() => onAnswer(index)}
              className="w-full rounded-lg border border-amber-600/30 bg-amber-900/40 px-4 py-3 text-left text-sm text-amber-100 transition-colors hover:border-amber-400/60 hover:bg-amber-900/70 disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>

        {feedback && (
          <p
            className={`px-6 pb-5 text-center text-sm font-semibold ${
              lastResult === 'correct' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {feedback}
          </p>
        )}
      </div>
    </div>
  );
}
'use client';

import {
  buildCoderStartPath,
  DEFAULT_GAME_MODE,
  GAME_MODE_OPTIONS,
} from '@/src/features/game/game-mode';
import type { ChallengeLanguage, GameMode } from '@/src/features/game/game-types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPortal } from 'react-dom';

const LANGUAGE_OPTIONS: ReadonlyArray<{ value: ChallengeLanguage; label: string }> = [
  { value: 'random', label: 'Aleatorio (sorpresa)' },
  { value: 'php', label: 'PHP / Laravel' },
  { value: 'sql', label: 'SQL' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'ruby', label: 'Ruby' },
];

export function StartGameButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<GameMode>(DEFAULT_GAME_MODE);
  const [language, setLanguage] = useState<ChallengeLanguage>('random');

  function confirmStart() {
    setStarting(true);
    router.push(buildCoderStartPath(language, mode));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Iniciar partida como Coder"
        className="group w-full rounded-lg border border-red-500/30 bg-red-950/20 p-5 text-left transition-colors hover:border-red-500/70 hover:bg-red-950/40 cursor-pointer"
      >
        <p className="font-mono text-xs tracking-widest text-red-400 uppercase">Rol A</p>
        <p className="mt-1 text-xl font-bold text-red-300">Soy Coder</p>
        <p className="mt-2 text-sm text-zinc-400">
          Ves el código roto, el error y cuatro diagnósticos. Manejas el teclado y el reloj.
        </p>
        <p className="mt-4 font-mono text-xs text-red-400/80 group-hover:text-red-300">
          Iniciar partida →
        </p>
      </button>

      {confirming &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-modal-title"
            onClick={() => {
              if (!starting) setConfirming(false);
            }}
          >
            <div
              className="my-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-red-500/40 bg-[#0a0a0b] p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="font-mono text-xs tracking-widest text-red-500 uppercase">
                Confirmar inicio
              </p>
              <h2 id="start-modal-title" className="mt-2 text-lg font-bold text-zinc-100">
                ¿Listo para iniciar la partida?
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                Generamos un incidente único con IA. Recibirás un código de sala para el Helper.
              </p>

              <fieldset className="mt-4 space-y-2">
                <legend className="font-mono text-xs tracking-wider text-zinc-500 uppercase">
                  Modo de juego
                </legend>
                {GAME_MODE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-3 transition-colors ${
                      mode === option.value
                        ? 'border-red-500/60 bg-red-950/30'
                        : 'border-zinc-700 bg-zinc-900/40 hover:border-zinc-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="game-mode"
                      value={option.value}
                      checked={mode === option.value}
                      onChange={() => setMode(option.value)}
                      disabled={starting}
                      className="mt-1 accent-red-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-zinc-100">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-400">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="mt-4">
                <label
                  htmlFor="language-select"
                  className="font-mono text-xs tracking-wider text-zinc-500 uppercase"
                >
                  Lenguaje del incidente
                </label>
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as ChallengeLanguage)}
                  disabled={starting}
                  className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors focus:border-red-500 disabled:opacity-50"
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={starting}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmStart}
                  disabled={starting}
                  className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
                >
                  {starting ? 'Iniciando…' : 'Sí, iniciar'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
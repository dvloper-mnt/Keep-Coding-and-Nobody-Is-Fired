import type { OnboardingSlide } from '../onboarding-types';

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: 1,
    heading: '💥 Regla de Oro',
    content: (
      <div className="space-y-4">
        <p className="text-lg font-bold text-red-500">
          Ningún jugador puede ganar solo. La información está partida por diseño.
        </p>
        <div className="space-y-2 text-zinc-300">
          <p>
            El <span className="font-semibold text-amber-400">Coder</span> ve el código roto, el
            error y las opciones de diagnóstico, pero{' '}
            <span className="text-red-500">NO</span> ve las reglas de dominio ni la guía teórica.
          </p>
          <p>
            El <span className="font-semibold text-emerald-400">Helper</span> ve la guía completa
            con la teoría del framework y contexto de dominio, pero{' '}
            <span className="text-red-500">NO</span> ve el código, el error ni las opciones.
          </p>
        </div>
        <p className="text-sm italic text-zinc-400">
          ⚠️ Esta regla es fundamental — continúa para poder saltar el resto del tutorial.
        </p>
      </div>
    ),
  },
  {
    id: 2,
    heading: '👨‍💻 Rol: Coder',
    content: (
      <div className="space-y-4">
        <p className="text-zinc-300">
          El Coder se sienta al teclado frente al error 500 en producción. Diagnostica, elige
          respuestas y maneja el reloj.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="mb-2 font-semibold text-emerald-400">✅ Ve</h4>
            <ul className="space-y-1 text-sm text-zinc-300">
              <li>• Código roto</li>
              <li>• Mensaje de error</li>
              <li>• 4 opciones de diagnóstico</li>
              <li>• Timer y vidas propias</li>
            </ul>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-red-400">❌ No ve</h4>
            <ul className="space-y-1 text-sm text-zinc-300">
              <li>• Guía teórica del framework</li>
              <li>• Reglas de dominio</li>
              <li>• Contexto del Helper</li>
              <li>• Consultas del cliente</li>
            </ul>
          </div>
        </div>
        <p className="text-sm font-medium text-amber-400">
          🎯 Misión: describir el síntoma al Helper y elegir la opción correcta con su guía.
        </p>
      </div>
    ),
    screenshot: '/onboarding/coder_screen.png',
    screenshotAlt: 'Pantalla del Coder mostrando código roto y opciones de diagnóstico',
  },
  {
    id: 3,
    heading: '🗣️ Rol: Helper',
    content: (
      <div className="space-y-4">
        <p className="text-zinc-300">
          El Helper tiene la teoría y el contexto de dominio. Guía al Coder verbalmente sin ver el
          código roto.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="mb-2 font-semibold text-emerald-400">✅ Ve</h4>
            <ul className="space-y-1 text-sm text-zinc-300">
              <li>• Guía completa del framework</li>
              <li>• Reglas de dominio</li>
              <li>• Timer y progreso del Coder</li>
              <li>• Vidas propias</li>
            </ul>
          </div>
          <div>
            <h4 className="mb-2 font-semibold text-red-400">❌ No ve</h4>
            <ul className="space-y-1 text-sm text-zinc-300">
              <li>• Código roto</li>
              <li>• Mensaje de error</li>
              <li>• Opciones de diagnóstico</li>
              <li>• Steps del Coder</li>
            </ul>
          </div>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-900/20 p-3">
          <p className="text-sm text-zinc-300">
            ⚠️ <span className="font-semibold text-amber-400">Interrupciones del cliente:</span>{' '}
            cada ~40 segundos puede aparecer un modal obligatorio con una pregunta técnica. Si
            fallas, pierdes 1 vida y 10 segundos. El Coder no puede ayudarte.
          </p>
        </div>
        <p className="text-sm font-medium text-amber-400">
          🎯 Misión: escuchar el síntoma del Coder y guiarlo con la teoría hacia la respuesta
          correcta.
        </p>
      </div>
    ),
    screenshot: '/onboarding/helper_screen.png',
    screenshotAlt: 'Pantalla del Helper mostrando guía y consulta del cliente',
  },
  {
    id: 4,
    heading: '⏱️ Coordinación',
    content: (
      <div className="space-y-4">
        <p className="text-lg font-bold text-zinc-300">
          La comunicación es obligatoria. <span className="text-red-500">No hay chat en el juego.</span>
        </p>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
          <h4 className="mb-2 font-semibold text-emerald-400">🔗 Cómo conectarse</h4>
          <ul className="space-y-1 text-sm text-zinc-300">
            <li>1. El Coder crea la sala y obtiene un código (ej. <code className="rounded bg-zinc-700 px-1">X7K2</code>).</li>
            <li>2. Comparte el código con el Helper por Discord, Zoom u otra llamada de voz.</li>
            <li>3. El Helper ingresa el código en su pantalla.</li>
            <li>4. ¡Cooperen en voz alta!</li>
          </ul>
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold text-zinc-300">💡 Tips de comunicación</h4>
          <ul className="space-y-1 text-sm text-zinc-400">
            <li>• <span className="text-zinc-300">Coder:</span> describe el error textual, no interpretes antes de preguntar.</li>
            <li>• <span className="text-zinc-300">Helper:</span> da contexto teórico, no intentes adivinar el código.</li>
            <li>• Hablen rápido pero claro — el reloj no espera.</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: 5,
    heading: '🎯 Victoria y Derrota',
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-900/20 p-3">
            <h4 className="mb-2 font-semibold text-emerald-400">🏆 Victoria</h4>
            <ul className="space-y-1 text-sm text-zinc-300">
              <li>• Completar todos los steps</li>
              <li>• Timer {'>'} 0</li>
              <li>• Ambos con vidas {'>'} 0</li>
            </ul>
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-3">
            <h4 className="mb-2 font-semibold text-red-400">💀 Derrota</h4>
            <ul className="space-y-1 text-sm text-zinc-300">
              <li>• Timer llega a 0</li>
              <li>• Coder pierde 3 vidas</li>
              <li>• Helper pierde 3 vidas</li>
              <li>• Un jugador abandona</li>
            </ul>
          </div>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
          <h4 className="mb-2 text-sm font-semibold text-zinc-300">⚡ Bonos y penalizaciones</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-emerald-400">+60s por ronda completada</div>
            <div className="text-red-400">−10s por error</div>
            <div className="text-emerald-400">+120s por vencer al jefe</div>
            <div className="text-red-400">−1 vida por fallo</div>
            <div className="text-emerald-400">×3 multiplicador (racha 7+)</div>
            <div className="text-red-400">Racha se rompe al fallar</div>
          </div>
        </div>
        <p className="text-center text-sm italic text-zinc-400">
          Hablen, coordinen y sobrevivan. El código no se arregla solo. 🔥
        </p>
      </div>
    ),
    screenshot: '/onboarding/screen_failure_endgame.png',
    screenshotAlt: 'Pantalla de Game Over mostrando condición de derrota',
  },
] as const;

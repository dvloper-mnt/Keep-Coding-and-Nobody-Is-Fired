import { HeroTitleTypewriter } from '@/src/components/molecules/HeroTitleTypewriter';
import { StartGameButton } from '@/src/components/molecules/StartGameButton';
import {
  ENDLESS_BASE_SECONDS,
  ENDLESS_REWARD_SECONDS,
  HERO_TITLE,
  PENALTY_SECONDS,
} from '@/src/lib/constants';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0b] px-4 py-12 text-zinc-100 sm:py-16">
      <div className="mx-auto flex max-w-3xl flex-col">
        <p className="font-mono text-xs tracking-widest text-red-500 uppercase">
          <span className="animate-type-eyebrow align-bottom">
            <span className="text-zinc-600">[</span>
            INCIDENT-001
            <span className="text-zinc-600">]</span> producción · severidad alta
          </span>
        </p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          {/* Static full title for screen readers and search crawlers; the
              animated version below is aria-hidden and re-renders per char. */}
          <span className="sr-only">{HERO_TITLE}</span>
          <span aria-hidden="true">
            <HeroTitleTypewriter />
          </span>
        </h1>

        <p
          className="animate-incident-rise mt-5 max-w-xl text-zinc-400"
          style={{ animationDelay: '120ms' }}
        >
          El sistema cayó en plena demo y el cliente está mirando. Son dos personas, una
          sola crisis: <span className="text-zinc-200">ninguno puede resolverla solo.</span>
        </p>

        <div
          className="animate-incident-rise mt-10 grid gap-4 sm:grid-cols-2"
          style={{ animationDelay: '180ms' }}
        >
          <StartGameButton />

          <Link
            href="/helper"
            className="group rounded-lg border border-amber-500/30 bg-amber-950/20 p-5 transition-colors hover:border-amber-500/70 hover:bg-amber-950/40"
          >
            <p className="font-mono text-xs tracking-widest text-amber-400 uppercase">Rol B</p>
            <p className="mt-1 text-xl font-bold text-amber-200">Soy Helper</p>
            <p className="mt-2 text-sm text-zinc-400">
              Tienes el manual completo de debugging. No puedes responder: guías al Coder con tu voz.
            </p>
            <p className="mt-4 font-mono text-xs text-amber-400/80 group-hover:text-amber-200">
              Unirse con el código →
            </p>
          </Link>
        </div>

        {/* Stats reflect the DEFAULT mode (endless): the clock starts at
            ENDLESS_BASE_SECONDS, rises by ENDLESS_REWARD_SECONDS per round
            completed, and drops by PENALTY_SECONDS per wrong answer. Values
            come from constants so the copy never drifts from the engine. */}
        <dl
          className="animate-incident-rise mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 font-mono text-center"
          style={{ animationDelay: '240ms' }}
        >
          <div className="bg-[#0a0a0b] p-4">
            <dt className="text-xs tracking-wider text-zinc-500 uppercase">Reloj</dt>
            <dd className="mt-1 text-2xl font-bold text-zinc-100">{ENDLESS_BASE_SECONDS}s</dd>
          </div>
          <div className="bg-[#0a0a0b] p-4">
            <dt className="text-xs tracking-wider text-zinc-500 uppercase">Acierto</dt>
            <dd className="mt-1 text-2xl font-bold text-emerald-400">+{ENDLESS_REWARD_SECONDS}s</dd>
          </div>
          <div className="bg-[#0a0a0b] p-4">
            <dt className="text-xs tracking-wider text-zinc-500 uppercase">Error</dt>
            <dd className="mt-1 text-2xl font-bold text-red-400">−{PENALTY_SECONDS}s</dd>
          </div>
        </dl>

        <p
          className="animate-incident-rise mt-6 font-mono text-xs text-zinc-400"
          style={{ animationDelay: '300ms' }}
        >
          <span className="text-emerald-400">$</span> El reloj sube al acertar y baja al fallar.
          Sobreviven mientras haya segundos y vidas.
        </p>
      </div>
    </main>
  );
}

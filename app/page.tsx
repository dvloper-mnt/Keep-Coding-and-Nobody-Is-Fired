import { StartGameButton } from '@/src/components/molecules/StartGameButton';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0b] px-4 py-12 text-zinc-100 sm:py-16">
      <div className="mx-auto flex max-w-3xl flex-col">
        <p className="animate-incident-rise font-mono text-xs tracking-widest text-red-500 uppercase">
          <span className="text-zinc-600">[</span>
          INCIDENT-001
          <span className="text-zinc-600">]</span> producción · severidad alta
        </p>

        <h1
          className="animate-incident-rise mt-3 text-4xl font-bold tracking-tight sm:text-5xl"
          style={{ animationDelay: '60ms' }}
        >
          Keep Coding and
          <br />
          Nobody Is Fired
          <span className="ml-1 inline-block w-[0.6ch] animate-cursor-blink bg-red-500 align-baseline text-transparent">
            _
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
          <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-5">
            <p className="font-mono text-xs tracking-widest text-red-400 uppercase">Rol A</p>
            <p className="mt-1 text-xl font-bold text-red-300">Soy Coder</p>
            <p className="mt-2 text-sm text-zinc-400">
              Ves el código roto, el error y cuatro diagnósticos. Manejás el teclado y el reloj.
            </p>
            <StartGameButton />
          </div>

          <Link
            href="/helper"
            className="group rounded-lg border border-amber-500/30 bg-amber-950/20 p-5 transition-colors hover:border-amber-500/70 hover:bg-amber-950/40"
          >
            <p className="font-mono text-xs tracking-widest text-amber-400 uppercase">Rol B</p>
            <p className="mt-1 text-xl font-bold text-amber-200">Soy Helper</p>
            <p className="mt-2 text-sm text-zinc-400">
              Tenés el manual completo de debugging. No podés responder: guiás al Coder con tu voz.
            </p>
            <p className="mt-4 font-mono text-xs text-amber-400/80 group-hover:text-amber-200">
              Unirse con el código →
            </p>
          </Link>
        </div>

        <dl
          className="animate-incident-rise mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 font-mono text-center"
          style={{ animationDelay: '240ms' }}
        >
          <div className="bg-[#0a0a0b] p-4">
            <dt className="text-xs tracking-wider text-zinc-500 uppercase">Tiempo</dt>
            <dd className="mt-1 text-2xl font-bold text-zinc-100">180s</dd>
          </div>
          <div className="bg-[#0a0a0b] p-4">
            <dt className="text-xs tracking-wider text-zinc-500 uppercase">Error</dt>
            <dd className="mt-1 text-2xl font-bold text-red-400">−10s</dd>
          </div>
          <div className="bg-[#0a0a0b] p-4">
            <dt className="text-xs tracking-wider text-zinc-500 uppercase">Modo</dt>
            <dd className="mt-1 text-2xl font-bold text-emerald-400">Co-op</dd>
          </div>
        </dl>

        <p
          className="animate-incident-rise mt-6 font-mono text-xs text-zinc-600"
          style={{ animationDelay: '300ms' }}
        >
          <span className="text-emerald-500">$</span> El Coder inicia la partida y comparte el
          código de sala. El Helper entra con ese código.
        </p>
      </div>
    </main>
  );
}

import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-zinc-100">
      <div className="max-w-lg text-center">
        <p className="text-xs font-bold tracking-[0.3em] text-red-500 uppercase">
          Debug Simulator
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Keep Coding and Nobody Is Fired
        </h1>
        <p className="mt-4 text-zinc-400">
          Dos desarrolladores, una crisis en producción, clientes mirando. Cooperá para
          resolver los bugs antes de que se acabe el tiempo.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/coder"
            className="rounded-lg bg-red-600 px-8 py-4 text-center font-semibold text-white transition-colors hover:bg-red-500"
          >
            Soy Coder
          </Link>
          <Link
            href="/helper"
            className="rounded-lg border border-amber-500/50 bg-amber-950 px-8 py-4 text-center font-semibold text-amber-200 transition-colors hover:bg-amber-900"
          >
            Soy Helper
          </Link>
        </div>

        <p className="mt-8 text-xs text-zinc-600">
          El Coder inicia la partida y comparte el código de sala con el Helper.
        </p>
      </div>
    </div>
  );
}
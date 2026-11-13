import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="text-5xl">🎪</p>
      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">No encontramos esta página</h1>
      <p className="mt-2 text-sm text-slate-600">Puede que el link esté mal escrito o que el contenido ya no exista.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white">Ir al inicio</Link>
        <Link href="/ayuda" className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">Centro de ayuda</Link>
      </div>
    </main>
  );
}

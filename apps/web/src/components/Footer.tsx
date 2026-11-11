import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white py-8 text-sm text-slate-500">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
        <div>
          <p className="font-semibold text-slate-800">🎪 TuPuestito • Marketplace de Comisiones para Artistas Argentinos</p>
          <p className="text-xs text-slate-500">
            Pagos directos Split 1:1 sin custodia de fondos • Protección de obras con marca de agua automática
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
          <Link href="/terms" className="hover:text-purple-700 hover:underline">
            Términos y Condiciones
          </Link>
          <Link href="/privacy" className="hover:text-purple-700 hover:underline">
            Privacidad
          </Link>
          <Link href="/anti-ai-policy" className="hover:text-purple-700 hover:underline">
            Política Anti-IA Generativa
          </Link>
        </div>
      </div>
    </footer>
  );
}


import Link from "next/link";
import { CONSUMER_DEFENSE_URL, LEGAL, SUPPORT_EMAIL } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white py-10 text-sm text-slate-500">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-extrabold text-slate-800">🎪 TuPuestito</p>
          <p className="mt-1 text-xs">Comisiones de arte argentino, 100% humano. Pagos directos al artista por Mercado Pago.</p>
        </div>
        <nav aria-label="Plataforma" className="flex flex-col gap-2 text-xs font-medium">
          <p className="font-bold uppercase tracking-wide text-slate-400">Plataforma</p>
          <Link href="/" className="hover:text-purple-700">Explorar</Link>
          <Link href="/ayuda" className="hover:text-purple-700">Centro de ayuda</Link>
          <Link href="/anti-ai-policy" className="hover:text-purple-700">Política anti-IA</Link>
        </nav>
        <nav aria-label="Legales" className="flex flex-col gap-2 text-xs font-medium">
          <p className="font-bold uppercase tracking-wide text-slate-400">Legales</p>
          <Link href="/terms" className="hover:text-purple-700">Términos y Condiciones</Link>
          <Link href="/privacy" className="hover:text-purple-700">Política de Privacidad</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-purple-700">{SUPPORT_EMAIL}</a>
        </nav>
        <div className="flex flex-col items-start gap-3 text-xs">
          <Link
            href="/arrepentimiento"
            className="rounded-xl border-2 border-purple-600 px-4 py-2 text-sm font-bold text-purple-700 hover:bg-purple-50"
          >
            Botón de arrepentimiento
          </Link>
          <a href={CONSUMER_DEFENSE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-purple-700">
            Defensa de las y los Consumidores. Para reclamos ingresá aquí
          </a>
          {LEGAL.dataFiscalUrl && (
            <a href={LEGAL.dataFiscalUrl} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://www.afip.gob.ar/images/f960/DATAWEB.jpg" alt="Data Fiscal" width={50} loading="lazy" />
            </a>
          )}
        </div>
      </div>
      {(LEGAL.name || LEGAL.taxId || LEGAL.address) && (
        <p className="mx-auto mt-8 max-w-6xl px-4 text-[11px] text-slate-400">
          {[LEGAL.name, LEGAL.taxId && `CUIT ${LEGAL.taxId}`, LEGAL.address].filter(Boolean).join(" · ")}
        </p>
      )}
    </footer>
  );
}

import type { Metadata } from "next";
import { SupportForm } from "@/components/support/SupportForm";

export const metadata: Metadata = {
  title: "Botón de arrepentimiento",
  description: "Pedí la revocación de una compra hecha en TuPuestito. No hace falta registrarse ni dar motivos."
};

export default function ArrepentimientoPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">Botón de arrepentimiento</h1>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
          <p>
            Tenés derecho a revocar una compra hecha por internet dentro de los <strong>10 días corridos</strong> desde que la contrataste
            (art. 34 de la Ley 24.240 y art. 1110 del Código Civil y Comercial). No hace falta que des motivos ni que tengas una cuenta.
          </p>
          <p>
            Al enviar este formulario te damos un <strong>código de identificación</strong> y te mandamos la constancia por email dentro de las 24 horas.
            Después nos comunicamos con vos y con el artista para informarte cómo sigue.
          </p>
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            Para que lo sepas de antemano: las comisiones son obras hechas a medida según tus indicaciones, y la ley prevé una excepción al derecho
            de revocación para ese tipo de productos (art. 1116 del Código Civil y Comercial). Por eso analizamos cada pedido según en qué etapa
            esté; en todos los casos vas a recibir una respuesta.
          </p>
        </div>
        <div className="mt-6">
          <SupportForm kind="arrepentimiento" />
        </div>
      </div>
    </main>
  );
}

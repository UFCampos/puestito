export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
          Ley 25.326 de Protección de Datos Personales
        </span>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900">
          Política de Privacidad y Seguridad de Datos
        </h1>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-bold text-slate-900">1. Datos Recopilados</h2>
            <p className="mt-1">
              Recopilamos únicamente la información indispensable para operar tu cuenta: nombre de usuario, correo electrónico, preferencias de visualización de contenido y referencias adjuntas en los pedidos de comisión.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">2. Cifrado de Credenciales OAuth (AES-256-GCM)</h2>
            <p className="mt-1">
              Los tokens de vinculación con pasarelas de pago (Mercado Pago / AstroPay) se almacenan cifrados en reposo utilizando <strong>AES-256-GCM</strong>. TuPuestito jamás almacena números de tarjetas de crédito o débito.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">3. Protección Anti-Scraping de Obras</h2>
            <p className="mt-1">
              Las obras subidas al portfolio y las entregas parciales se sirven con marca de agua preventiva procesada en servidor y las entregas finales HD utilizan rutas protegidas que verifican la titularidad y el estado de pago antes de autorizar la descarga.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}


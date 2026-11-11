export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
          Documento Legal • Modelo No-Custodial
        </span>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900">
          Términos y Condiciones de Uso de TuPuestito
        </h1>
        <p className="mt-2 text-sm text-slate-500">Última actualización: Noviembre 2026 — República Argentina</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-bold text-slate-900">1. Rol de Intermediario Tecnológico (No-Custodial)</h2>
            <p className="mt-1">
              TuPuestito provee exclusivamente una vidriera tecnológica y herramientas de gestión de flujo de trabajo (briefs, marca de agua preventiva y entrega de archivos digitales) para conectar a ilustradores independientes con compradores. <strong>TuPuestito NO es una entidad financiera ni un Proveedor de Servicios de Pago (PSP)</strong>, y no capta, retiene ni custodia fondos de terceros en cuentas propias.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">2. Pagos Directos con Split 1:1</h2>
            <p className="mt-1">
              Todos los pagos en pesos argentinos se procesan de manera directa entre el comprador y la cuenta de Mercado Pago del artista mediante la tecnología oficial de <em>Marketplace Split</em>. Al momento de cada pago (100% anticipado o hitos 50%/50%), la pasarela acredita directamente el 95% en la cuenta del artista y descuenta el 5% en concepto de comisión por uso de plataforma de TuPuestito.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">3. Respaldo Inmutable del Acuerdo (ToS Snapshot)</h2>
            <p className="mt-1">
              Al enviar una solicitud de comisión, el comprador acepta explícitamente los Términos de Servicio particulares del artista y el plan de cobro configurado (<code>FULL_100</code>, <code>SPLIT_ON_SKETCH</code> o <code>SPLIT_ON_FINAL_PREVIEW</code>). TuPuestito guarda una copia inmutable de dicho acuerdo con fecha y hora exacta para proteger a ambas partes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">4. Propiedad Intelectual y Desbloqueo de Archivos HD</h2>
            <p className="mt-1">
              El artista conserva los derechos morales de autor sobre sus obras salvo pacto expreso de cesión comercial en su servicio. El archivo final en alta resolución sin marca de agua permanece bloqueado en almacenamiento privado hasta que la pasarela de pago confirma el 100% de los hitos acordados.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">5. Plazos, Vencimientos y Cancelaciones</h2>
            <p className="mt-1">
              Una vez aceptada la solicitud, el comprador tiene <strong>72 horas</strong> para abonar el primer pago; de lo contrario el pedido vence automáticamente y se libera el cupo. Antes de cualquier pago, tanto el artista como el comprador pueden cancelar sin costo. La seña inicial no es reembolsable una vez entregado el boceto, salvo acuerdo entre las partes o lo que disponga la normativa de defensa del consumidor vigente.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">6. Clasificación de Contenido y Contenido Prohibido</h2>
            <p className="mt-1">
              Las obras y servicios se clasifican como <strong>SFW</strong>, <strong>Suggestive</strong> o <strong>NSFW (+18)</strong>. El contenido +18 solo se muestra a usuarios mayores de edad que lo activen expresamente, y las entregas de pedidos viajan siempre por el hilo privado del pedido, nunca en URLs públicas. Los conceptos de cobro enviados a la pasarela de pago son siempre neutros.
            </p>
            <p className="mt-2">
              Queda <strong>absolutamente prohibido</strong> publicar, solicitar o entregar contenido ilegal, incluyendo cualquier representación sexual de menores (incluido loli/shota), contenido no consensuado, bestialismo o gore extremo. Su detección implica la baja inmediata de la cuenta y, cuando corresponda, la denuncia ante las autoridades.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}


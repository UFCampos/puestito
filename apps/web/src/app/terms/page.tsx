export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16 space-y-10 text-neutral-800 leading-relaxed">
      <div>
        <h1 className="text-4xl font-black text-neutral-900 tracking-tight">Términos y Condiciones de TuPuestito</h1>
        <p className="text-xs text-neutral-400 mt-2">Última actualización: Octubre 2026 • Argentina</p>
      </div>

      <section className="space-y-4 text-sm bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm">
        <h2 className="text-xl font-bold text-neutral-900">1. Naturaleza del Servicio (Intermediario Tecnológico)</h2>
        <p>
          <strong>TuPuestito</strong> opera como una plataforma tecnológica que facilita el contacto y la gestión de encargos creativos entre artistas independientes y clientes compradores.
        </p>
        <p className="p-4 bg-purple-50 rounded-xl text-purple-900 font-medium">
          ⚖️ <strong>Cláusula de No Custodia de Fondos:</strong> TuPuestito <strong>NO es una entidad financiera ni un Proveedor de Servicios de Pago (PSP)</strong> y bajo ninguna circunstancia custodia, retiene ni administra saldos o fondos de terceros. Todos los pagos se procesan de manera directa a través de pasarelas de pago reguladas e interoperables (como el sistema de pagos divididos <em>Marketplace Split</em> de Mercado Pago), acreditándose los fondos netos directamente en las cuentas de los artistas.
        </p>
      </section>

      <section id="anti-ia" className="space-y-4 text-sm bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm">
        <h2 className="text-xl font-bold text-neutral-900">2. Política de Arte 100% Humano (Tolerancia Cero a IA)</h2>
        <p>
          En consonancia con la protección y revalorización del trabajo artístico independiente, TuPuestito prohíbe de forma absoluta:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>La publicación, venta o entrega de ilustraciones o recursos generados mediante modelos de Inteligencia Artificial generativa.</li>
          <li>El uso de las obras expuestas en los perfiles de los artistas para el entrenamiento o scrapeo de modelos de difusión o lenguaje sin autorización explícita.</li>
        </ul>
        <p>
          Cualquier perfil que infrinja esta normativa será suspendido permanentemente de la plataforma.
        </p>
      </section>

      <section className="space-y-4 text-sm bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm">
        <h2 className="text-xl font-bold text-neutral-900">3. Modalidad de Pago por Etapas y Reembolsos</h2>
        <p>
          Las comisiones se gestionan en hitos independientes según lo pactado al inicio del encargo:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Seña Inicial (50% o 100% según el servicio):</strong> Habilita al artista a reservar el cupo de trabajo y bocetar la idea. La seña no es reembolsable una vez que el artista ha presentado y el comprador ha aprobado el boceto preliminar.</li>
          <li><strong>Pago Final:</strong> Se abona para autorizar la entrega final y desbloquear la descarga de los archivos originales en alta definición libres de marcas de agua.</li>
        </ul>
      </section>
    </div>
  );
}


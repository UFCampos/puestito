export default function AntiAiPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
          🎨 Comunidad 100% Arte Humano
        </span>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-900">
          Política Estricta Anti-IA Generativa
        </h1>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="text-lg font-bold text-slate-900">1. Prohibición de Imágenes Generadas por IA</h2>
            <p className="mt-1">
              TuPuestito nace para apoyar a los ilustradores y creadores humanos de Argentina. Queda estrictamente prohibido publicar en el portfolio o entregar en comisiones imágenes generadas total o parcialmente mediante modelos de Inteligencia Artificial generativa (Midjourney, Stable Diffusion, DALL-E, etc.).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">2. Verificación con Boceto Intermedio (WIP)</h2>
            <p className="mt-1">
              Nuestro flujo de trabajo incluye la etapa de <strong>Boceto con Marca de Agua</strong> precisamente para garantizar al comprador que su obra está siendo dibujada desde cero por el artista y permitir correcciones reales de composición y pose.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900">3. No Entrenamiento de Modelos</h2>
            <p className="mt-1">
              TuPuestito jamás utilizará ni venderá las obras o bocetos subidos por los artistas para entrenar modelos de Inteligencia Artificial propios ni de terceros.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}


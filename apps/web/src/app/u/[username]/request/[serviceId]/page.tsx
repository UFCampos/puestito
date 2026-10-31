"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchApi } from "../../../../../lib/api";
import { ShieldCheck, Info, UploadCloud, AlertCircle } from "lucide-react";

export default function CommissionRequestPage({
  params
}: {
  params: Promise<{ username: string; serviceId: string }>;
}) {
  const resolvedParams = use(params);
  const { username, serviceId } = resolvedParams;
  const router = useRouter();

  const [artistData, setArtistData] = useState<any>(null);
  const [service, setService] = useState<any>(null);
  const [brief, setBrief] = useState("");
  const [externalBoardUrl, setExternalBoardUrl] = useState("");
  const [refUrls, setRefUrls] = useState<string[]>([]);
  const [currentRefInput, setCurrentRefInput] = useState("");
  const [acceptedToS, setAcceptedToS] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchApi(`/artists/${username}`)
      .then((res) => {
        setArtistData(res.artist);
        const s = res.services?.find((x: any) => x.id === serviceId);
        setService(s);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [username, serviceId]);

  const handleAddRef = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentRefInput.trim() && refUrls.length < 10) {
      setRefUrls([...refUrls, currentRefInput.trim()]);
      setCurrentRefInput("");
    }
  };

  const handleRemoveRef = (index: number) => {
    setRefUrls(refUrls.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acceptedToS) {
      alert("Debés aceptar los términos del artista para continuar.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetchApi("/orders", {
        method: "POST",
        body: JSON.stringify({
          serviceId,
          buyerBrief: brief,
          referenceImages: refUrls,
          externalBoardUrl: externalBoardUrl || null
        })
      });

      router.push(`/orders/${res.id}`);
    } catch (err: any) {
      setError(err.message || "Error al enviar la solicitud. Asegurate de haber iniciado sesión.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-24 text-neutral-400">Cargando formulario... ✨</div>;

  if (!service) {
    return (
      <div className="text-center py-24">
        <h1 className="text-2xl font-bold">Servicio no encontrado</h1>
        <Link href={`/u/${username}`} className="mt-4 inline-block text-purple-600 font-bold">
          Volver al perfil
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <Link href={`/u/${username}`} className="text-sm font-semibold text-neutral-500 hover:text-neutral-900">
          ← Volver al puestito de {artistData?.displayName}
        </Link>
        <h1 className="text-3xl font-black text-neutral-900 mt-2">Solicitar Comisión: {service.title}</h1>
        <p className="text-neutral-600 text-sm mt-1">
          Completá los detalles de tu personaje o pedido para que el artista lo evalúe.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Resumen del Servicio */}
      <div className="bg-white p-6 rounded-2xl border border-neutral-200 mb-8 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
          <div>
            <span className="text-xs uppercase font-bold text-neutral-400">Precio total</span>
            <div className="text-2xl font-black text-neutral-900">${service.priceArs.toLocaleString("es-AR")} ARS</div>
          </div>
          <div className="text-right">
            <span className="text-xs uppercase font-bold text-neutral-400">Tiempo estimado</span>
            <div className="text-sm font-bold text-neutral-700">{service.turnaroundDays} días hábiles</div>
          </div>
        </div>

        {/* Modalidad de pago */}
        <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-100 text-xs text-purple-900 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-sm">Modalidad de pago configurada por el artista:</span>
            {service.paymentPlan === "SPLIT_ON_SKETCH" && (
              <p className="mt-0.5">
                <strong>50% de seña inicial</strong> (${(service.priceArs * 0.5).toLocaleString("es-AR")} ARS) una vez que el artista acepta el pedido, y el <strong>50% restante</strong> al aprobar el boceto.
              </p>
            )}
            {service.paymentPlan === "SPLIT_ON_FINAL_PREVIEW" && (
              <p className="mt-0.5">
                <strong>50% de seña inicial</strong> (${(service.priceArs * 0.5).toLocaleString("es-AR")} ARS) para comenzar, y el <strong>50% restante</strong> recién cuando el artista termine la obra y veas la vista previa con marca de agua (antes de desbloquear la descarga en HD).
              </p>
            )}
            {service.paymentPlan === "FULL_100" && (
              <p className="mt-0.5">
                <strong>100% de pago por adelantado</strong> (${service.priceArs.toLocaleString("es-AR")} ARS) al aceptar el pedido.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Descripción del pedido */}
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 space-y-2">
          <label className="block text-sm font-bold text-neutral-900">
            Descripción del encargo <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-neutral-500">
            Explicá la pose, expresión, vestimenta, colores o personalidad de tu personaje.
          </p>
          <textarea
            required
            rows={5}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Ej: Quiero a mi personaje original con sonrisa confiada, sosteniendo una taza de café..."
            className="w-full p-3.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
          />
        </div>

        {/* Referencias Visuales (hasta 10) */}
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 space-y-4">
          <div>
            <label className="block text-sm font-bold text-neutral-900">
              Imágenes de Referencia ({refUrls.length}/10)
            </label>
            <p className="text-xs text-neutral-500">
              Pegá URLs directas de imágenes de tu personaje o referencias de paleta de colores/ropa.
            </p>
          </div>

          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://ejemplo.com/imagen.png"
              value={currentRefInput}
              onChange={(e) => setCurrentRefInput(e.target.value)}
              className="flex-1 p-2.5 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="button"
              onClick={handleAddRef}
              disabled={refUrls.length >= 10 || !currentRefInput.trim()}
              className="bg-neutral-900 text-white text-xs font-bold px-4 py-2.5 rounded-lg disabled:opacity-40"
            >
              Agregar
            </button>
          </div>

          {refUrls.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {refUrls.map((url, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-neutral-100 text-neutral-700 px-3 py-1.5 rounded-lg text-xs"
                >
                  <span className="truncate max-w-[200px]">{url}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRef(i)}
                    className="text-red-500 hover:text-red-700 font-bold"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tablero externo (Excalidraw, Miro, Drive) */}
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 space-y-2">
          <label className="block text-sm font-bold text-neutral-900">
            Tablero de Referencias Externo (Opcional)
          </label>
          <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-800 flex items-start gap-2 mb-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              💡 <strong>Tip pro:</strong> Para composiciones complejas, te sugerimos armar un lienzo gratis en{" "}
              <a href="https://excalidraw.com" target="_blank" rel="noreferrer" className="underline font-bold">
                Excalidraw
              </a>
              , Miro o Google Drive y pegar el link compartido acá.
            </span>
          </div>
          <input
            type="url"
            placeholder="https://excalidraw.com/#room=... o link a Drive"
            value={externalBoardUrl}
            onChange={(e) => setExternalBoardUrl(e.target.value)}
            className="w-full p-3 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Términos del Artista y Checkbox Obligatorio */}
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 space-y-4">
          <h4 className="text-sm font-bold text-neutral-900">Términos de Servicio del Artista</h4>
          <div className="p-4 bg-neutral-50 rounded-xl text-xs text-neutral-600 max-h-36 overflow-y-auto whitespace-pre-line border border-neutral-100">
            {artistData?.termsOfService || "Términos estándar de TuPuestito: Uso personal, prohibido entrenar modelos de IA generativa."}
          </div>

          <label className="flex items-start gap-3 cursor-pointer pt-2">
            <input
              type="checkbox"
              required
              checked={acceptedToS}
              onChange={(e) => setAcceptedToS(e.target.checked)}
              className="mt-1 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-neutral-300"
            />
            <span className="text-xs text-neutral-700 leading-relaxed">
              He leído y acepto los <strong>Términos de Servicio de @{artistData?.username}</strong> y de TuPuestito.
              Entiendo que la seña inicial no es reembolsable una vez aprobado el boceto.
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-2xl shadow-lg transition disabled:opacity-50 text-base"
        >
          {submitting ? "Enviando solicitud..." : "Enviar Solicitud al Artista ✨"}
        </button>
      </form>
    </div>
  );
}


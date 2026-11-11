"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, milestoneAmounts, uploadReference, type Milestone } from "@/lib/api";
import { useMe } from "@/lib/useMe";

type Addon = { id: string; name: string; priceArs: number };
type Ref = { key: string; preview: string; name: string };

const MAX_REFS = 10;

export default function CommissionRequestPage() {
  const params = useParams<{ username: string; serviceId: string }>();
  const username = params?.username || "";
  const serviceId = params?.serviceId || "";
  const router = useRouter();
  const { user, loading: userLoading } = useMe();

  const [artist, setArtist] = useState<any>(null);
  const [service, setService] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [buyerBrief, setBuyerBrief] = useState("");
  const [externalBoardUrl, setExternalBoardUrl] = useState("");
  const [refs, setRefs] = useState<Ref[]>([]);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!username) return;
    apiFetch(`/api/artists/${username}`)
      .then((res) => {
        setArtist(res.artist);
        const found = (res.services || []).find((s: any) => s.id === serviceId);
        if (!found) setNotFound(true);
        setService(found ?? null);
      })
      .catch(() => setNotFound(true));
  }, [username, serviceId]);

  useEffect(() => () => refs.forEach((r) => URL.revokeObjectURL(r.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Este servicio ya no está disponible</h1>
        <Link href={`/u/${username}`} className="mt-4 inline-block text-sm font-bold text-purple-700 hover:underline">
          Ver el puestito de @{username}
        </Link>
      </main>
    );
  }

  if (!artist || !service || userLoading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-sm text-slate-500">Cargando formulario de comisión...</p>
      </main>
    );
  }

  const addonsList: Addon[] = service.addons || [];
  const extraAmountArs = addonsList
    .filter((a) => selectedAddons.includes(a.id))
    .reduce((sum, a) => sum + a.priceArs, 0);
  const totalArs = service.priceArs + extraAmountArs;
  const isMilestones = service.paymentPlan === "MILESTONES";
  const stages: Milestone[] = isMilestones ? service.milestones || [] : [];
  const stageAmounts = milestoneAmounts(stages, totalArs);
  const isSplit = service.paymentPlan === "SPLIT_ON_SKETCH" || service.paymentPlan === "SPLIT_ON_FINAL_PREVIEW";
  const depositArs = isSplit ? Math.round(totalArs / 2) : totalArs;
  const finalArs = isSplit ? totalArs - depositArs : 0;
  const secondPaymentMoment =
    service.paymentPlan === "SPLIT_ON_SKETCH" ? "aprobar el boceto" : "aprobar la vista previa final con marca de agua";
  const closed = artist.commissionStatus === "CLOSED" || service.slotsAvailable === 0;
  const isOwnService = user?.id === artist.userId;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (refs.length + files.length > MAX_REFS) {
      setError(`Podés subir hasta ${MAX_REFS} imágenes de referencia.`);
      return;
    }
    setUploadingRef(true);
    setError("");
    try {
      for (const file of files) {
        const key = await uploadReference(file);
        setRefs((prev) => [...prev, { key, preview: URL.createObjectURL(file), name: file.name }]);
      }
    } catch (err: any) {
      setError(err.status === 401 ? "Iniciá sesión para subir referencias." : err.message || "Error subiendo imagen");
    } finally {
      setUploadingRef(false);
    }
  };

  const removeRef = (key: string) => {
    setRefs((prev) => {
      const r = prev.find((x) => x.key === key);
      if (r) URL.revokeObjectURL(r.preview);
      return prev.filter((x) => x.key !== key);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push(`/login?next=/u/${username}/request/${serviceId}`);
      return;
    }
    if (!acceptedTerms) {
      setError("Tenés que aceptar los Términos de Servicio del artista y la modalidad de pago.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch<{ id: string }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          serviceId: service.id,
          addonIds: selectedAddons,
          buyerBrief,
          referenceKeys: refs.map((r) => r.key),
          externalBoardUrl: externalBoardUrl.trim() || undefined,
          acceptedTerms: true
        })
      });
      router.push(`/orders/${res.id}`);
    } catch (err: any) {
      setError(err.message || "No se pudo enviar la solicitud");
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/u/${artist.username}`} className="text-xs font-bold text-purple-700 hover:underline">
        ← Volver al puestito de {artist.displayName}
      </Link>

      <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {/* 1. Resumen de condiciones (Plan §6.1) */}
        <div className="border-b border-slate-100 pb-5">
          <span className="rounded-full bg-purple-100 px-3 py-0.5 text-xs font-bold text-purple-800">
            Solicitud de Comisión
          </span>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{service.title}</h1>
          <p className="text-xs text-slate-500">
            Artista: <strong>{artist.displayName}</strong> (@{artist.username})
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-slate-400">Precio base</dt>
              <dd className="font-bold text-slate-900">${service.priceArs.toLocaleString("es-AR")}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Extras</dt>
              <dd className="font-bold text-slate-900">+${extraAmountArs.toLocaleString("es-AR")}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Plazo / revisiones</dt>
              <dd className="font-bold text-slate-900">
                {service.turnaroundDays} días · {service.revisionsIncluded} rev.
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Total</dt>
              <dd className="text-base font-extrabold text-purple-700">${totalArs.toLocaleString("es-AR")} ARS</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs font-semibold text-purple-800">
            Modalidad:{" "}
            {service.paymentPlan === "FULL_100"
              ? "100% al inicio"
              : isMilestones
              ? `pago en ${stages.length} etapas (cada una se abona antes de que el artista la empiece)`
              : `50% de seña al aceptar el pedido y 50% al ${secondPaymentMoment}`}
          </p>
        </div>

        {closed && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3.5 text-xs font-bold text-amber-800">
            ⏸️ Este servicio no está tomando pedidos en este momento.
          </div>
        )}
        {isOwnService && (
          <div className="mt-4 rounded-xl bg-slate-100 p-3.5 text-xs font-bold text-slate-700">
            Este es tu propio servicio: así lo ven tus compradores.
          </div>
        )}
        {error && <div className="mt-4 rounded-xl bg-rose-50 p-3.5 text-xs font-bold text-rose-700">⚠️ {error}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* 2. Brief */}
          <div>
            <label htmlFor="brief-textarea" className="block text-sm font-bold text-slate-800">
              Descripción del pedido *
            </label>
            <textarea
              id="brief-textarea"
              required
              minLength={10}
              maxLength={8000}
              rows={6}
              value={buyerBrief}
              onChange={(e) => setBuyerBrief(e.target.value)}
              placeholder="Personalidad del personaje, pose deseada, expresión, detalles importantes que no deben faltar..."
              className="mt-2 w-full rounded-xl border border-slate-300 p-3.5 text-sm focus:border-purple-600 focus:outline-none"
            />
          </div>

          {/* Extras */}
          {addonsList.length > 0 && (
            <div>
              <span className="block text-sm font-bold text-slate-800">Extras opcionales</span>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {addonsList.map((addon) => {
                  const checked = selectedAddons.includes(addon.id);
                  return (
                    <label
                      key={addon.id}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs transition ${
                        checked ? "border-purple-600 bg-purple-50 font-semibold" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedAddons((prev) =>
                              checked ? prev.filter((id) => id !== addon.id) : [...prev, addon.id]
                            )
                          }
                          className="h-4 w-4 rounded text-purple-600"
                        />
                        {addon.name}
                      </span>
                      <span className="font-bold text-purple-700">+${addon.priceArs.toLocaleString("es-AR")}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Referencias (hasta 10, PNG/JPG/WebP, 5 MB) */}
          <div>
            <div className="flex items-center justify-between">
              <span className="block text-sm font-bold text-slate-800">
                Referencias visuales ({refs.length}/{MAX_REFS})
              </span>
              <span className="text-xs text-slate-400">PNG, JPG o WebP · máx. 5 MB c/u</span>
            </div>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileUpload({ target: { files: e.dataTransfer.files, value: "" } } as any);
              }}
              className={`mt-2 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-600 hover:border-purple-400 ${
                refs.length >= MAX_REFS ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <span className="text-2xl">📤</span>
              <span className="mt-1 font-bold text-purple-700">
                {uploadingRef ? "Subiendo..." : "Arrastrá tus imágenes acá o hacé clic para elegirlas"}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                disabled={!user || uploadingRef || refs.length >= MAX_REFS}
              />
              {!user && <span className="mt-1 text-amber-700">Iniciá sesión para subir referencias.</span>}
            </label>

            {refs.length > 0 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {refs.map((r, i) => (
                  <div key={r.key} className="relative h-20 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <img src={r.preview} alt={`Referencia ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeRef(r.key)}
                      aria-label={`Quitar ${r.name}`}
                      className="absolute right-1 top-1 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Tablero externo */}
          <div>
            <label htmlFor="board-url" className="block text-sm font-bold text-slate-800">
              Link a tablero externo (opcional)
            </label>
            <p className="text-xs text-slate-500">
              💡 ¿Querés explicarle mejor la pose o composición al artista? Te recomendamos armar un lienzo gratis en{" "}
              <a href="https://excalidraw.com" target="_blank" rel="noreferrer" className="font-bold text-purple-700 underline">
                Excalidraw
              </a>
              , Miro o Google Drive y pegar el link compartido acá.
            </p>
            <input
              id="board-url"
              type="url"
              pattern="https://.*"
              title="El link debe empezar con https://"
              value={externalBoardUrl}
              onChange={(e) => setExternalBoardUrl(e.target.value)}
              placeholder="https://excalidraw.com/#json=..."
              className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-purple-600 focus:outline-none"
            />
          </div>

          {/* 5. Términos + checkbox legal */}
          <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-5">
            <h3 className="text-sm font-extrabold text-purple-950">Plan de pagos</h3>
            {isMilestones && (
              <ol className="mt-2 space-y-2 text-xs text-slate-700">
                {stages.map((m, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-white p-2.5">
                    <span>
                      <strong className="text-slate-900">
                        Etapa {i + 1}: {m.title}
                      </strong>
                      {m.description && <span className="block text-slate-500">{m.description}</span>}
                      <span className="block text-slate-400">
                        {i === 0 ? "Se paga al aceptar el artista tu solicitud" : `Se paga al aprobar la etapa ${i}`} · {m.days} días
                      </span>
                    </span>
                    <strong className="shrink-0 text-slate-900">
                      ${stageAmounts[i].toLocaleString("es-AR")} ARS ({m.percent}%)
                    </strong>
                  </li>
                ))}
              </ol>
            )}
            <div className={`mt-2 space-y-1.5 text-xs text-slate-700 ${isMilestones ? "hidden" : ""}`}>
              <div className="flex justify-between">
                <span>1° pago (al aceptar el artista tu solicitud):</span>
                <strong>
                  ${depositArs.toLocaleString("es-AR")} ARS ({isSplit ? "50% seña" : "100%"})
                </strong>
              </div>
              {isSplit && (
                <div className="flex justify-between">
                  <span>2° pago (al {secondPaymentMoment}):</span>
                  <strong>${finalArs.toLocaleString("es-AR")} ARS (50%)</strong>
                </div>
              )}
            </div>

            <details className="mt-4 rounded-xl bg-white p-3 text-xs text-slate-600">
              <summary className="cursor-pointer font-bold text-slate-800">
                Leer los Términos de Servicio de @{artist.username}
              </summary>
              <p className="mt-2 whitespace-pre-line">
                {artist.termsOfService || "El artista no publicó términos propios; aplican los Términos de TuPuestito."}
              </p>
            </details>

            <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-xs text-slate-800">
              <input
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-purple-400 text-purple-600"
              />
              <span>
                Entiendo y acepto los Términos de Servicio de <strong>@{artist.username}</strong> y la modalidad de pago
                elegida (
                <strong>
                  {isMilestones
                    ? `pago en ${stages.length} etapas, cada una antes de que el artista la empiece`
                    : isSplit
                    ? `50% de seña al aceptar el pedido y 50% al ${secondPaymentMoment}`
                    : "100% al aceptar el pedido"}
                </strong>
                ).{" "}
                {isMilestones
                  ? "Entiendo que el pago de cada etapa no es reembolsable una vez entregada esa etapa."
                  : "Entiendo que la seña inicial no es reembolsable una vez entregado el boceto."}
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || uploadingRef || closed || isOwnService}
            className="w-full rounded-2xl bg-purple-600 py-3.5 text-sm font-extrabold text-white shadow-md transition hover:bg-purple-700 disabled:opacity-50"
          >
            {!user
              ? "Iniciá sesión para enviar la solicitud"
              : submitting
              ? "Enviando solicitud..."
              : `Enviar solicitud ($${totalArs.toLocaleString("es-AR")} ARS)`}
          </button>
          <p className="text-center text-[11px] text-slate-400">
            No se cobra nada hasta que el artista acepte tu pedido.
          </p>
        </form>
      </div>
    </main>
  );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, API_URL, fileTooLarge, resolveImageUrl } from "../../../lib/api";
import { useAppConfig } from "../../../lib/useAppConfig";

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const DELIVERY_EXT = /\.(png|jpe?g|webp|zip|rar|psd)$/i;

// Plan §4: pasos según la modalidad pactada
function stepsFor(plan: string) {
  const steps = [
    { key: "REQUESTED", label: "Solicitud enviada", icon: "📝" },
    { key: "ACCEPTED_WAITING_DEPOSIT", label: plan === "FULL_100" ? "Pago 100%" : "Seña 50%", icon: "💳" },
    { key: "IN_PROGRESS_SKETCH", label: "Boceto en proceso", icon: "✏️" },
    { key: "SKETCH_REVIEW", label: "Revisión de boceto", icon: "👀" }
  ];
  if (plan === "SPLIT_ON_SKETCH") steps.push({ key: "WAITING_PAYMENT_AFTER_SKETCH", label: "2° pago 50%", icon: "💳" });
  steps.push({ key: "WORKING_FINAL", label: "Obra final", icon: "🎨" });
  if (plan === "SPLIT_ON_FINAL_PREVIEW") {
    steps.push({ key: "FINAL_PREVIEW_REVIEW", label: "Vista previa final", icon: "✨" });
    steps.push({ key: "WAITING_PAYMENT_BEFORE_HD", label: "2° pago 50%", icon: "💳" });
  }
  steps.push({ key: "COMPLETED_HD_UNLOCKED", label: "HD desbloqueado", icon: "🎉" });
  return steps;
}

const STATUS_BADGE: Record<string, { text: string; color: string }> = {
  REQUESTED: { text: "Solicitud Pendiente de Aceptación", color: "bg-amber-50 text-amber-700 border-amber-200" },
  ACCEPTED_WAITING_DEPOSIT: { text: "Aceptado • Esperando Pago Inicial", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  IN_PROGRESS_SKETCH: { text: "En Progreso • Dibujando Boceto", color: "bg-blue-50 text-blue-700 border-blue-200" },
  SKETCH_REVIEW: { text: "Boceto Entregado • Esperando Aprobación", color: "bg-purple-50 text-purple-700 border-purple-200" },
  WAITING_PAYMENT_AFTER_SKETCH: { text: "Boceto Aprobado • Esperando 2do 50%", color: "bg-pink-50 text-pink-700 border-pink-200" },
  WORKING_FINAL: { text: "En Progreso • Pintando Entrega Final", color: "bg-violet-50 text-violet-700 border-violet-200" },
  FINAL_PREVIEW_REVIEW: { text: "Vista Previa Lista • Esperando Aprobación", color: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  WAITING_PAYMENT_BEFORE_HD: { text: "Vista Previa Aprobada • Pagar 2do 50% para desbloquear HD", color: "bg-pink-50 text-pink-700 border-pink-200" },
  COMPLETED_HD_UNLOCKED: { text: "Completado • Archivo HD Desbloqueado", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CANCELLED: { text: "Pedido Cancelado", color: "bg-rose-50 text-rose-700 border-rose-200" },
  REJECTED: { text: "Solicitud Rechazada (sin cobro)", color: "bg-rose-50 text-rose-700 border-rose-200" },
  EXPIRED: { text: "Vencido • No se pagó a tiempo", color: "bg-slate-100 text-slate-600 border-slate-200" },
};

export default function OrderWorkspacePageWrapper() {
  return (
    <Suspense>
      <OrderWorkspacePage />
    </Suspense>
  );
}

function OrderWorkspacePage() {
  const params = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const orderId = params?.orderId || "";
  const paymentResult = searchParams?.get("payment");
  const returnedPaymentId = searchParams?.get("payment_id") || searchParams?.get("collection_id");
  const [paymentNotice, setPaymentNotice] = useState<"" | "processing" | "approved" | "failed">(
    paymentResult === "success" || paymentResult === "pending" ? "processing" : paymentResult === "failure" ? "failed" : ""
  );

  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Message state
  const [messageText, setMessageText] = useState("");
  const [changeFeedback, setChangeFeedback] = useState("");

  // Artist upload state (sketch / final)
  const [sketchWatermarkMode, setSketchWatermarkMode] = useState("AUTO_TEXT");
  const [sketchFile, setSketchFile] = useState<File | null>(null);

  const [finalWatermarkMode, setFinalWatermarkMode] = useState("AUTO_TEXT");
  const [finalFile, setFinalFile] = useState<File | null>(null);
  const [finalPreviewFile, setFinalPreviewFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const limits = useAppConfig().uploadLimitsMb;
  // Un .zip / .rar / .psd no se puede previsualizar: hace falta una imagen aparte
  const finalNeedsPreview = Boolean(finalFile && !IMAGE_EXT.test(finalFile.name));

  function pickFile(file: File | undefined, maxMb: number, allowed: RegExp, allowedText: string): File | null {
    setUploadError("");
    if (!file) return null;
    if (!allowed.test(file.name)) {
      setUploadError(`"${file.name}" no es un formato admitido. Subí ${allowedText}.`);
      return null;
    }
    const tooLarge = fileTooLarge(file, maxMb);
    if (tooLarge) {
      setUploadError(tooLarge);
      return null;
    }
    return file;
  }

  // Buyer review state
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  const [rejectReason, setRejectReason] = useState("");

  async function loadOrder() {
    try {
      const data = await apiFetch<any>(`/api/orders/${orderId}`);
      setPayload(data);
    } catch (err: any) {
      setError(err.message || "Error al cargar el pedido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!orderId) return;
    (async () => {
      // Al volver de Mercado Pago confirmamos el pago contra la API de MP (no confiamos en la URL)
      if (returnedPaymentId && /^\d+$/.test(returnedPaymentId)) {
        try {
          const r = await apiFetch<{ status?: string }>("/api/payments/verify", {
            method: "POST",
            body: JSON.stringify({ orderId, paymentId: returnedPaymentId })
          });
          if (r.status === "approved") setPaymentNotice("approved");
        } catch {
          // el webhook lo va a procesar igual
        }
      }
      await loadOrder();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Mientras esperamos el webhook, refrescamos cada 4 s (máx. 1 min)
  useEffect(() => {
    if (paymentNotice !== "processing") return;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      loadOrder();
      if (n >= 15) clearInterval(t);
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentNotice]);

  const lastPaidAt = (payload?.payments || [])
    .filter((p: any) => p.status === "APPROVED" && p.paidAt)
    .map((p: any) => new Date(p.paidAt).getTime())
    .sort()
    .pop();
  useEffect(() => {
    if (paymentNotice === "processing" && lastPaidAt && Date.now() - lastPaidAt < 10 * 60_000) {
      setPaymentNotice("approved");
    }
  }, [lastPaidAt, paymentNotice]);

  const order = payload?.order;
  const service = payload?.service;
  const artist = payload?.artist;
  const buyer = payload?.buyer;
  const isArtist = Boolean(payload?.isArtist);
  const isBuyer = Boolean(payload?.isBuyer);
  const messages = payload?.messages || [];
  const payments = payload?.payments || [];
  const review = payload?.review;

  async function handleAcceptOrder() {
    setActionLoading(true);
    try {
      await apiFetch(`/api/orders/${orderId}/accept`, { method: "POST" });
      await loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRejectOrder() {
    if (!confirm("¿Rechazar esta solicitud? No se le cobra nada al comprador.")) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/orders/${orderId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason.trim() || undefined })
      });
      await loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDownloadHd() {
    setActionLoading(true);
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/orders/${orderId}/download-hd`);
      window.location.href = url;
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelOrder() {
    if (!confirm("¿Seguro que querés cancelar este pedido?")) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/orders/${orderId}/cancel`, { method: "POST" });
      await loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckout() {
    setActionLoading(true);
    try {
      const res = await apiFetch<{ initPoint: string }>(`/api/orders/${orderId}/checkout`, {
        method: "POST",
      });
      window.location.href = res.initPoint;
    } catch (err: any) {
      alert(err.message);
      setActionLoading(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageText.trim()) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/orders/${orderId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: messageText }),
      });
      setMessageText("");
      await loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUploadSketch(e: React.FormEvent) {
    e.preventDefault();
    if (!sketchFile) {
      alert("Seleccioná un archivo de imagen para subir el boceto.");
      return;
    }
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append("watermarkMode", sketchWatermarkMode);
      formData.append("file", sketchFile);
      const res = await fetch(`${API_URL}/api/orders/${orderId}/sketch`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al subir boceto");
      }
      setSketchFile(null);
      await loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApproveSketch() {
    setActionLoading(true);
    try {
      await apiFetch(`/api/orders/${orderId}/approve-sketch`, { method: "POST" });
      await loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRequestChanges() {
    if (!changeFeedback.trim()) {
      alert("Escribí qué ajustes necesitás en el boceto.");
      return;
    }
    setActionLoading(true);
    try {
      await apiFetch(`/api/orders/${orderId}/request-changes`, {
        method: "POST",
        body: JSON.stringify({ feedback: changeFeedback }),
      });
      setChangeFeedback("");
      await loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeliverFinal(e: React.FormEvent) {
    e.preventDefault();
    if (!finalFile) {
      alert("Seleccioná el archivo final (imagen, .zip o .rar).");
      return;
    }
    if (finalNeedsPreview && !finalPreviewFile) {
      alert("Como el archivo final no es una imagen, subí también una imagen para la vista previa.");
      return;
    }
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append("watermarkMode", finalWatermarkMode);
      formData.append("file", finalFile);
      if (finalPreviewFile) formData.append("preview", finalPreviewFile);
      const res = await fetch(`${API_URL}/api/orders/${orderId}/deliver-final`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al subir entrega final");
      }
      setFinalFile(null);
      setFinalPreviewFile(null);
      await loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApproveFinalPreview() {
    setActionLoading(true);
    try {
      await apiFetch(`/api/orders/${orderId}/approve-final-preview`, { method: "POST" });
      await loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitReview(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    try {
      await apiFetch(`/api/orders/${orderId}/review`, {
        method: "POST",
        body: JSON.stringify({ rating, comment: reviewComment }),
      });
      await loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-slate-500">
        Cargando sala de trabajo del pedido...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">No pudimos abrir el pedido</h1>
        <p className="mt-2 text-slate-600">{error}</p>
        <Link href="/my-orders" className="mt-6 inline-block rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white">
          Ir a Mis Pedidos
        </Link>
      </div>
    );
  }

  const badge = STATUS_BADGE[order.status] || { text: order.status, color: "bg-slate-100 text-slate-700" };
  const parsedRefs: string[] = order.referenceImages || [];
  const STATUS_STEPS = stepsFor(order.paymentPlanSnapshot);
  const currentStepIdx = STATUS_STEPS.findIndex((s) => s.key === order.status);
  const revisionsIncluded = order.serviceSnapshot?.revisionsIncluded ?? 0;
  const revisionsLeft = Math.max(0, revisionsIncluded - (order.revisionsUsed ?? 0));
  const depositDeadline = payload?.depositExpiresAt ? new Date(payload.depositExpiresAt) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {paymentNotice === "approved" && (
        <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-emerald-900 shadow-sm">
          <p className="font-bold">🎉 ¡Pago acreditado!</p>
          <p className="text-xs text-emerald-700">El dinero fue directo a la cuenta del artista y el pedido avanzó de etapa.</p>
        </div>
      )}
      {paymentNotice === "processing" && (
        <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sky-900 shadow-sm">
          <p className="font-bold">⏳ Estamos confirmando tu pago con Mercado Pago...</p>
          <p className="text-xs text-sky-700">Esta página se actualiza sola. Si pagaste en efectivo puede demorar más.</p>
        </div>
      )}
      {paymentNotice === "failed" && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-rose-900 shadow-sm">
          <p className="font-bold">El pago no se completó</p>
          <p className="text-xs text-rose-700">No se te cobró nada. Podés volver a intentarlo cuando quieras.</p>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Pedido #{order.orderNumber || order.id.slice(0, 8)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.color}`}>
              {badge.text}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
            {service?.title || "Comisión Personalizada"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <span>
              🎨 Artista:{" "}
              <Link href={`/u/${artist?.username}`} className="font-semibold text-purple-600 hover:underline">
                {artist?.displayName} (@{artist?.username})
              </Link>
            </span>
            <span>•</span>
            <span>
              👤 Comprador: <strong className="text-slate-900">{buyer?.displayName}</strong> (@{buyer?.username})
            </span>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs font-medium uppercase text-slate-400">Total Acordado</p>
          <p className="text-2xl font-extrabold text-slate-900">
            ${Number(order.totalAmount).toLocaleString("es-AR")} {order.currency}
          </p>
          <p className="mt-0.5 text-xs font-medium text-purple-600">
            {order.paymentPlanSnapshot === "FULL_100" && "Modalidad: 100% Anticipado"}
            {order.paymentPlanSnapshot === "SPLIT_ON_SKETCH" && "Modalidad: 50% Seña + 50% al aprobar Boceto"}
            {order.paymentPlanSnapshot === "SPLIT_ON_FINAL_PREVIEW" && "Modalidad: 50% Seña + 50% al aprobar Previa Final"}
          </p>
        </div>
      </div>

      {/* Visual Stepper */}
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {STATUS_STEPS.map((s, idx) => {
          const isCompleted = currentStepIdx >= 0 && (idx < currentStepIdx || order.status === "COMPLETED_HD_UNLOCKED");
          const isCurrent = order.status === s.key;
          return (
            <div
              key={s.key}
              className={`rounded-2xl border p-3 text-center transition ${
                isCurrent
                  ? "border-purple-600 bg-purple-50 text-purple-900 shadow-sm ring-2 ring-purple-500/20"
                  : isCompleted
                  ? "border-emerald-200 bg-emerald-50/60 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              <div className="text-lg">{s.icon}</div>
              <div className="mt-1 text-[11px] font-semibold leading-tight">{s.label}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Left 2 Columns: Action Center + Deliverables + Chat */}
        <div className="space-y-6 lg:col-span-2">
          {/* ACTION PANEL BY STATUS & ROLE */}
          <div className="rounded-3xl border-2 border-purple-200 bg-gradient-to-br from-purple-50/70 via-white to-pink-50/40 p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">⚡ Próxima acción requerida</h2>

            {/* 1. REQUESTED */}
            {order.status === "REQUESTED" && (
              <div className="mt-3">
                {isArtist ? (
                  <div>
                    <p className="text-sm text-slate-600">
                      Revisá el brief y las referencias del comprador. Si aceptás el pedido, se habilitará el link de pago directo a tu cuenta.
                    </p>
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Motivo del rechazo (opcional, lo ve el comprador)"
                      className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                    />
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={handleAcceptOrder}
                        disabled={actionLoading}
                        className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                      >
                        ✅ Aceptar Solicitud y Habilitar Pago
                      </button>
                      <button
                        onClick={handleRejectOrder}
                        disabled={actionLoading}
                        className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        Rechazar solicitud
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-slate-600">
                      ⏳ El artista está revisando tu brief y referencias. Aún no debés realizar ningún pago hasta que acepte tu solicitud.
                    </p>
                    <button
                      onClick={handleCancelOrder}
                      disabled={actionLoading}
                      className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Retirar solicitud
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 2. ACCEPTED_WAITING_DEPOSIT */}
            {order.status === "ACCEPTED_WAITING_DEPOSIT" && (
              <div className="mt-3">
                {isBuyer ? (
                  <div>
                    <p className="text-sm text-slate-700">
                      ¡El artista aceptó tu comisión! Para comenzar a trabajar en el boceto, aboná el pago inicial mediante Mercado Pago Split.
                    </p>
                    <button
                      onClick={() => handleCheckout()}
                      disabled={actionLoading}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#009EE3] px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-[#0089C7] disabled:opacity-50"
                    >
                      💳 Pagar ${Number(order.depositAmount).toLocaleString("es-AR")} ARS con Mercado Pago
                    </button>
                    {depositDeadline && (
                      <p className="mt-2 text-xs text-slate-500">
                        Tenés tiempo hasta el {depositDeadline.toLocaleString("es-AR")}; después el pedido vence y se libera el cupo.
                      </p>
                    )}
                    <button
                      onClick={handleCancelOrder}
                      disabled={actionLoading}
                      className="mt-3 block text-xs font-semibold text-slate-500 underline hover:text-slate-800"
                    >
                      Cancelar pedido
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    ⏳ Solicitud aceptada. Esperando que el comprador abone el pago inicial (${Number(order.depositAmount).toLocaleString("es-AR")} ARS) para empezar a dibujar.
                  </p>
                )}
              </div>
            )}

            {/* 3. IN_PROGRESS_SKETCH */}
            {order.status === "IN_PROGRESS_SKETCH" && (
              <div className="mt-3">
                {isArtist ? (
                  <form onSubmit={handleUploadSketch} className="space-y-4">
                    <p className="text-sm text-slate-700">
                      El pago inicial ya fue acreditado en tu cuenta. Subí el archivo de boceto para que el comprador lo revise (TuPuestito le aplicará marca de agua automática con Sharp).
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Subir archivo de boceto (PNG, JPG o WebP · máx. {limits.sketch} MB)
                        </label>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          required
                          onChange={(e) => {
                            const f = pickFile(e.target.files?.[0], limits.sketch, IMAGE_EXT, "una imagen PNG, JPG o WebP");
                            if (!f) e.target.value = "";
                            setSketchFile(f);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        />
                        {uploadError && (
                          <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-600">
                            {uploadError}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Modo de Marca de Agua en Previsualización
                        </label>
                        <select
                          value={sketchWatermarkMode}
                          onChange={(e) => setSketchWatermarkMode(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium"
                        >
                          <option value="AUTO_TEXT">Automática con mi @usuario diagonal</option>
                          <option value="AUTO_AVATAR">Automática con mi Foto de Perfil + @usuario</option>
                          <option value="MANUAL">Manual (ya le puse mi marca de agua)</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      ✏️ Enviar Boceto con Marca de Agua
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-slate-600">
                    🎨 ¡Pago inicial confirmado! El artista está dibujando tu boceto y te avisaremos apenas lo suba a esta sala.
                  </p>
                )}
              </div>
            )}

            {/* 4. SKETCH_REVIEW */}
            {order.status === "SKETCH_REVIEW" && (
              <div className="mt-3 space-y-4">
                {order.sketchWatermarkedUrl && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 p-2">
                    <img
                      src={resolveImageUrl(order.sketchWatermarkedUrl)}
                      alt="Boceto con marca de agua"
                      className="mx-auto max-h-96 rounded-xl object-contain"
                    />
                  </div>
                )}
                {isBuyer ? (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-700">
                      Revisá el boceto enviado por el artista. Podés aprobarlo para avanzar a la etapa final, o pedir ajustes.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleApproveSketch}
                        disabled={actionLoading}
                        className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                      >
                        ✅ Aprobar Boceto
                      </button>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        ¿Necesitás algún ajuste en el boceto? (te quedan {revisionsLeft} de {revisionsIncluded} revisiones)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={changeFeedback}
                          onChange={(e) => setChangeFeedback(e.target.value)}
                          placeholder="Describí los cambios de pose/expresión..."
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleRequestChanges}
                          disabled={actionLoading}
                          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                        >
                          🔄 Pedir Cambios
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    👀 Boceto enviado. Esperando que el comprador lo apruebe o solicite ajustes.
                  </p>
                )}
              </div>
            )}

            {/* 5. WAITING_PAYMENT_AFTER_SKETCH */}
            {order.status === "WAITING_PAYMENT_AFTER_SKETCH" && (
              <div className="mt-3">
                {isBuyer ? (
                  <div>
                    <p className="text-sm text-slate-700">
                      ¡Aprobaste el boceto! Según la modalidad acordada (<strong>50% seña + 50% al aprobar boceto</strong>), aboná el 50% restante para que el artista continúe con el render final.
                    </p>
                    <button
                      onClick={() => handleCheckout()}
                      disabled={actionLoading}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#009EE3] px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-[#0089C7] disabled:opacity-50"
                    >
                      💳 Pagar 50% Restante (${Number(order.finalAmount).toLocaleString("es-AR")} ARS)
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    ⏳ El comprador aprobó el boceto. Esperando acreditación del segundo 50% (${Number(order.finalAmount).toLocaleString("es-AR")} ARS) antes de pintar la entrega final.
                  </p>
                )}
              </div>
            )}

            {/* 6. WORKING_FINAL */}
            {order.status === "WORKING_FINAL" && (
              <div className="mt-3">
                {isArtist ? (
                  <form onSubmit={handleDeliverFinal} className="space-y-4">
                    <p className="text-sm text-slate-700">
                      Subí la obra final en alta resolución. Si son varios archivos (versiones, capas, formatos), comprimilos en un <strong>.zip</strong> o <strong>.rar</strong>. El comprador ve solo una vista previa con marca de agua hasta que el 100% del pago esté acreditado.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Archivo final: imagen, .zip, .rar o .psd (máx. {limits.finalDelivery} MB)
                        </label>
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp,.zip,.rar,.psd"
                          required
                          onChange={(e) => {
                            const f = pickFile(
                              e.target.files?.[0],
                              limits.finalDelivery,
                              DELIVERY_EXT,
                              "una imagen PNG, JPG o WebP, o un paquete .zip, .rar o .psd"
                            );
                            if (!f) e.target.value = "";
                            setFinalFile(f);
                            setFinalPreviewFile(null);
                          }}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        />
                        {finalFile && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            {finalFile.name} · {(finalFile.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        )}
                        {finalNeedsPreview && (
                          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                            <label className="mb-1 block text-xs font-semibold text-amber-900">
                              Imagen para la vista previa (máx. {limits.finalPreview} MB)
                            </label>
                            <p className="mb-1.5 text-[11px] text-amber-800">
                              Un paquete no se puede mostrar: elegí la imagen que verá el comprador con marca de agua.
                            </p>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              required
                              onChange={(e) => {
                                const f = pickFile(e.target.files?.[0], limits.finalPreview, IMAGE_EXT, "una imagen PNG, JPG o WebP");
                                if (!f) e.target.value = "";
                                setFinalPreviewFile(f);
                              }}
                              className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs"
                            />
                          </div>
                        )}
                        {uploadError && (
                          <p role="alert" className="mt-1.5 text-xs font-semibold text-rose-600">
                            {uploadError}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
                          Marca de Agua para la Vista Previa
                        </label>
                        <select
                          value={finalWatermarkMode}
                          onChange={(e) => setFinalWatermarkMode(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium"
                        >
                          <option value="AUTO_TEXT">Automática (@usuario en diagonal)</option>
                          <option value="AUTO_AVATAR">Automática (Avatar + @usuario)</option>
                          <option value="MANUAL">Manual</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      ✨ Subir Entrega Final
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-slate-600">
                    🎨 El artista está trabajando en el renderizado y acabado final de tu obra.
                  </p>
                )}
              </div>
            )}

            {/* 7. FINAL_PREVIEW_REVIEW */}
            {order.status === "FINAL_PREVIEW_REVIEW" && (
              <div className="mt-3 space-y-4">
                {order.previewWatermarkedUrl && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 p-2">
                    <img
                      src={resolveImageUrl(order.previewWatermarkedUrl)}
                      alt="Vista previa final con marca de agua"
                      className="mx-auto max-h-96 rounded-xl object-contain"
                    />
                    <p className="mt-1.5 text-center text-[11px] text-slate-300">
                      🔒 Vista previa protegida con marca de agua. El archivo original HD sin marca se desbloquea tras abonar el 50% restante.
                    </p>
                  </div>
                )}
                {isBuyer ? (
                  <div>
                    <p className="text-sm text-slate-700">
                      El artista subió la vista previa de la obra terminada. Aprobala para habilitar el pago del 50% final y desbloquear la descarga en alta resolución (HD).
                    </p>
                    <button
                      onClick={handleApproveFinalPreview}
                      disabled={actionLoading}
                      className="mt-3 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      ✅ Aprobar Vista Previa Final
                    </button>
                    {revisionsLeft > 0 && (
                      <div className="mt-3 flex gap-2">
                        <input
                          type="text"
                          value={changeFeedback}
                          onChange={(e) => setChangeFeedback(e.target.value)}
                          placeholder={`Pedir ajustes (te quedan ${revisionsLeft})`}
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                        />
                        <button
                          type="button"
                          onClick={handleRequestChanges}
                          disabled={actionLoading}
                          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                        >
                          🔄 Pedir Cambios
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    ⏳ Vista previa final enviada con marca de agua. Esperando aprobación y pago del saldo final por parte del comprador.
                  </p>
                )}
              </div>
            )}

            {/* 8. WAITING_PAYMENT_BEFORE_HD */}
            {order.status === "WAITING_PAYMENT_BEFORE_HD" && (
              <div className="mt-3">
                {isBuyer ? (
                  <div>
                    <p className="text-sm text-slate-700">
                      ¡Vista previa aprobada! Aboná el 50% restante para destrabar inmediatamente el botón de descarga del archivo original HD sin marca de agua.
                    </p>
                    <button
                      onClick={() => handleCheckout()}
                      disabled={actionLoading}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#009EE3] px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-[#0089C7] disabled:opacity-50"
                    >
                      💳 Pagar 50% Final (${Number(order.finalAmount).toLocaleString("es-AR")} ARS) y Desbloquear HD
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    ⏳ Vista previa aprobada. Esperando que el comprador abone el 50% final para liberar el archivo HD.
                  </p>
                )}
              </div>
            )}

            {(order.status === "REJECTED" || order.status === "EXPIRED" || order.status === "CANCELLED") && (
              <p className="mt-3 text-sm text-slate-600">
                {order.status === "REJECTED" && "El artista rechazó esta solicitud. No se realizó ningún cobro."}
                {order.status === "EXPIRED" && "El pedido venció porque no se registró el pago inicial a tiempo. Si todavía te interesa, podés enviar una nueva solicitud."}
                {order.status === "CANCELLED" && "Este pedido fue cancelado antes de cualquier pago."}
              </p>
            )}

            {/* 9. COMPLETED_HD_UNLOCKED */}
            {order.status === "COMPLETED_HD_UNLOCKED" && (
              <div className="mt-3 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div>
                    <p className="text-sm font-bold text-emerald-950">
                      🔓 ¡Archivo Original HD Desbloqueado!
                    </p>
                    <p className="text-xs text-emerald-800">
                      El 100% del pago fue verificado. Ya podés abrir y guardar tu obra en máxima calidad sin marcas de agua.
                    </p>
                  </div>
                  {order.hasFinalHd && (
                    <button
                      type="button"
                      onClick={handleDownloadHd}
                      disabled={actionLoading}
                      className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      ⬇️ Descargar {/.(zip|rar)$/i.test(order.finalHdFilename ?? "") ? "entrega completa (" + order.finalHdFilename.split(".").pop().toUpperCase() + ")" : "Original HD"}
                    </button>
                  )}
                </div>

                {/* Review Form for Buyer */}
                {isBuyer && !review && (
                  <form onSubmit={handleSubmitReview} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-bold text-slate-900">⭐ Dejale una reseña a {artist?.displayName}</h3>
                    <div className="mt-2 flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          className={`text-2xl ${star <= rating ? "text-amber-400" : "text-slate-200"}`}
                        >
                          ★
                        </button>
                      ))}
                      <span className="ml-2 text-xs font-semibold text-slate-600">{rating} de 5 estrellas</span>
                    </div>
                    <textarea
                      rows={2}
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Contá cómo fue tu experiencia trabajando con este artista..."
                      className="mt-2 w-full rounded-xl border border-slate-200 p-2.5 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="mt-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700"
                    >
                      Publicar Reseña
                    </button>
                  </form>
                )}

                {review && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                    <p className="text-xs font-bold text-amber-900">
                      {"★".repeat(review.rating)} Reseña del comprador
                    </p>
                    <p className="mt-1 text-sm text-slate-700">“{review.comment}”</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* MESSAGE THREAD / TIMELINE */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">💬 Hilo del Pedido y Entregas</h2>
            <div className="mt-4 max-h-[480px] space-y-4 overflow-y-auto pr-2">
              {messages.map((msg: any) => {
                const isSystem = msg.type === "SYSTEM_EVENT";
                const isMine = msg.senderId === payload?.currentUserId;
                const attachments: string[] = msg.attachments || [];
                return (
                  <div
                    key={msg.id}
                    className={`rounded-2xl p-4 ${
                      isSystem
                        ? "border border-indigo-100 bg-indigo-50/60 text-indigo-950"
                        : isMine
                        ? "ml-8 border border-purple-200 bg-purple-50/50 text-slate-900"
                        : "mr-8 border border-slate-200 bg-slate-50 text-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-bold text-slate-700">
                        {isSystem ? "🤖 Sistema TuPuestito" : msg.senderName || "Participante"}
                      </span>
                      <span>{new Date(msg.createdAt).toLocaleString("es-AR")}</span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-sm">{msg.content}</p>
                    {attachments.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {attachments.map((att, idx) => (
                          <div key={idx} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900 p-2">
                            <img
                              src={resolveImageUrl(att)}
                              alt="Adjunto del pedido"
                              loading="lazy"
                              className="max-h-72 rounded-lg object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!["CANCELLED", "REJECTED", "EXPIRED"].includes(order.status) && (
              <form onSubmit={handleSendMessage} className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Escribí un mensaje o consulta en el hilo del pedido..."
                  maxLength={4000}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-purple-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Enviar
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right Column: Brief, References, Board Link, Milestones & ToS Snapshot */}
        <div className="space-y-6">
          {/* Brief & References */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              📋 Brief del Pedido
            </h3>
            <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{order.buyerBrief}</p>

            {order.externalBoardUrl && (
              <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-3.5">
                <p className="text-xs font-bold text-indigo-950">📌 Pizarra Externa de Referencias</p>
                <a
                  href={order.externalBoardUrl}
                  target="_blank"
                  rel="noreferrer nofollow"
                  className="mt-1 block truncate text-xs font-semibold text-indigo-600 underline hover:text-indigo-800"
                >
                  {order.externalBoardUrl}
                </a>
              </div>
            )}

            {parsedRefs.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-xs font-bold text-slate-700">
                  🖼️ Imágenes de referencia ({parsedRefs.length}/10):
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {parsedRefs.map((imgUrl: string, i: number) => (
                    <a
                      key={i}
                      href={resolveImageUrl(imgUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                    >
                      <img
                        src={resolveImageUrl(imgUrl)}
                        alt={`Referencia ${i + 1}`}
                        loading="lazy"
                        className="h-20 w-full object-cover transition hover:scale-105"
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Payment Milestones History */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              💸 Hitos de Pago (Split 1:1)
            </h3>
            {payments.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">Aún no se registraron pagos en este pedido.</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {payments.map((m: any) => (
                  <div key={m.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span>
                        {m.stage === "DEPOSIT_50" && "1er 50% (Seña Inicial)"}
                        {m.stage === "FINAL_50" && "2do 50% (Saldo Final)"}
                        {m.stage === "FULL_100" && "Pago Único 100%"}
                      </span>
                      <span>${Number(m.grossAmount).toLocaleString("es-AR")} ARS</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        Neto Artista: ${(Number(m.grossAmount) - Number(m.marketplaceFee)).toLocaleString("es-AR")} • Fee 5%: $
                        {Number(m.marketplaceFee).toLocaleString("es-AR")}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-bold ${
                          m.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {({ APPROVED: "ACREDITADO", PENDING: "PENDIENTE", REJECTED: "RECHAZADO", REFUNDED: "REEMBOLSADO", CHARGED_BACK: "CONTRACARGO" } as Record<string, string>)[m.status] ?? m.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Immutable Terms Snapshot */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              📜 Respaldo Inmutable de Términos (ToS Snapshot)
            </h3>
            <p className="mt-2 whitespace-pre-line text-xs text-slate-600">{order.termsSnapshot}</p>
            <p className="mt-3 text-[11px] text-slate-400">
              Aceptado por el comprador el {new Date(order.termsAcceptedAt).toLocaleString("es-AR")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

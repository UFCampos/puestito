"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import {
  ShieldCheck,
  CreditCard,
  Send,
  Upload,
  CheckCircle,
  Clock,
  Download,
  AlertCircle,
  ExternalLink,
  Star
} from "lucide-react";

export default function OrderRoomPage({ params }: { params: Promise<{ orderId: string }> }) {
  const resolvedParams = use(params);
  const { orderId } = resolvedParams;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [messageInput, setMessageInput] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadOrder = () => {
    fetchApi(`/orders/${orderId}`)
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    try {
      await fetchApi(`/orders/${orderId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: messageInput.trim() })
      });
      setMessageInput("");
      loadOrder();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAcceptOrder = async () => {
    try {
      await fetchApi(`/orders/${orderId}/accept`, { method: "POST" });
      loadOrder();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCheckout = async (stage: string) => {
    try {
      const res = await fetchApi(`/orders/${orderId}/checkout`, {
        method: "POST",
        body: JSON.stringify({ stage })
      });

      // Redirige al checkout de Mercado Pago (o al sandbox mock)
      window.location.href = res.initPoint;
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleApproveSketch = async () => {
    if (!confirm("¿Aprobás este boceto? Una vez aprobado, el artista avanzará con la versión final.")) return;
    try {
      await fetchApi(`/orders/${orderId}/approve-sketch`, { method: "POST" });
      loadOrder();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUploadSketch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileToUpload) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);

      await fetchApi(`/orders/${orderId}/sketch`, {
        method: "POST",
        body: formData
      });
      setFileToUpload(null);
      loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileToUpload) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);

      await fetchApi(`/orders/${orderId}/deliver-final`, {
        method: "POST",
        body: formData
      });
      setFileToUpload(null);
      loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      await fetchApi(`/orders/${orderId}/review`, {
        method: "POST",
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment })
      });
      loadOrder();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) return <div className="text-center py-24 text-neutral-400">Cargando sala del pedido... ✨</div>;
  if (!data?.order) return <div className="text-center py-24">Pedido no encontrado o sin permisos.</div>;

  const { order, service, buyer, artist, isBuyer, isArtist, messages, review } = data;
  const references = order.referenceImages ? JSON.parse(order.referenceImages) : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Cabecera del Pedido */}
      <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-neutral-900">Pedido #{order.orderNumber}</h1>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              {order.status}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Servicio: <strong>{service?.title}</strong> • Total: <strong>${order.totalAmount.toLocaleString("es-AR")} ARS</strong>
          </p>
        </div>

        <div className="text-right flex items-center gap-4">
          <div className="text-xs text-neutral-500">
            <div>Comprador: <strong>{buyer.displayName}</strong></div>
            <div>Artista: <strong>{artist.displayName}</strong></div>
          </div>
        </div>
      </div>

      {/* ACCIONES DE ESTADO Y COBRO */}
      <div className="bg-purple-50 border border-purple-200 p-6 rounded-2xl shadow-sm">
        <h3 className="font-bold text-neutral-900 mb-2 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-600" /> Próximo Paso en este Pedido
        </h3>

        {/* 1. Solicitud inicial esperando artista */}
        {order.status === "REQUESTED" && (
          <div>
            <p className="text-sm text-neutral-600 mb-4">
              {isArtist
                ? "El comprador te envió esta solicitud. Revisá las referencias y aceptala para habilitar el pago de la seña."
                : "Esperando que el artista revise tu descripción y acepte el pedido."}
            </p>
            {isArtist && (
              <button
                onClick={handleAcceptOrder}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow transition"
              >
                ✓ Aceptar Pedido y Habilitar Seña
              </button>
            )}
          </div>
        )}

        {/* 2. Esperando pago de seña inicial */}
        {order.status === "ACCEPTED_WAITING_DEPOSIT" && (
          <div>
            <p className="text-sm text-neutral-600 mb-4">
              {isBuyer
                ? `El artista aceptó tu pedido. Aboná la seña de $${order.depositAmount.toLocaleString("es-AR")} ARS vía Mercado Pago para comenzar.`
                : `Esperando que el comprador abone la seña inicial de $${order.depositAmount.toLocaleString("es-AR")} ARS.`}
            </p>
            {isBuyer && (
              <button
                onClick={() => handleCheckout("DEPOSIT_50")}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm px-6 py-3 rounded-xl shadow flex items-center gap-2 transition"
              >
                <CreditCard className="w-4 h-4" /> Pagar Seña con Mercado Pago (${order.depositAmount.toLocaleString("es-AR")} ARS)
              </button>
            )}
          </div>
        )}

        {/* 3. En progreso de boceto */}
        {order.status === "IN_PROGRESS_SKETCH" && (
          <div>
            <p className="text-sm text-neutral-600 mb-4">
              {isArtist
                ? "Seña acreditada. Cuando tengas listo el boceto, subilo acá para que TuPuestito le estampe la marca de agua y el cliente lo revise."
                : "El artista está dibujando el boceto inicial de tu personaje."}
            </p>
            {isArtist && (
              <form onSubmit={handleUploadSketch} className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  required
                  onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                  className="text-xs text-neutral-600"
                />
                <button
                  type="submit"
                  disabled={uploading}
                  className="bg-neutral-900 text-white text-xs font-bold px-4 py-2 rounded-lg"
                >
                  {uploading ? "Procesando..." : "Subir Boceto con Marca de Agua"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* 4. Revisión de boceto */}
        {order.status === "SKETCH_REVIEW" && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              {isBuyer
                ? "El artista subió una propuesta de boceto. Si te gusta, tocala para aprobarla. Si necesitás cambios, escribíselos en el chat."
                : "Boceto enviado. Esperando que el comprador lo apruebe o pida ajustes en el chat."}
            </p>
            {order.sketchWatermarkedUrl && (
              <div className="max-w-md border border-neutral-300 rounded-xl overflow-hidden shadow-sm">
                <img
                  src={order.sketchWatermarkedUrl.startsWith("http") ? order.sketchWatermarkedUrl : `http://localhost:4000${order.sketchWatermarkedUrl}`}
                  alt="Boceto con marca de agua"
                  className="w-full h-auto bg-neutral-100"
                />
              </div>
            )}
            {isBuyer && (
              <button
                onClick={handleApproveSketch}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow transition"
              >
                ✓ Aprobar Boceto
              </button>
            )}
          </div>
        )}

        {/* 5. Esperando pago 2 (Modalidad SPLIT_ON_SKETCH) */}
        {order.status === "WAITING_PAYMENT_AFTER_SKETCH" && (
          <div>
            <p className="text-sm text-neutral-600 mb-4">
              {isBuyer
                ? `Boceto aprobado. Aboná el 50% final de $${order.finalAmount.toLocaleString("es-AR")} ARS para que el artista termine el arte final.`
                : "Boceto aprobado. Esperando el 50% final del comprador para finalizar la obra."}
            </p>
            {isBuyer && (
              <button
                onClick={() => handleCheckout("FINAL_50")}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm px-6 py-3 rounded-xl shadow flex items-center gap-2 transition"
              >
                <CreditCard className="w-4 h-4" /> Pagar Saldo Final (${order.finalAmount.toLocaleString("es-AR")} ARS)
              </button>
            )}
          </div>
        )}

        {/* 6. Trabajando en la entrega final */}
        {order.status === "WORKING_FINAL" && (
          <div>
            <p className="text-sm text-neutral-600 mb-4">
              {isArtist
                ? "El artista está terminando la versión final a color. Subí el archivo terminado cuando esté listo."
                : "El artista está finalizando tu obra a todo color y detalles."}
            </p>
            {isArtist && (
              <form onSubmit={handleUploadFinal} className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  required
                  onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                  className="text-xs text-neutral-600"
                />
                <button
                  type="submit"
                  disabled={uploading}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-lg"
                >
                  {uploading ? "Procesando..." : "Subir Entrega Final"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* 7. Vista previa final (Modalidad SPLIT_ON_FINAL_PREVIEW) */}
        {order.status === "FINAL_PREVIEW_REVIEW" && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              {isBuyer
                ? "La obra está lista con marca de agua. Revisala y aboná el saldo final de 50% para desbloquear la descarga en alta calidad sin marcas."
                : "Muestra final enviada. Esperando que el comprador abone el saldo restante para descargar el original."}
            </p>
            {order.previewWatermarkedUrl && (
              <div className="max-w-md border border-neutral-300 rounded-xl overflow-hidden shadow-sm">
                <img
                  src={order.previewWatermarkedUrl.startsWith("http") ? order.previewWatermarkedUrl : `http://localhost:4000${order.previewWatermarkedUrl}`}
                  alt="Vista previa final con marca de agua"
                  className="w-full h-auto bg-neutral-100"
                />
              </div>
            )}
            {isBuyer && (
              <button
                onClick={() => handleCheckout("FINAL_50")}
                className="bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm px-6 py-3 rounded-xl shadow flex items-center gap-2 transition"
              >
                <CreditCard className="w-4 h-4" /> Abonar 50% y Desbloquear HD Original (${order.finalAmount.toLocaleString("es-AR")} ARS)
              </button>
            )}
          </div>
        )}

        {/* 8. Completado y Archivo HD desbloqueado */}
        {order.status === "COMPLETED_HD_UNLOCKED" && (
          <div className="p-4 bg-emerald-100 rounded-xl border border-emerald-200 text-emerald-900 space-y-3">
            <div className="flex items-center gap-2 font-bold text-base">
              <CheckCircle className="w-5 h-5 text-emerald-600" /> ¡Comisión completada con éxito!
            </div>
            <p className="text-xs">El pago está 100% aprobado y los archivos en alta definición están listos.</p>
            {order.finalHdPrivateKey && (
              <a
                href={order.finalHdPrivateKey.startsWith("http") ? order.finalHdPrivateKey : `http://localhost:4000${order.finalHdPrivateKey}`}
                download
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-4 py-2.5 rounded-lg shadow"
              >
                <Download className="w-4 h-4" /> Descargar Archivo HD Original
              </a>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Chat / Hilo de Mensajes (2 columnas) */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-neutral-200 p-6 flex flex-col h-[520px]">
          <h3 className="font-bold text-sm text-neutral-900 border-b border-neutral-100 pb-3 mb-4">
            Hilo de Mensajes y Entregas
          </h3>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {messages.map((m: any) => {
              const isSys = m.type === "SYSTEM_EVENT";
              return (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl text-xs ${
                    isSys
                      ? "bg-neutral-100 text-neutral-600 text-center font-medium my-2"
                      : "bg-purple-50 text-neutral-800 border border-purple-100"
                  }`}
                >
                  {!isSys && (
                    <div className="flex items-center justify-between font-bold text-[11px] text-purple-700 mb-1">
                      <span>{m.senderName}</span>
                      <span className="text-[10px] text-neutral-400 font-normal">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                  <p className="whitespace-pre-line">{m.content}</p>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSendMessage} className="pt-3 border-t border-neutral-100 flex gap-2">
            <input
              type="text"
              placeholder="Escribí un mensaje..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              className="flex-1 p-2.5 text-xs rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700 text-white p-2.5 rounded-xl transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Detalles del Pedido y Referencias (1 columna) */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-4 text-xs">
            <h4 className="font-bold text-sm text-neutral-900">Descripción del Comprador</h4>
            <p className="text-neutral-600 whitespace-pre-line leading-relaxed">{order.buyerBrief}</p>

            {order.externalBoardUrl && (
              <div className="pt-2">
                <span className="font-bold block text-neutral-700 mb-1">Tablero Excalidraw / Externo:</span>
                <a
                  href={order.externalBoardUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-purple-600 font-bold underline flex items-center gap-1 break-all"
                >
                  Abrir lienzo de referencias <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            )}

            {references.length > 0 && (
              <div className="pt-2">
                <span className="font-bold block text-neutral-700 mb-2">Imágenes de Referencia ({references.length}):</span>
                <div className="grid grid-cols-2 gap-2">
                  {references.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="Ref" className="w-full h-16 object-cover rounded-lg border border-neutral-200" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Formulario de Reseña (Solo si está completado y es comprador) */}
          {order.status === "COMPLETED_HD_UNLOCKED" && isBuyer && !review && (
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-3">
              <h4 className="font-bold text-sm text-neutral-900">Dejá tu reseña</h4>
              <p className="text-xs text-neutral-500">¿Cómo fue tu experiencia con {artist.displayName}?</p>
              
              <div className="flex gap-2 text-amber-400 cursor-pointer">
                {[1, 2, 3, 4, 5].map((num) => (
                  <Star
                    key={num}
                    onClick={() => setReviewRating(num)}
                    className={`w-5 h-5 ${num <= reviewRating ? "fill-current" : "text-neutral-300"}`}
                  />
                ))}
              </div>

              <textarea
                rows={3}
                placeholder="Escribí un comentario..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />

              <button
                onClick={handleSubmitReview}
                disabled={submittingReview}
                className="w-full bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs py-2.5 rounded-xl transition"
              >
                {submittingReview ? "Enviando..." : "Publicar Calificación"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


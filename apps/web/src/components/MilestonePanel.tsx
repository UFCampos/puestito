"use client";

import { useState } from "react";
import { apiFetch, API_URL, fileTooLarge, type AppConfig } from "@/lib/api";

export interface OrderMilestoneView {
  index: number;
  title: string;
  description: string;
  percent: number;
  days: number;
  amount: number;
  paid: boolean;
  state: "UPCOMING" | "WAITING_PAYMENT" | "IN_PROGRESS" | "IN_REVIEW" | "APPROVED";
}

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const DELIVERY_EXT = /\.(png|jpe?g|webp|zip|rar|psd)$/i;
const money = (n: number) => `$${Number(n).toLocaleString("es-AR")}`;

const STATE_BADGE: Record<OrderMilestoneView["state"], { text: string; className: string }> = {
  UPCOMING: { text: "Pendiente", className: "bg-slate-100 text-slate-500" },
  WAITING_PAYMENT: { text: "Esperando pago", className: "bg-pink-100 text-pink-800" },
  IN_PROGRESS: { text: "En proceso", className: "bg-blue-100 text-blue-800" },
  IN_REVIEW: { text: "En revisión", className: "bg-purple-100 text-purple-800" },
  APPROVED: { text: "Aprobada", className: "bg-emerald-100 text-emerald-800" }
};

/** Línea de tiempo de las etapas del pedido (reemplaza al stepper en el plan por etapas) */
export function MilestoneTimeline({ milestones }: { milestones: OrderMilestoneView[] }) {
  return (
    <ol className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {milestones.map((m) => {
        const badge = STATE_BADGE[m.state];
        const current = m.state === "WAITING_PAYMENT" || m.state === "IN_PROGRESS" || m.state === "IN_REVIEW";
        return (
          <li
            key={m.index}
            aria-current={current ? "step" : undefined}
            className={`rounded-2xl border p-3 ${
              current
                ? "border-purple-600 bg-purple-50 ring-2 ring-purple-500/20"
                : m.state === "APPROVED"
                ? "border-emerald-200 bg-emerald-50/60"
                : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Etapa {m.index + 1}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.text}</span>
            </div>
            <p className="mt-1 text-sm font-bold leading-tight text-slate-900">{m.title}</p>
            {m.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{m.description}</p>}
            <p className="mt-1.5 text-xs font-semibold text-slate-700">
              {money(m.amount)} · {m.percent}% · {m.days} días {m.paid && <span className="text-emerald-700">· pagada</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

interface Props {
  orderId: string;
  status: string;
  milestones: OrderMilestoneView[];
  currentMilestone: number;
  isArtist: boolean;
  isBuyer: boolean;
  revisionsLeft: number;
  revisionsIncluded: number;
  limits: AppConfig["uploadLimitsMb"];
  busy: boolean;
  setBusy: (v: boolean) => void;
  reload: () => Promise<void>;
  onCheckout: () => void;
}

/** Acciones del plan por etapas: pagar la etapa, entregarla, aprobarla o pedir ajustes */
export function MilestoneActions(props: Props) {
  const { orderId, status, milestones, currentMilestone, isArtist, isBuyer, limits, busy, setBusy, reload } = props;
  const [file, setFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [watermarkMode, setWatermarkMode] = useState("AUTO_TEXT");
  const [feedback, setFeedback] = useState("");
  const [uploadError, setUploadError] = useState("");

  const milestone = milestones[currentMilestone];
  if (!milestone) return null;
  const total = milestones.length;
  const isLast = currentMilestone === total - 1;
  const label = `etapa ${currentMilestone + 1} de ${total}: “${milestone.title}”`;
  const needsPreview = Boolean(isLast && file && !IMAGE_EXT.test(file.name));

  function pick(f: File | undefined, maxMb: number, allowed: RegExp, allowedText: string): File | null {
    setUploadError("");
    if (!f) return null;
    if (!allowed.test(f.name)) {
      setUploadError(`"${f.name}" no es un formato admitido. Subí ${allowedText}.`);
      return null;
    }
    const tooLarge = fileTooLarge(f, maxMb);
    if (tooLarge) {
      setUploadError(tooLarge);
      return null;
    }
    return f;
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeliver(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (needsPreview && !previewFile) {
      setUploadError("Como el archivo final no es una imagen, subí también una imagen para la vista previa.");
      return;
    }
    await run(async () => {
      const formData = new FormData();
      formData.append("watermarkMode", watermarkMode);
      formData.append("file", file);
      if (previewFile) formData.append("preview", previewFile);
      const res = await fetch(`${API_URL}/api/orders/${orderId}/milestones/deliver`, {
        method: "POST",
        credentials: "include",
        body: formData
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo subir la entrega");
      setFile(null);
      setPreviewFile(null);
    });
  }

  if (status === "MILESTONE_WAITING_PAYMENT") {
    return (
      <div className="mt-3">
        {isBuyer ? (
          <>
            <p className="text-sm text-slate-700">
              Aprobaste la etapa anterior. Para que el artista empiece la {label}, aboná esa etapa.
            </p>
            <button
              onClick={props.onCheckout}
              disabled={busy}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#009EE3] px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-[#0089C7] disabled:opacity-50"
            >
              💳 Pagar etapa {currentMilestone + 1} ({money(milestone.amount)} ARS)
            </button>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            ⏳ Esperando que el comprador abone la {label} ({money(milestone.amount)} ARS). No la empieces hasta que
            el pago esté acreditado.
          </p>
        )}
      </div>
    );
  }

  if (status === "MILESTONE_IN_PROGRESS") {
    if (!isArtist) {
      return (
        <p className="mt-3 text-sm text-slate-600">
          🎨 La {label} está paga y el artista está trabajando en ella (plazo estimado: {milestone.days} días).
        </p>
      );
    }
    return (
      <form onSubmit={handleDeliver} className="mt-3 space-y-4">
        <p className="text-sm text-slate-700">
          La {label} ya está paga.{" "}
          {isLast
            ? "Es la última: subí el archivo final. Si son varios archivos, comprimilos en un .zip o .rar. El comprador ve una vista previa con marca de agua y, al aprobarla, descarga el original."
            : "Subí una imagen del avance para que el comprador la revise (se muestra con marca de agua)."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              {isLast
                ? `Archivo final: imagen, .zip, .rar o .psd (máx. ${limits.finalDelivery} MB)`
                : `Imagen del avance: PNG, JPG o WebP (máx. ${limits.sketch} MB)`}
            </label>
            <input
              type="file"
              required
              accept={isLast ? ".png,.jpg,.jpeg,.webp,.zip,.rar,.psd" : "image/png,image/jpeg,image/webp"}
              onChange={(e) => {
                const f = isLast
                  ? pick(e.target.files?.[0], limits.finalDelivery, DELIVERY_EXT, "una imagen PNG, JPG o WebP, o un paquete .zip, .rar o .psd")
                  : pick(e.target.files?.[0], limits.sketch, IMAGE_EXT, "una imagen PNG, JPG o WebP");
                if (!f) e.target.value = "";
                setFile(f);
                setPreviewFile(null);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            />
            {file && (
              <p className="mt-1 text-[11px] text-slate-500">
                {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            )}
            {needsPreview && (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                <label className="mb-1 block text-xs font-semibold text-amber-900">
                  Imagen para la vista previa (máx. {limits.finalPreview} MB)
                </label>
                <input
                  type="file"
                  required
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const f = pick(e.target.files?.[0], limits.finalPreview, IMAGE_EXT, "una imagen PNG, JPG o WebP");
                    if (!f) e.target.value = "";
                    setPreviewFile(f);
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
            <label className="mb-1 block text-xs font-semibold text-slate-700">Marca de agua de la vista previa</label>
            <select
              value={watermarkMode}
              onChange={(e) => setWatermarkMode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium"
            >
              <option value="AUTO_TEXT">Automática (@usuario en diagonal)</option>
              <option value="AUTO_AVATAR">Automática (avatar + @usuario)</option>
              <option value="MANUAL">Manual (ya la puse yo)</option>
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {busy ? "Subiendo..." : isLast ? "✨ Entregar etapa final" : `📦 Entregar etapa ${currentMilestone + 1}`}
        </button>
      </form>
    );
  }

  if (status === "MILESTONE_REVIEW") {
    if (!isBuyer) {
      return (
        <p className="mt-3 text-sm text-slate-600">
          👀 Entregaste la {label}. Esperando que el comprador la apruebe o pida ajustes.
        </p>
      );
    }
    const next = milestones[currentMilestone + 1];
    return (
      <div className="mt-3 space-y-4">
        <p className="text-sm text-slate-700">
          El artista entregó la {label}. La encontrás en el hilo del pedido, más abajo.{" "}
          {isLast
            ? "Al aprobarla se desbloquea la descarga del archivo original."
            : `Al aprobarla vas a poder abonar la etapa ${currentMilestone + 2} (“${next?.title}”, ${money(next?.amount ?? 0)} ARS).`}
        </p>
        <button
          onClick={() => run(() => apiFetch(`/api/orders/${orderId}/milestones/approve`, { method: "POST" }))}
          disabled={busy}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          ✅ Aprobar etapa {currentMilestone + 1}
        </button>
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <label htmlFor="milestone-feedback" className="mb-1 block text-xs font-semibold text-slate-700">
            ¿Necesitás ajustes? (te quedan {props.revisionsLeft} de {props.revisionsIncluded} revisiones)
          </label>
          <div className="flex gap-2">
            <input
              id="milestone-feedback"
              type="text"
              value={feedback}
              disabled={props.revisionsLeft === 0}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describí qué cambiar..."
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <button
              type="button"
              disabled={busy || props.revisionsLeft === 0 || feedback.trim().length < 3}
              onClick={() =>
                run(async () => {
                  await apiFetch(`/api/orders/${orderId}/request-changes`, {
                    method: "POST",
                    body: JSON.stringify({ feedback: feedback.trim() })
                  });
                  setFeedback("");
                })
              }
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
            >
              🔄 Pedir cambios
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

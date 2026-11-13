"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError, REPORT_REASONS, apiFetch } from "@/lib/api";

export type ReportTarget = "ARTIST" | "PORTFOLIO_ITEM" | "SERVICE" | "ORDER" | "REVIEW";

interface Props {
  targetType: ReportTarget;
  targetId: string;
  /** Texto del botón (por defecto "Denunciar") */
  label?: string;
  /** Qué se está denunciando, para el título del diálogo: "esta obra", "este puestito"... */
  subject?: string;
  className?: string;
}

/**
 * Botón "Denunciar" con su diálogo. La denuncia entra a la cola de moderación (/admin).
 * Requiere sesión: si no la hay, lleva a iniciar sesión y vuelve a esta página.
 */
export function ReportButton({ targetType, targetId, label = "Denunciar", subject = "este contenido", className }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function close() {
    setOpen(false);
    setError("");
    setDone(false);
    setReason("");
    setDetails("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) {
      setError("Elegí un motivo.");
      return;
    }
    setSending(true);
    setError("");
    try {
      await apiFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({ targetType, targetId, reason, details: details.trim() })
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push(`/login?next=${encodeURIComponent(pathname || "/")}`);
        return;
      }
      setError(err instanceof Error ? err.message : "No se pudo enviar la denuncia");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "text-xs font-semibold text-slate-500 underline-offset-2 hover:text-rose-600 hover:underline"}
      >
        🚩 {label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Denunciar ${subject}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-left shadow-xl">
            {done ? (
              <>
                <h2 className="text-lg font-extrabold text-slate-900">Recibimos tu denuncia</h2>
                <p className="mt-2 text-sm text-slate-600">
                  El equipo de moderación la va a revisar. Gracias por ayudar a cuidar la comunidad.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-5 w-full rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white hover:bg-purple-700"
                >
                  Cerrar
                </button>
              </>
            ) : (
              <form onSubmit={submit}>
                <h2 className="text-lg font-extrabold text-slate-900">Denunciar {subject}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  La denuncia es confidencial: la persona denunciada no ve quién la hizo.
                </p>

                <label htmlFor={`report-reason-${targetId}`} className="mt-4 block text-xs font-bold text-slate-700">
                  Motivo
                </label>
                <select
                  id={`report-reason-${targetId}`}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Elegí un motivo…</option>
                  {REPORT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>

                <label htmlFor={`report-details-${targetId}`} className="mt-3 block text-xs font-bold text-slate-700">
                  Contanos qué pasa (opcional)
                </label>
                <textarea
                  id={`report-details-${targetId}`}
                  rows={3}
                  maxLength={2000}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Links, contexto o cualquier dato que ayude a revisarlo"
                  className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm"
                />

                {error && (
                  <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
                    {error}
                  </p>
                )}

                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {sending ? "Enviando…" : "Enviar denuncia"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

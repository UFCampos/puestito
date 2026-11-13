"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, apiFetch } from "@/lib/api";

// ─────────────────────────────────────────────────────────────
// Datos
// ─────────────────────────────────────────────────────────────
export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Ocurrió un error inesperado");

/**
 * Carga un endpoint del panel. Al cambiar de endpoint (otro filtro) vacía la lista; al recargar
 * el mismo (después de una acción) conserva lo que había para que la pantalla no parpadee.
 */
export function useAdminData<T>(endpoint: string) {
  const [state, setState] = useState<{ data: T | null; error: string; status: number | null; loading: boolean }>({
    data: null,
    error: "",
    status: null,
    loading: true
  });
  const seq = useRef(0);

  const load = useCallback(
    async (keepData: boolean) => {
      const id = ++seq.current;
      setState((s) => ({ ...s, loading: true, error: "", data: keepData ? s.data : null }));
      try {
        const data = await apiFetch<T>(endpoint);
        // Si mientras tanto se pidió otra cosa, esta respuesta ya no interesa
        if (id === seq.current) setState({ data, error: "", status: 200, loading: false });
      } catch (err) {
        if (id === seq.current) {
          setState((s) => ({
            ...s,
            loading: false,
            error: errorMessage(err),
            status: err instanceof ApiError ? err.status : null
          }));
        }
      }
    },
    [endpoint]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const reload = useCallback(() => load(true), [load]);
  return { ...state, reload };
}

// ─────────────────────────────────────────────────────────────
// Fechas y textos
// ─────────────────────────────────────────────────────────────
/** Acepta fechas ISO y también el formato de texto de Postgres ("2026-11-13 09:20:16.986127+00") */
export function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  let s = value.trim().replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
  if (/[+-]\d{2}$/.test(s)) s += ":00";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "hace 3 días", "hace 5 h", "en 2 días" */
export function timeAgo(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const minutes = Math.round(Math.abs(diff) / 60_000);
  let text: string;
  if (minutes < 1) return "recién";
  if (minutes < 60) text = `${minutes} min`;
  else if (minutes < 60 * 48) text = `${Math.round(minutes / 60)} h`;
  else text = `${Math.round(minutes / 1440)} días`;
  return diff >= 0 ? `hace ${text}` : `en ${text}`;
}

export const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ─────────────────────────────────────────────────────────────
// Piezas de interfaz
// ─────────────────────────────────────────────────────────────
const BTN_BASE = "rounded-xl px-4 py-2 text-xs transition disabled:cursor-not-allowed disabled:opacity-50";
export const BTN = {
  primary: `${BTN_BASE} bg-purple-600 font-bold text-white shadow-sm hover:bg-purple-700`,
  secondary: `${BTN_BASE} border border-slate-200 bg-white font-semibold text-slate-700 hover:bg-slate-50`,
  success: `${BTN_BASE} bg-emerald-600 font-bold text-white shadow-sm hover:bg-emerald-700`,
  danger: `${BTN_BASE} bg-rose-600 font-bold text-white shadow-sm hover:bg-rose-700`,
  dangerOutline: `${BTN_BASE} border border-rose-200 bg-white font-semibold text-rose-700 hover:bg-rose-50`,
  link: "text-xs font-bold text-purple-700 hover:underline"
} as const;

export const INPUT =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-none";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>{children}</div>;
}

const BADGE_TONES = {
  slate: "bg-slate-100 text-slate-700",
  purple: "bg-purple-100 text-purple-800",
  indigo: "bg-indigo-50 text-indigo-700",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  rose: "bg-rose-100 text-rose-800",
  sky: "bg-sky-100 text-sky-800"
} as const;
export type Tone = keyof typeof BADGE_TONES;

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Color del estado de un pedido */
export function statusTone(status: string): Tone {
  if (status === "DISPUTED") return "rose";
  if (status === "COMPLETED_HD_UNLOCKED") return "emerald";
  if (status === "CANCELLED" || status === "REJECTED" || status === "EXPIRED") return "slate";
  if (status === "REQUESTED" || status.includes("WAITING")) return "amber";
  return "indigo";
}

/** Selector de una opción entre pocas (abiertos / resueltos, filtros, etc.) */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            value === opt.value
              ? "bg-purple-600 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div role="status" className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
      {label}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      <span className="font-semibold">⚠️ {message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-xs font-bold text-rose-800 underline">
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Error de una acción, dentro de la tarjeta que la disparó */
export function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 text-xs font-semibold text-rose-600">
      ⚠️ {message}
    </p>
  );
}

/** Encabezado de una pestaña: título, explicación y controles a la derecha */
export function TabHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 max-w-2xl text-xs text-slate-600">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Dato con su etiqueta, para las fichas */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children}</dd>
    </div>
  );
}

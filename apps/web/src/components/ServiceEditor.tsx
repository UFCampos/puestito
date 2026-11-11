"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAppConfig } from "@/lib/useAppConfig";

type PaymentPlan = "FULL_100" | "SPLIT_ON_SKETCH" | "SPLIT_ON_FINAL_PREVIEW";
type Rating = "SFW" | "SUGGESTIVE" | "NSFW";

export interface ServiceDraft {
  id?: string;
  title: string;
  description: string;
  priceArs: number;
  priceUsd: number | null;
  paymentPlan: PaymentPlan;
  turnaroundDays: number;
  maxSlots: number;
  revisionsIncluded: number;
  rating: Rating;
  tags: string[];
  addons: { id?: string; name: string; priceArs: number }[];
  isActive?: boolean;
}

interface AddonRow {
  key: string;
  id?: string;
  name: string;
  price: string;
}

const STEPS = [
  { key: "overview", label: "Descripción", hint: "Qué ofrecés" },
  { key: "pricing", label: "Precio y entrega", hint: "Cuánto y cuándo" },
  { key: "extras", label: "Extras", hint: "Opcionales con costo" },
  { key: "payment", label: "Forma de cobro", hint: "Cuándo te pagan" },
  { key: "review", label: "Revisar y publicar", hint: "Último vistazo" }
] as const;

const RATING_OPTIONS: { value: Rating; title: string; text: string }[] = [
  { value: "SFW", title: "SFW", text: "Apto para todo público." },
  { value: "SUGGESTIVE", title: "Suggestive", text: "Poses sugerentes o desnudez artística no explícita." },
  { value: "NSFW", title: "NSFW +18", text: "Explícito. Solo lo ven adultos que lo activan." }
];

const PLAN_OPTIONS: { value: PaymentPlan; title: string; badge?: string; steps: string[] }[] = [
  {
    value: "SPLIT_ON_SKETCH",
    title: "50% de seña + 50% al aprobar el boceto",
    badge: "Recomendado",
    steps: ["Cobrás el 50% al aceptar el pedido", "Subís el boceto", "Cobrás el otro 50% cuando lo aprueban", "Entregás el final"]
  },
  {
    value: "SPLIT_ON_FINAL_PREVIEW",
    title: "50% de seña + 50% al aprobar la vista previa final",
    steps: [
      "Cobrás el 50% al aceptar el pedido",
      "Boceto y obra final",
      "El comprador ve el final con marca de agua",
      "Cobrás el otro 50% y se libera el original"
    ]
  },
  {
    value: "FULL_100",
    title: "100% por adelantado",
    steps: ["Cobrás el 100% al aceptar el pedido", "Subís el boceto", "Entregás el final y se libera el original"]
  }
];

const ADDON_SUGGESTIONS = [
  { name: "Personaje adicional", pct: 0.7 },
  { name: "Fondo detallado", pct: 0.4 },
  { name: "Uso comercial", pct: 1 },
  { name: "Entrega express", pct: 0.3 },
  { name: "Archivo con capas (PSD)", pct: 0.2 }
];

const TURNAROUND_PRESETS = [3, 7, 14, 21, 30];
const MAX_ADDONS = 10;
const MAX_TAGS = 15;

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const newKey = () => Math.random().toString(36).slice(2);
const digits = (v: string) => v.replace(/[^0-9]/g, "");

export function ServiceEditor({ initial }: { initial?: ServiceDraft }) {
  const router = useRouter();
  const cfg = useAppConfig();
  const isEdit = Boolean(initial?.id);

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [rating, setRating] = useState<Rating>(initial?.rating ?? "SFW");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [priceArs, setPriceArs] = useState(initial ? String(initial.priceArs) : "");
  const [priceUsd, setPriceUsd] = useState(initial?.priceUsd != null ? String(initial.priceUsd) : "");
  const [turnaroundDays, setTurnaroundDays] = useState(String(initial?.turnaroundDays ?? 7));
  const [revisionsIncluded, setRevisionsIncluded] = useState(initial?.revisionsIncluded ?? 2);
  const [maxSlots, setMaxSlots] = useState(initial?.maxSlots ?? 3);
  const [addons, setAddons] = useState<AddonRow[]>(
    (initial?.addons ?? []).map((a) => ({ key: newKey(), id: a.id, name: a.name, price: String(a.priceArs) }))
  );
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlan>(initial?.paymentPlan ?? "SPLIT_ON_SKETCH");
  const [publishNow, setPublishNow] = useState(initial?.isActive ?? true);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  const price = Number(priceArs) || 0;
  const feeRate = cfg.platformFeePercent / 100;

  // ── Validación por paso (mismas reglas que el servidor) ──
  const errors = useMemo(() => {
    const e: Record<string, string>[] = [{}, {}, {}, {}, {}];
    if (title.trim().length < 3) e[0].title = "Poné un título de al menos 3 caracteres.";
    if (description.trim().length < 1) e[0].description = "Contá qué incluye y qué no.";
    if (price < 100) e[1].priceArs = "El precio mínimo es $100.";
    if (priceUsd && !(Number(priceUsd) >= 0)) e[1].priceUsd = "Precio en USD inválido.";
    const days = Number(turnaroundDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) e[1].turnaroundDays = "Entre 1 y 365 días.";
    const names = new Set<string>();
    addons.forEach((a) => {
      const name = a.name.trim().toLowerCase();
      if (!name) e[2][a.key] = "Ponele un nombre al extra.";
      else if (names.has(name)) e[2][a.key] = "Ya hay un extra con ese nombre.";
      else if (a.price === "") e[2][a.key] = "Indicá el precio (puede ser 0).";
      names.add(name);
    });
    return e;
  }, [title, description, price, priceUsd, turnaroundDays, addons]);

  const stepHasErrors = (i: number) => Object.keys(errors[i]).length > 0;
  const firstInvalidStep = errors.findIndex((e) => Object.keys(e).length > 0);

  function goTo(target: number) {
    // Se puede volver siempre; para avanzar, los pasos anteriores deben estar completos
    const blocking = errors.slice(0, target).findIndex((e) => Object.keys(e).length > 0);
    if (target > step && blocking !== -1) {
      setShowErrors(true);
      setStep(blocking);
      return;
    }
    setShowErrors(false);
    setStep(target);
  }

  function addTag(raw: string) {
    const parts = raw.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
    if (parts.length === 0) return;
    setTags((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (next.length >= MAX_TAGS) break;
        if (!next.some((t) => t.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 40));
      }
      return next;
    });
    setTagInput("");
  }

  function addAddon(name = "", priceValue = "") {
    if (addons.length >= MAX_ADDONS) return;
    setAddons((prev) => [...prev, { key: newKey(), name, price: priceValue }]);
  }

  function updateAddon(key: string, patch: Partial<AddonRow>) {
    setAddons((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  async function handleSave() {
    if (firstInvalidStep !== -1) {
      setShowErrors(true);
      setStep(firstInvalidStep);
      return;
    }
    setSaving(true);
    setServerError("");
    const body = {
      title: title.trim(),
      description: description.trim(),
      priceArs: price,
      priceUsd: priceUsd ? Number(priceUsd) : null,
      paymentPlan,
      turnaroundDays: Number(turnaroundDays),
      maxSlots,
      revisionsIncluded,
      rating,
      tags,
      addons: addons.map((a) => ({ ...(a.id ? { id: a.id } : {}), name: a.name.trim(), priceArs: Number(a.price) || 0 }))
    };
    try {
      let id = initial?.id;
      if (id) {
        await apiFetch(`/api/artists/services/${id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        const created = await apiFetch<{ id: string }>("/api/artists/services", {
          method: "POST",
          body: JSON.stringify(body)
        });
        id = created.id;
      }
      if (publishNow !== (initial?.isActive ?? true)) {
        await apiFetch(`/api/artists/services/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: publishNow })
        });
      }
      router.push(`/dashboard?service=${isEdit ? "updated" : "created"}`);
      router.refresh();
    } catch (err: any) {
      setServerError(err.message || "No se pudo guardar la comisión");
      setSaving(false);
    }
  }

  const addonsTotal = addons.reduce((acc, a) => acc + (Number(a.price) || 0), 0);
  const isSplit = paymentPlan !== "FULL_100";
  const deposit = isSplit ? Math.round(price / 2) : price;
  const err = (i: number, field: string) => (showErrors ? errors[i][field] : undefined);
  const inputClass = (bad?: string) =>
    `w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 ${
      bad ? "border-rose-400" : "border-slate-300 focus:border-purple-600"
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-xs font-bold text-purple-700 hover:underline">
            ← Volver al panel
          </Link>
          <h1 className="mt-1 text-2xl font-extrabold text-slate-900">
            {isEdit ? "Editar comisión" : "Nueva comisión"}
          </h1>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? "Guardando..." : isEdit ? "Guardar cambios" : publishNow ? "Publicar" : "Guardar pausada"}
        </button>
      </div>

      {/* Pasos */}
      <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STEPS.map((s, i) => {
          const done = i < step && !stepHasErrors(i);
          const bad = showErrors && stepHasErrors(i);
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === step ? "step" : undefined}
                className={`flex w-full items-center gap-2.5 rounded-2xl border p-3 text-left transition ${
                  i === step
                    ? "border-purple-600 bg-purple-50 ring-2 ring-purple-500/20"
                    : bad
                    ? "border-rose-300 bg-rose-50"
                    : "border-slate-200 bg-white hover:border-purple-300"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done ? "bg-emerald-500 text-white" : i === step ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-slate-900">{s.label}</span>
                  <span className="block truncate text-[11px] text-slate-500">{s.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {serverError && (
        <div role="alert" className="mt-4 rounded-xl bg-rose-50 p-3.5 text-sm font-semibold text-rose-700">
          {serverError}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {/* ── Paso 1: Descripción ── */}
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="svc-title" className="text-sm font-bold text-slate-900">
                    Título de la comisión
                  </label>
                  <span className="text-xs text-slate-400">{title.length}/120</span>
                </div>
                <input
                  id="svc-title"
                  type="text"
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: Busto full color estilo anime"
                  className={`mt-1.5 ${inputClass(err(0, "title"))}`}
                />
                {err(0, "title") && <p className="mt-1 text-xs font-semibold text-rose-600">{err(0, "title")}</p>}
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="svc-desc" className="text-sm font-bold text-slate-900">
                    Descripción
                  </label>
                  <span className="text-xs text-slate-400">{description.length}/4000</span>
                </div>
                <p className="text-xs text-slate-500">
                  Qué incluye, qué no, en qué formato entregás y qué necesitás del comprador.
                </p>
                <textarea
                  id="svc-desc"
                  rows={7}
                  maxLength={4000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={"Incluye: un personaje, fondo simple, archivo PNG en alta.\nNo incluye: mechas, fondos complejos."}
                  className={`mt-1.5 ${inputClass(err(0, "description"))}`}
                />
                {err(0, "description") && (
                  <p className="mt-1 text-xs font-semibold text-rose-600">{err(0, "description")}</p>
                )}
              </div>

              <fieldset>
                <legend className="text-sm font-bold text-slate-900">Clasificación de contenido</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {RATING_OPTIONS.map((o) => (
                    <label
                      key={o.value}
                      className={`cursor-pointer rounded-2xl border p-3 transition ${
                        rating === o.value ? "border-purple-600 bg-purple-50 ring-2 ring-purple-500/20" : "border-slate-200 hover:border-purple-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="rating"
                        value={o.value}
                        checked={rating === o.value}
                        onChange={() => setRating(o.value)}
                        className="sr-only"
                      />
                      <span className="block text-sm font-bold text-slate-900">{o.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{o.text}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="svc-tags" className="text-sm font-bold text-slate-900">
                    Tags
                  </label>
                  <span className="text-xs text-slate-400">
                    {tags.length}/{MAX_TAGS}
                  </span>
                </div>
                <p className="text-xs text-slate-500">Ayudan a que te encuentren. Enter o coma para agregar.</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-300 px-2.5 py-2 focus-within:border-purple-600">
                  {tags.map((t) => (
                    <span key={t} className="flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-800">
                      #{t}
                      <button
                        type="button"
                        aria-label={`Quitar tag ${t}`}
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        className="text-purple-500 hover:text-purple-900"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  <input
                    id="svc-tags"
                    type="text"
                    value={tagInput}
                    disabled={tags.length >= MAX_TAGS}
                    onChange={(e) => (e.target.value.includes(",") ? addTag(e.target.value) : setTagInput(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(tagInput);
                      } else if (e.key === "Backspace" && !tagInput) {
                        setTags((prev) => prev.slice(0, -1));
                      }
                    }}
                    onBlur={() => addTag(tagInput)}
                    placeholder={tags.length === 0 ? "anime, vtuber, chibi" : ""}
                    className="min-w-[8rem] flex-1 border-0 bg-transparent py-1 text-sm focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Paso 2: Precio y entrega ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="svc-price" className="text-sm font-bold text-slate-900">
                    Precio base (ARS)
                  </label>
                  <div className="relative mt-1.5">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                    <input
                      id="svc-price"
                      type="text"
                      inputMode="numeric"
                      value={priceArs ? Number(priceArs).toLocaleString("es-AR") : ""}
                      onChange={(e) => setPriceArs(digits(e.target.value).slice(0, 9))}
                      placeholder="25.000"
                      className={`pl-7 ${inputClass(err(1, "priceArs"))}`}
                    />
                  </div>
                  {err(1, "priceArs") ? (
                    <p className="mt-1 text-xs font-semibold text-rose-600">{err(1, "priceArs")}</p>
                  ) : (
                    price > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Recibís {money(price - Math.round(price * feeRate))} por pedido (comisión de la plataforma: {cfg.platformFeePercent}%).
                      </p>
                    )
                  )}
                </div>
                <div>
                  <label htmlFor="svc-usd" className="text-sm font-bold text-slate-900">
                    Precio de referencia en USD <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <input
                    id="svc-usd"
                    type="text"
                    inputMode="decimal"
                    value={priceUsd}
                    onChange={(e) => setPriceUsd(e.target.value.replace(/[^0-9.]/g, "").slice(0, 8))}
                    placeholder="20"
                    className={`mt-1.5 ${inputClass(err(1, "priceUsd"))}`}
                  />
                  <p className="mt-1 text-xs text-slate-500">Solo informativo: los cobros son en pesos.</p>
                </div>
              </div>

              <div>
                <label htmlFor="svc-days" className="text-sm font-bold text-slate-900">
                  Plazo de entrega
                </label>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {TURNAROUND_PRESETS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setTurnaroundDays(String(d))}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                        Number(turnaroundDays) === d ? "border-purple-600 bg-purple-600 text-white" : "border-slate-200 text-slate-700 hover:border-purple-300"
                      }`}
                    >
                      {d} días
                    </button>
                  ))}
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    u otro:
                    <input
                      id="svc-days"
                      type="text"
                      inputMode="numeric"
                      value={turnaroundDays}
                      onChange={(e) => setTurnaroundDays(digits(e.target.value).slice(0, 3))}
                      className={`w-16 rounded-xl border px-2 py-1.5 text-center text-sm ${err(1, "turnaroundDays") ? "border-rose-400" : "border-slate-300"}`}
                    />
                    días
                  </span>
                </div>
                {err(1, "turnaroundDays") && (
                  <p className="mt-1 text-xs font-semibold text-rose-600">{err(1, "turnaroundDays")}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Stepper
                  label="Revisiones incluidas"
                  help="Rondas de ajustes que el comprador puede pedir sin costo."
                  value={revisionsIncluded}
                  min={0}
                  max={20}
                  onChange={setRevisionsIncluded}
                />
                <Stepper
                  label="Cupos simultáneos"
                  help="Cuántos pedidos de esta comisión aceptás a la vez."
                  value={maxSlots}
                  min={1}
                  max={100}
                  onChange={setMaxSlots}
                />
              </div>
            </div>
          )}

          {/* ── Paso 3: Extras ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Extras opcionales</h2>
                <p className="text-xs text-slate-500">
                  El comprador los tilda al pedir y se suman al precio base. Podés dejarlo vacío.
                </p>
              </div>

              {addons.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Todavía no agregaste extras.
                </div>
              ) : (
                <ul className="space-y-2">
                  {addons.map((a, i) => {
                    const bad = err(2, a.key);
                    return (
                      <li key={a.key}>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            maxLength={80}
                            aria-label={`Nombre del extra ${i + 1}`}
                            value={a.name}
                            onChange={(e) => updateAddon(a.key, { name: e.target.value })}
                            placeholder="Ej: Personaje adicional"
                            className={`min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${bad ? "border-rose-400" : "border-slate-300 focus:border-purple-600"}`}
                          />
                          <div className="relative w-36 shrink-0">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">+$</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`Precio del extra ${i + 1}`}
                              value={a.price === "" ? "" : Number(a.price).toLocaleString("es-AR")}
                              onChange={(e) => updateAddon(a.key, { price: digits(e.target.value).slice(0, 9) })}
                              placeholder="0"
                              className={`w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm focus:outline-none ${bad ? "border-rose-400" : "border-slate-300 focus:border-purple-600"}`}
                            />
                          </div>
                          <button
                            type="button"
                            aria-label={`Quitar extra ${a.name || i + 1}`}
                            onClick={() => setAddons((prev) => prev.filter((x) => x.key !== a.key))}
                            className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                          >
                            ✕
                          </button>
                        </div>
                        {bad && <p className="mt-1 text-xs font-semibold text-rose-600">{bad}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => addAddon()}
                  disabled={addons.length >= MAX_ADDONS}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
                >
                  + Agregar extra
                </button>
                <span className="text-xs text-slate-400">
                  {addons.length}/{MAX_ADDONS}
                </span>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-700">Ideas rápidas</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ADDON_SUGGESTIONS.filter((s) => !addons.some((a) => a.name.trim().toLowerCase() === s.name.toLowerCase())).map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      disabled={addons.length >= MAX_ADDONS}
                      onClick={() => addAddon(s.name, price ? String(Math.round((price * s.pct) / 500) * 500) : "")}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-purple-400 hover:bg-purple-50 disabled:opacity-40"
                    >
                      + {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Paso 4: Forma de cobro ── */}
          {step === 3 && (
            <fieldset className="space-y-3">
              <legend className="text-sm font-bold text-slate-900">¿Cuándo querés cobrar?</legend>
              <p className="text-xs text-slate-500">
                El comprador acepta esta modalidad al pedir. Cada pago va directo a tu Mercado Pago.
              </p>
              {PLAN_OPTIONS.map((o) => {
                const selected = paymentPlan === o.value;
                return (
                  <label
                    key={o.value}
                    className={`block cursor-pointer rounded-2xl border p-4 transition ${
                      selected ? "border-purple-600 bg-purple-50 ring-2 ring-purple-500/20" : "border-slate-200 hover:border-purple-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentPlan"
                      value={o.value}
                      checked={selected}
                      onChange={() => setPaymentPlan(o.value)}
                      className="sr-only"
                    />
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-purple-600" : "border-slate-300"}`}>
                        {selected && <span className="h-2 w-2 rounded-full bg-purple-600" />}
                      </span>
                      <span className="text-sm font-bold text-slate-900">{o.title}</span>
                      {o.badge && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">{o.badge}</span>
                      )}
                    </span>
                    <ol className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1 pl-6 text-xs text-slate-600">
                      {o.steps.map((s, i) => (
                        <li key={s} className="flex items-center gap-2">
                          {i > 0 && <span className="text-slate-300">→</span>}
                          {s}
                        </li>
                      ))}
                    </ol>
                    {selected && price > 0 && (
                      <p className="mt-2.5 pl-6 text-xs font-semibold text-purple-800">
                        Con el precio base:{" "}
                        {o.value === "FULL_100"
                          ? `un pago de ${money(price)}`
                          : `${money(deposit)} de seña + ${money(price - deposit)} después`}
                        .
                      </p>
                    )}
                  </label>
                );
              })}
            </fieldset>
          )}

          {/* ── Paso 5: Revisar ── */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-sm font-bold text-slate-900">Revisá antes de {isEdit ? "guardar" : "publicar"}</h2>
              <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 text-sm">
                <ReviewRow label="Título" onEdit={() => goTo(0)}>{title || "—"}</ReviewRow>
                <ReviewRow label="Clasificación y tags" onEdit={() => goTo(0)}>
                  {rating}
                  {tags.length > 0 && ` · ${tags.map((t) => `#${t}`).join(" ")}`}
                </ReviewRow>
                <ReviewRow label="Precio y entrega" onEdit={() => goTo(1)}>
                  {money(price)} ARS · {turnaroundDays} días · {revisionsIncluded} revisiones · {maxSlots} cupos
                </ReviewRow>
                <ReviewRow label="Extras" onEdit={() => goTo(2)}>
                  {addons.length === 0
                    ? "Sin extras"
                    : addons.map((a) => `${a.name || "(sin nombre)"} +${money(Number(a.price) || 0)}`).join(" · ")}
                </ReviewRow>
                <ReviewRow label="Forma de cobro" onEdit={() => goTo(3)}>
                  {PLAN_OPTIONS.find((o) => o.value === paymentPlan)?.title}
                </ReviewRow>
              </dl>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                <input
                  type="checkbox"
                  checked={publishNow}
                  onChange={(e) => setPublishNow(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded text-purple-600"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-900">Visible en mi puestito</span>
                  <span className="block text-xs text-slate-500">
                    Si lo destildás queda pausada: no aparece en tu perfil ni recibe pedidos nuevos.
                  </span>
                </span>
              </label>

              {isEdit && (
                <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  Los pedidos que ya recibiste conservan el precio, los extras y la forma de cobro con los que se pidieron.
                </p>
              )}
            </div>
          )}

          {/* Navegación */}
          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              disabled={step === 0}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:invisible"
            >
              ← Atrás
            </button>
            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => goTo(step + 1)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
              >
                Continuar →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
              >
                {saving ? "Guardando..." : isEdit ? "Guardar cambios" : publishNow ? "Publicar comisión" : "Guardar pausada"}
              </button>
            )}
          </div>
        </div>

        {/* Vista previa en vivo */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Así la ve el comprador</p>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-extrabold text-slate-900">{title.trim() || "Título de tu comisión"}</h3>
              <span className="shrink-0 rounded-lg bg-purple-100 px-2 py-0.5 text-[11px] font-bold text-purple-800">{rating}</span>
            </div>
            <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-slate-600">
              {description.trim() || "Acá va la descripción de lo que incluye."}
            </p>
            <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-xs">
              <p className="font-bold text-purple-800">
                {paymentPlan === "FULL_100"
                  ? "💳 100% al aceptar"
                  : paymentPlan === "SPLIT_ON_SKETCH"
                  ? "✨ 50% seña + 50% al aprobar boceto"
                  : "🛡️ 50% seña + 50% en vista previa final"}
              </p>
              <p className="text-slate-700">
                ⏱️ {turnaroundDays || "?"} días · {revisionsIncluded} rev. · 🎟️ {maxSlots} cupos
              </p>
            </div>
            {tags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1">
                {tags.slice(0, 6).map((t) => (
                  <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    #{t}
                  </span>
                ))}
              </div>
            )}
            {addons.some((a) => a.name.trim()) && (
              <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                {addons
                  .filter((a) => a.name.trim())
                  .map((a) => (
                    <li key={a.key} className="flex justify-between gap-2">
                      <span className="truncate">☐ {a.name}</span>
                      <span className="shrink-0 font-bold text-purple-700">+{money(Number(a.price) || 0)}</span>
                    </li>
                  ))}
              </ul>
            )}
            <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
              <div>
                <p className="text-lg font-extrabold text-slate-900">{price ? `${money(price)} ARS` : "$ —"}</p>
                {priceUsd && <p className="text-[11px] text-slate-400">~US${priceUsd}</p>}
              </div>
              <span className="rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white">✨ Pedir</span>
            </div>
          </div>
          {price > 0 && addonsTotal > 0 && (
            <p className="mt-2 text-xs text-slate-500">Con todos los extras: {money(price + addonsTotal)} ARS.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stepper(props: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const { label, help, value, min, max, onChange } = props;
  const btn = "flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-lg font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-30";
  return (
    <div>
      <p className="text-sm font-bold text-slate-900">{label}</p>
      <p className="text-xs text-slate-500">{help}</p>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" aria-label={`Menos ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={btn}>
          −
        </button>
        <span className="w-8 text-center text-base font-extrabold text-slate-900" aria-live="polite">
          {value}
        </span>
        <button type="button" aria-label={`Más ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={btn}>
          +
        </button>
      </div>
    </div>
  );
}

function ReviewRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 p-3.5">
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-slate-400">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-slate-800">{children}</dd>
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 text-xs font-bold text-purple-700 hover:underline">
        Editar
      </button>
    </div>
  );
}

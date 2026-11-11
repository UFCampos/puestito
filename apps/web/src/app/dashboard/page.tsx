"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch, API_URL, PLAN_LABEL, STATUS_LABEL, fileTooLarge, resolveImageUrl } from "../../lib/api";
import { useAppConfig } from "../../lib/useAppConfig";

const SERVICE_FEEDBACK: Record<string, string> = {
  created: "✅ ¡Comisión publicada en tu puestito!",
  updated: "✅ Cambios guardados."
};

const MP_FEEDBACK: Record<string, string> = {
  connected: "✅ ¡Mercado Pago vinculado! Ya podés cobrar con split automático.",
  cancelled: "Cancelaste la vinculación con Mercado Pago.",
  invalid_state: "⚠️ La vinculación con Mercado Pago venció. Probá de nuevo.",
  session_mismatch: "⚠️ Iniciá sesión con la misma cuenta antes de vincular Mercado Pago.",
  error: "⚠️ Mercado Pago no respondió. Probá de nuevo en unos minutos."
};


export default function ArtistDashboardPageWrapper() {
  return (
    <Suspense>
      <ArtistDashboardPage />
    </Suspense>
  );
}

function ArtistDashboardPage() {
  const searchParams = useSearchParams();
  const [hasArtistProfile, setHasArtistProfile] = useState(false);
  const [pledge, setPledge] = useState(false);
  const [paymentsMode, setPaymentsMode] = useState("live");
  const [user, setUser] = useState<any>(null);
  const [storefront, setStorefront] = useState<any>(null);
  const [mpConnected, setMpConnected] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  // Profile form state
  const [bio, setBio] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [commissionStatus, setCommissionStatus] = useState("OPEN");
  const [defaultWatermarkMode, setDefaultWatermarkMode] = useState("AUTO_TEXT");
  const [watermarkCustomText, setWatermarkCustomText] = useState("");
  const [termsOfService, setTermsOfService] = useState("");
  const [twitter, setTwitter] = useState("");
  const [instagram, setInstagram] = useState("");

  // New portfolio item state
  const [portTitle, setPortTitle] = useState("");
  const [portTags, setPortTags] = useState("");
  const [portRating, setPortRating] = useState("SFW");
  const [portWatermarkMode, setPortWatermarkMode] = useState("AUTO_TEXT");
  const [portFile, setPortFile] = useState<File | null>(null);

  // New commission service state
  const [services, setServices] = useState<any[]>([]);
  const cfg = useAppConfig();

  async function loadAll() {
    try {
      const me = await apiFetch<any>("/api/me").catch(() => null);
      if (!me) {
        setUser(null);
        return;
      }
      setUser(me.user);
      setHasArtistProfile(Boolean(me.artistProfile));
      if (!me.artistProfile) return;

      const [sf, myServices, payStatus, myOrders] = await Promise.all([
        apiFetch<any>(`/api/artists/${me.user.username}`).catch(() => null),
        apiFetch<any>("/api/artists/me/services").catch(() => ({ services: [] })),
        apiFetch<any>("/api/payments/status").catch(() => null),
        apiFetch<any>("/api/orders").catch(() => ({ orders: [] })),
      ]);

      if (sf && sf.artist) {
        setStorefront(sf);
        setBio(sf.artist.bio || "");
        setDisplayName(sf.artist.displayName || "");
        setCommissionStatus(sf.artist.commissionStatus || "OPEN");
        setDefaultWatermarkMode(sf.artist.defaultWatermarkMode || "AUTO_TEXT");
        setWatermarkCustomText(sf.artist.watermarkCustomText || "");
        setTermsOfService(sf.artist.termsOfService || "");
        setTwitter(sf.artist.socialLinks?.twitter || "");
        setInstagram(sf.artist.socialLinks?.instagram || "");
      }
      setServices(myServices.services || []);
      setMpConnected(Boolean(payStatus?.mercadopago?.connected));
      setPaymentsMode(payStatus?.paymentsMode ?? "live");
      setOrders((myOrders.orders || []).filter((o: any) => o.role === "ARTIST"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const mp = searchParams.get("mp");
    if (mp && MP_FEEDBACK[mp]) setFeedback(MP_FEEDBACK[mp]);
    const svc = searchParams.get("service");
    if (svc && SERVICE_FEEDBACK[svc]) setFeedback(SERVICE_FEEDBACK[svc]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOpenStore() {
    if (!pledge) {
      alert("Tenés que aceptar el compromiso de Arte 100% Humano.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/me/artist-profile", {
        method: "POST",
        body: JSON.stringify({ acceptHumanArtPledge: true })
      });
      setLoading(true);
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadImage(kind: "avatar" | "banner", file: File | undefined) {
    if (!file) return;
    const tooLarge = fileTooLarge(file, cfg.uploadLimitsMb.avatar);
    if (tooLarge) {
      alert(tooLarge);
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/api/me/images?kind=${kind}`, {
        method: "POST",
        credentials: "include",
        body: formData
      });
      if (!res.ok) throw new Error((await res.json()).error || "No se pudo subir la imagen");
      setFeedback(kind === "avatar" ? "✅ Foto de perfil actualizada" : "✅ Banner actualizado");
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback("");
    try {
      await apiFetch("/api/artists/profile", {
        method: "PUT",
        body: JSON.stringify({
          displayName,
          bio,
          commissionStatus,
          defaultWatermarkMode,
          watermarkCustomText,
          termsOfService,
          socialLinks: { twitter: twitter.trim(), instagram: instagram.trim() },
        }),
      });
      setFeedback("✅ ¡Configuración de tu Puestito guardada con éxito!");
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleConnectMercadoPago() {
    setSaving(true);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/payments/mp/connect", { method: "POST" });
      window.location.href = url;
    } catch (err: any) {
      alert(err.message);
      setSaving(false);
    }
  }

  async function handleDisconnectMercadoPago() {
    if (!confirm("¿Desvincular Mercado Pago? No vas a poder cobrar nuevos pagos hasta reconectarla.")) return;
    await apiFetch("/api/payments/mp", { method: "DELETE" });
    await loadAll();
  }

  async function handleAddPortfolio(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (!portFile) {
        alert("Elegí la imagen de la obra.");
        setSaving(false);
        return;
      }
      const tooLarge = fileTooLarge(portFile, cfg.uploadLimitsMb.portfolio);
      if (tooLarge) {
        alert(tooLarge);
        setSaving(false);
        return;
      }
      // Los campos van antes del archivo para que el servidor los lea junto con él
      const formData = new FormData();
      formData.append("title", portTitle);
      formData.append("tags", portTags);
      formData.append("rating", portRating);
      formData.append("watermarkMode", portWatermarkMode);
      formData.append("file", portFile);
      const res = await fetch(`${API_URL}/api/artists/portfolio`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al subir obra");
      }
      setPortTitle("");
      setPortTags("");
      setPortFile(null);
      setFeedback("✅ ¡Obra agregada a tu portfolio con protección de marca de agua!");
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePortfolio(itemId: string) {
    if (!confirm("¿Eliminar esta obra de tu portfolio?")) return;
    await apiFetch(`/api/artists/portfolio/${itemId}`, { method: "DELETE" });
    await loadAll();
  }

  async function handleToggleService(srv: any) {
    try {
      await apiFetch(`/api/artists/services/${srv.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !srv.isActive })
      });
      setFeedback(srv.isActive ? "⏸️ Comisión pausada: ya no recibe pedidos nuevos." : "✅ Comisión publicada de nuevo.");
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleDeleteService(srv: any) {
    const warning =
      srv.totalOrders > 0
        ? `"${srv.title}" ya tiene pedidos, así que no se puede borrar: va a quedar pausada. ¿Continuar?`
        : `¿Eliminar "${srv.title}"? No se puede deshacer.`;
    if (!confirm(warning)) return;
    try {
      const res = await apiFetch<{ deleted: boolean }>(`/api/artists/services/${srv.id}`, { method: "DELETE" });
      setFeedback(res.deleted ? "🗑️ Comisión eliminada." : "⏸️ La comisión tiene pedidos: quedó pausada.");
      await loadAll();
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-slate-500">
        Cargando el panel de tu Puestito...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Iniciá sesión como artista</h1>
        <Link href="/login?next=/dashboard" className="mt-4 inline-block rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold text-white">
          Iniciar Sesión
        </Link>
      </div>
    );
  }

  if (!hasArtistProfile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900">Abrí tu Puestito 🎪</h1>
          <p className="mt-2 text-sm text-slate-600">
            Mostrá tu portfolio y vendé comisiones cobrando directo en tu cuenta de Mercado Pago.
          </p>
          <label className="mt-5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950">
            <input type="checkbox" checked={pledge} onChange={(e) => setPledge(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span>
              <strong>Compromiso 100% Arte Humano:</strong> declaro que todas las obras que suba y entregue son creadas
              por mí sin usar IA generativa.
            </span>
          </label>
          <button
            type="button"
            onClick={handleOpenStore}
            disabled={saving}
            className="mt-5 w-full rounded-xl bg-purple-600 py-3 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50"
          >
            Abrir mi Puestito gratis
          </button>
        </div>
      </div>
    );
  }

  const hasProfile = Boolean(bio && termsOfService);
  const hasPortfolio = (storefront?.portfolio?.length || 0) > 0;
  const hasMP = mpConnected;
  const hasServices = services.some((srv) => srv.isActive);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">
            ✨ Panel de Artista • TuPuestito
          </span>
          <h1 className="mt-2 text-2xl font-extrabold text-slate-900">
            Hola, {user.name} (@{user.username})
          </h1>
          <p className="text-sm text-slate-600">
            Configurá tu vidriera, tu marca de agua automática y tus planes de cobro directo.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/u/${user.username}`}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-100"
          >
            👁️ Ver mi Puesto Público (/u/{user.username})
          </Link>
        </div>
      </div>

      {feedback && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          {feedback}
        </div>
      )}

      {/* Onboarding Checklist in 5 Minutes */}
      <div className="mt-6 rounded-3xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-pink-50/60 p-6 shadow-sm">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-indigo-950">
          🚀 Checklist de Onboarding en 5 Minutos
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-2xl border p-3.5 text-xs ${hasProfile ? "border-emerald-200 bg-emerald-50/70 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>
            <span className="text-base">{hasProfile ? "✅" : "1️⃣"}</span>
            <p className="mt-1 font-bold">Bio y Términos (ToS)</p>
            <p className="mt-0.5 text-[11px] opacity-80">Definí tus reglas y marca de agua.</p>
          </div>
          <div className={`rounded-2xl border p-3.5 text-xs ${hasMP ? "border-emerald-200 bg-emerald-50/70 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>
            <span className="text-base">{hasMP ? "✅" : "2️⃣"}</span>
            <p className="mt-1 font-bold">Vincular Mercado Pago</p>
            <p className="mt-0.5 text-[11px] opacity-80">Para cobro directo con Split 95/5.</p>
          </div>
          <div className={`rounded-2xl border p-3.5 text-xs ${hasPortfolio ? "border-emerald-200 bg-emerald-50/70 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>
            <span className="text-base">{hasPortfolio ? "✅" : "3️⃣"}</span>
            <p className="mt-1 font-bold">Subir Obras al Portfolio</p>
            <p className="mt-0.5 text-[11px] opacity-80">Con tags de fandom y marca de agua.</p>
          </div>
          <div className={`rounded-2xl border p-3.5 text-xs ${hasServices ? "border-emerald-200 bg-emerald-50/70 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>
            <span className="text-base">{hasServices ? "✅" : "4️⃣"}</span>
            <p className="mt-1 font-bold">Publicar Comisiones</p>
            <p className="mt-0.5 text-[11px] opacity-80">Elegí 100% o 50/50 con cupos.</p>
          </div>
        </div>
      </div>

      {/* Incoming Orders Quick View */}
      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">📬 Pedidos Activos ({orders.length})</h2>
          <Link href="/my-orders" className="text-xs font-bold text-purple-600 hover:underline">
            Ver todos mis pedidos →
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Todavía no tenés pedidos activos.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {orders.slice(0, 4).map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="rounded-2xl border border-slate-200 p-4 transition hover:border-purple-300 hover:bg-purple-50/20"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-400">#{o.orderNumber || o.id.slice(0, 8)}</span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-bold text-indigo-700">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-1 text-sm font-bold text-slate-900">{o.buyerBrief}</p>
                <p className="mt-1 text-xs font-semibold text-purple-600">
                  ${Number(o.totalAmount).toLocaleString("es-AR")} ARS • Gestionar entrega →
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Mis comisiones */}
      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">🛠️ Mis comisiones ({services.length})</h2>
            <p className="text-xs text-slate-600">Lo que ofrecés en tu puestito: precio, extras y forma de cobro.</p>
          </div>
          <Link
            href="/dashboard/services/new"
            className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-purple-700"
          >
            + Nueva comisión
          </Link>
        </div>

        {services.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm font-bold text-slate-800">Todavía no publicaste ninguna comisión</p>
            <p className="mt-1 text-xs text-slate-500">Armala en unos pasos: descripción, precio, extras y forma de cobro.</p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {services.map((srv: any) => (
              <li
                key={srv.id}
                className={`flex flex-col rounded-2xl border p-4 ${srv.isActive ? "border-slate-200" : "border-slate-200 bg-slate-50"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      srv.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {srv.isActive ? "Publicada" : "Pausada"}
                  </span>
                  <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-700">
                    {PLAN_LABEL[srv.paymentPlan] ?? srv.paymentPlan}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">{srv.rating}</span>
                </div>
                <h3 className="mt-2 font-bold text-slate-900">{srv.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{srv.description}</p>
                <p className="mt-2 text-base font-extrabold text-slate-900">
                  ${Number(srv.priceArs).toLocaleString("es-AR")} ARS
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {srv.turnaroundDays} días · {srv.revisionsIncluded} rev. · Cupos {srv.slotsTaken}/{srv.maxSlots} ·{" "}
                  {srv.addons?.length ?? 0} extras · {srv.totalOrders} pedidos
                </p>
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <Link
                    href={`/dashboard/services/${srv.id}/edit`}
                    className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    ✏️ Editar
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleToggleService(srv)}
                    className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {srv.isActive ? "⏸️ Pausar" : "▶️ Publicar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteService(srv)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Profile & Automatic Watermark Configuration */}
        <form onSubmit={handleSaveProfile} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">🎨 1. Perfil, Estado y Marca de Agua Automática</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Estado de Comisiones</label>
              <select
                value={commissionStatus}
                onChange={(e) => setCommissionStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              >
                <option value="OPEN">🟢 Abiertas (OPEN)</option>
                <option value="WAITLIST">🟡 Lista de Espera (WAITLIST)</option>
                <option value="CLOSED">🔴 Cerradas (CLOSED)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">
                Marca de Agua por Defecto (Sharp)
              </label>
              <select
                value={defaultWatermarkMode}
                onChange={(e) => setDefaultWatermarkMode(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              >
                <option value="AUTO_TEXT">Automática con @nombre diagonal</option>
                <option value="AUTO_AVATAR">Automática con Foto de Perfil + @nombre</option>
                <option value="MANUAL">Manual (subo mis imágenes ya marcadas)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              Texto personalizado para tu Marca de Agua Automática
            </label>
            <input
              type="text"
              value={watermarkCustomText}
              onChange={(e) => setWatermarkCustomText(e.target.value)}
              maxLength={80}
              placeholder={`@${user.username} • MUESTRA TuPuestito - NO USAR`}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Nombre visible</label>
            <input
              type="text"
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <label className="mb-1 block text-xs font-bold text-slate-700">Biografía de tu Puesto</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Foto de perfil (también se usa en la marca de agua con avatar)</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleUploadImage("avatar", e.target.files?.[0])}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Banner</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => handleUploadImage("banner", e.target.files?.[0])}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="url"
              value={twitter}
              onChange={(e) => setTwitter(e.target.value)}
              placeholder="https://x.com/tu_usuario"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
            <input
              type="url"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="https://instagram.com/tu_usuario"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">
              Términos de Servicio (ToS) que el comprador debe aceptar antes de encargarte
            </label>
            <textarea
              rows={4}
              value={termsOfService}
              onChange={(e) => setTermsOfService(e.target.value)}
              className="w-full rounded-xl border border-slate-200 p-3 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
          >
            Guardar Configuración de Mi Puesto
          </button>
        </form>

        {/* Payment Gateways (Mercado Pago OAuth Split + AstroPay USD) */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">💳 2. Pasarelas de Cobro Directo (No-Custodial)</h2>
            <p className="mt-1 text-xs text-slate-600">
              TuPuestito nunca retiene tu dinero. Cada pago se divide automáticamente en la pasarela: <strong>95% directo a tu cuenta</strong> y 5% de comisión de plataforma.
            </p>

            <div className="mt-4 space-y-3">
              {/* Mercado Pago */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                <div>
                  <p className="text-sm font-bold text-sky-950">🇦🇷 Mercado Pago Marketplace Split (ARS)</p>
                  <p className="text-xs text-sky-800">
                    {hasMP
                      ? "✅ Cuenta vinculada (tokens cifrados con AES-256-GCM)"
                      : "Recibí pesos argentinos directo en tu cuenta de Mercado Pago."}
                  </p>
                  {paymentsMode === "mock" && (
                    <p className="mt-1 text-[11px] font-bold text-amber-700">Modo desarrollo: los pagos son simulados.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleConnectMercadoPago}
                    disabled={saving}
                    className="rounded-xl bg-[#009EE3] px-4 py-2 text-xs font-bold text-white hover:bg-[#0089C7]"
                  >
                    {hasMP ? "Reconectar" : "Conectar Mercado Pago"}
                  </button>
                  {hasMP && (
                    <button
                      type="button"
                      onClick={handleDisconnectMercadoPago}
                      className="rounded-xl border border-sky-200 px-3 py-2 text-xs font-semibold text-sky-800"
                    >
                      Desvincular
                    </button>
                  )}
                </div>
              </div>

              {/* AstroPay */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50/50 p-4">
                <div>
                  <p className="text-sm font-bold text-orange-950">🌎 AstroPay Global Wallet (USD)</p>
                  <p className="text-xs text-orange-800">
                    Cobrá comisiones desde el exterior en dólares directo a tu billetera AstroPay.
                  </p>
                </div>
                <span className="rounded-xl bg-orange-100 px-4 py-2 text-xs font-bold text-orange-700">
                  Próximamente
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Portfolio Upload & Management */}
      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">🖼️ 3. Gestor de Portfolio con Marca de Agua Automática</h2>
        <form onSubmit={handleAddPortfolio} className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-6">
          <input
            type="text"
            required
            value={portTitle}
            onChange={(e) => setPortTitle(e.target.value)}
            placeholder="Título de la obra"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
          />
          <input
            type="text"
            value={portTags}
            onChange={(e) => setPortTags(e.target.value)}
            placeholder="Tags: vocaloid, anime, chibi"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
          />
          <input
            type="file"
            required
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setPortFile(e.target.files?.[0] || null)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs"
          />
          <select
            value={portRating}
            onChange={(e) => setPortRating(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
          >
            <option value="SFW">SFW</option>
            <option value="SUGGESTIVE">Suggestive</option>
            <option value="NSFW">NSFW +18</option>
          </select>
          <select
            value={portWatermarkMode}
            onChange={(e) => setPortWatermarkMode(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
          >
            <option value="AUTO_TEXT">Marca: @usuario diagonal</option>
            <option value="AUTO_AVATAR">Marca: Avatar + @usuario</option>
            <option value="MANUAL">Marca: Manual</option>
          </select>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-700"
          >
            + Subir al Portfolio
          </button>
        </form>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {storefront?.portfolio?.map((item: any) => (
            <div key={item.id} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              <img
                src={resolveImageUrl(item.imageUrl)}
                alt={item.title}
                loading="lazy"
                className="h-44 w-full object-cover"
              />
              <div className="flex items-center justify-between bg-white p-2.5 text-xs">
                <span className="truncate font-bold text-slate-800">{item.title}</span>
                <button
                  type="button"
                  onClick={() => handleDeletePortfolio(item.id)}
                  className="text-rose-600 hover:underline"
                >
                  Borrar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

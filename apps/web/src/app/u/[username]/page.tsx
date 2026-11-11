"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch, resolveImageUrl } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function ArtistProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params?.username || "";

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"services" | "portfolio" | "tos">("services");
  const [selectedPortfolioTag, setSelectedPortfolioTag] = useState("Todos");
  const [revealNsfw, setRevealNsfw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const router = useRouter();

  const enableAdultContent = async () => {
    if (!confirm("Confirmo que soy mayor de 18 años y quiero ver contenido +18.")) return;
    try {
      await apiFetch("/api/me/preferences", {
        method: "PUT",
        body: JSON.stringify({ showNsfw: true, confirmAdult: true })
      });
      setReloadKey((k) => k + 1);
    } catch {
      router.push(`/login?next=/u/${username}`);
    }
  };

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    apiFetch(`/api/artists/${username}`)
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [username, reloadKey]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
      </main>
    );
  }

  if (!data || !data.artist) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-800">Artista no encontrado (´• ω •`)</h1>
        <Link
          href="/"
          className="mt-4 inline-block rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white"
        >
          Volver al inicio
        </Link>
      </main>
    );
  }

  const { artist, portfolio = [], services = [], reviews = [] } = data;

  const allPortfolioTags: string[] = ["Todos"];
  portfolio.forEach((item: any) => {
    (item.tags || []).forEach((t: string) => {
      if (!allPortfolioTags.includes(t)) allPortfolioTags.push(t);
    });
  });

  const filteredPortfolio =
    selectedPortfolioTag === "Todos"
      ? portfolio
      : portfolio.filter((item: any) => (item.tags || []).includes(selectedPortfolioTag));

  const copyBioLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      {/* Banner y Cabecera */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative h-48 w-full bg-gradient-to-r from-purple-700 to-indigo-700 sm:h-64">
          {artist.bannerUrl && (
            <img
              src={resolveImageUrl(artist.bannerUrl)}
              alt={`Banner de ${artist.displayName}`}
              {...({ fetchPriority: "high" } as any)}
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="px-6 pb-6">
          <div className="relative -mt-12 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <img
                src={resolveImageUrl(artist.avatarUrl)}
                alt={artist.displayName}
                className="h-24 w-24 rounded-2xl border-4 border-white bg-white object-cover shadow-md sm:h-28 sm:w-28"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
                    {artist.displayName}
                  </h1>
                  {artist.isVerifiedHuman && (
                    <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-bold text-emerald-800">
                      🛡️ 100% Humano Verificado
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-500">@{artist.username}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-xl px-3.5 py-2 text-xs font-extrabold ${
                  artist.commissionStatus === "OPEN"
                    ? "bg-emerald-100 text-emerald-900"
                    : artist.commissionStatus === "WAITLIST"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {artist.commissionStatus === "OPEN"
                  ? "🟢 COMISIONES ABIERTAS"
                  : artist.commissionStatus === "WAITLIST"
                  ? "🟡 LISTA DE ESPERA"
                  : "🔴 COMISIONES CERRADAS"}
              </span>

              <button
                type="button"
                onClick={copyBioLink}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                {copied ? "✅ ¡Link copiado!" : "🔗 Compartir Puestito"}
              </button>
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-700">{artist.bio}</p>

          {/* Links Sociales */}
          {artist.socialLinks && Object.keys(artist.socialLinks).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(artist.socialLinks).map(([net, url]: any) =>
                url ? (
                  <a
                    key={net}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700 hover:bg-purple-100 hover:text-purple-800"
                  >
                    🌐 {net}
                  </a>
                ) : null
              )}
            </div>
          )}
        </div>

        {/* Pestañas */}
        <div className="flex border-t border-slate-200 bg-slate-50/60 px-6">
          <button
            type="button"
            onClick={() => setActiveTab("services")}
            className={`border-b-2 px-5 py-3.5 text-sm font-bold transition ${
              activeTab === "services"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            🎨 Comisiones ({services.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("portfolio")}
            className={`border-b-2 px-5 py-3.5 text-sm font-bold transition ${
              activeTab === "portfolio"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            🖼️ Portfolio ({portfolio.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tos")}
            className={`border-b-2 px-5 py-3.5 text-sm font-bold transition ${
              activeTab === "tos"
                ? "border-purple-600 text-purple-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            📜 Términos (ToS) y Reseñas ({reviews.length})
          </button>
        </div>
      </div>

      {/* Contenido de Pestaña 1: Comisiones */}
      {activeTab === "services" && (
        <section className="mt-6 grid gap-5 md:grid-cols-2">
          {services.map((srv: any) => {
            const tagsList: string[] = srv.tags || [];
            const noSlots = srv.slotsAvailable === 0;

            return (
              <div
                key={srv.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-extrabold text-slate-900">{srv.title}</h2>
                    <span className="rounded-lg bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-800">
                      {srv.rating}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{srv.description}</p>

                  {/* Badges de Condiciones y Modalidad 50/50 */}
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                    <div>
                      <span className="text-slate-400">Modalidad de Pago:</span>
                      <p className="font-bold text-purple-800">
                        {srv.paymentPlan === "FULL_100"
                          ? "💳 100% al aceptar"
                          : srv.paymentPlan === "MILESTONES"
                          ? `🧩 Pago en ${srv.milestones?.length ?? 0} etapas`
                          : srv.paymentPlan === "SPLIT_ON_SKETCH"
                          ? "✨ 50% seña + 50% al aprobar el boceto"
                          : "🛡️ 50% seña + 50% al aprobar la vista previa final"}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Entrega estimada:</span>
                      <p className="font-bold text-slate-800">
                        ⏱️ {srv.turnaroundDays} días ({srv.revisionsIncluded} rev. incl.)
                      </p>
                      <p className="mt-0.5 text-slate-500">
                        🎟️ Cupos libres: {srv.slotsAvailable}/{srv.maxSlots}
                      </p>
                    </div>
                  </div>

                  {srv.paymentPlan === "MILESTONES" && srv.milestones?.length > 0 && (
                    <ol className="mt-3 space-y-1 rounded-xl border border-slate-100 p-3 text-xs text-slate-600">
                      {srv.milestones.map((m: any, i: number) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="truncate">
                            <span className="font-bold text-slate-800">{i + 1}. {m.title}</span>
                            {m.description ? ` — ${m.description}` : ""}
                          </span>
                          <span className="shrink-0 font-semibold text-purple-700">
                            {m.percent}% · {m.days} d
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {tagsList.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {tagsList.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                  <div>
                    <p className="text-xl font-extrabold text-slate-900">
                      ${srv.priceArs.toLocaleString("es-AR")} ARS
                    </p>
                    {srv.priceUsd && (
                      <p className="text-xs font-medium text-slate-400">
                        Ref. internacional: ~US${srv.priceUsd} USD
                      </p>
                    )}
                  </div>

                  {artist.commissionStatus !== "CLOSED" && !noSlots ? (
                    <Link
                      href={`/u/${artist.username}/request/${srv.id}`}
                      className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-purple-700"
                    >
                      ✨ Pedir Comisión
                    </Link>
                  ) : (
                    <span className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-400">
                      {noSlots ? "Sin cupos disponibles" : "Comisiones cerradas"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Contenido de Pestaña 2: Portfolio */}
      {activeTab === "portfolio" && (
        <section className="mt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {allPortfolioTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedPortfolioTag(tag)}
                  className={`rounded-full px-3.5 py-1 text-xs font-semibold ${
                    selectedPortfolioTag === tag
                      ? "bg-purple-600 text-white"
                      : "bg-white text-slate-700 border border-slate-200"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={revealNsfw}
                onChange={(e) => setRevealNsfw(e.target.checked)}
                className="h-4 w-4 rounded text-purple-600"
              />
              <span>Desbloquear obras Suggestive / NSFW (+18)</span>
            </label>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3">
            {filteredPortfolio.map((item: any) => {
              const isBlurred = item.hidden || (item.rating !== "SFW" && !revealNsfw);
              return (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="relative h-64 w-full overflow-hidden bg-slate-100">
                    {item.imageUrl && (<img
                      src={resolveImageUrl(item.imageUrl)}
                      alt={item.title}
                      loading="lazy"
                      className={`h-full w-full object-cover transition duration-300 ${
                        isBlurred ? "scale-110 blur-xl" : "hover:scale-105"
                      }`}
                    />)}
                    {isBlurred && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/40 p-4 text-center text-white">
                        <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold">
                          {item.rating}
                        </span>
                        <button
                          type="button"
                          onClick={() => (item.hidden ? enableAdultContent() : setRevealNsfw(true))}
                          className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 shadow"
                        >
                          {item.hidden ? "Soy +18: activar contenido adulto" : "Mostrar imagen"}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-slate-900">{item.title}</h3>
                    {item.description && (
                      <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Contenido de Pestaña 3: Términos y Reseñas */}
      {activeTab === "tos" && (
        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">
              📜 Términos de Servicio de @{artist.username}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Al encargar una comisión, aceptás este reglamento que queda guardado como respaldo en tu orden:
            </p>
            <div className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
              {artist.termsOfService || "Términos estándar de la plataforma."}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-extrabold text-slate-900">
              ⭐ Reseñas de Compradores ({reviews.length})
            </h2>
            {reviews.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                Todavía no hay reseñas publicadas para este artista.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {reviews.map((rev: any) => (
                  <div key={rev.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900">{rev.buyerName}</span>
                      <span className="text-sm font-bold text-amber-500">
                        {"★".repeat(rev.rating)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-700">{rev.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}


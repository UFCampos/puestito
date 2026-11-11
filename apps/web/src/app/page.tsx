"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, resolveImageUrl } from "@/lib/api";

interface CommissionServiceItem {
  id: string;
  title: string;
  description: string;
  priceArs: number;
  priceUsd?: number | null;
  paymentPlan: "FULL_100" | "SPLIT_ON_SKETCH" | "SPLIT_ON_FINAL_PREVIEW";
  turnaroundDays: number;
  maxSlots: number;
  revisionsIncluded: number;
  rating: "SFW" | "SUGGESTIVE" | "NSFW";
  tags?: string[];
}

interface PortfolioItem {
  id: string;
  title: string;
  imageUrl: string | null;
  hidden?: boolean;
  rating: "SFW" | "SUGGESTIVE" | "NSFW";
  tags?: string[];
}

interface ArtistExploreCard {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  bannerUrl?: string;
  commissionStatus: "OPEN" | "WAITLIST" | "CLOSED";
  isVerifiedHuman: boolean;
  avgRating?: number | null;
  reviewCount: number;
  services: CommissionServiceItem[];
  portfolio: PortfolioItem[];
}

const POPULAR_TAGS = ["Todos", "Anime", "Vocaloid", "VTuber", "Genshin", "Chibi", "Emotes", "OC", "Full Color"];

export default function HomePage() {
  const [artists, setArtists] = useState<ArtistExploreCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [showSuggestive, setShowSuggestive] = useState(false);
  const [maxPrice, setMaxPrice] = useState<string>("");

  const fetchArtists = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      if (selectedTag !== "Todos") params.set("tag", selectedTag);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (!showSuggestive) params.set("rating", "SFW_ONLY");
      if (maxPrice) params.set("maxPrice", maxPrice);

      const data = await apiFetch<{ artists: ArtistExploreCard[] }>(
        `/api/artists/explore?${params.toString()}`
      );
      setArtists(data.artists || []);
    } catch (err) {
      console.error("Error cargando artistas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArtists();
  }, [selectedTag, statusFilter, showSuggestive, maxPrice]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchArtists();
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-800 via-purple-700 to-indigo-800 p-8 text-white shadow-xl sm:p-12">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1 text-xs font-semibold backdrop-blur-sm">
            <span>🇦🇷 Comunidad de Artistas Argentinos</span>
            <span>•</span>
            <span>🛡️ 100% Libre de IA</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Tu feria virtual de comisiones y arte independiente
          </h1>
          <p className="mt-3 text-base text-purple-100 sm:text-lg">
            Descubrí ilustradores locales por fandom o estilo, encargá tu comisión con precios claros en Pesos/USD y aboná en 2 etapas seguras directo al artista.
          </p>

          <form onSubmit={handleSearchSubmit} className="mt-6 flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por artista, fandom (Vocaloid, Genshin), VTuber, Chibi..."
              className="flex-1 rounded-xl border-0 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
            <button
              type="submit"
              className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-300"
            >
              🔍 Buscar
            </button>
          </form>
        </div>
      </section>

      {/* Filtros Rápidos */}
      <section className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Fandoms & Estilos:
          </span>
          {POPULAR_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
                selectedTag === tag
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {tag === "Todos" ? "✨ Todos" : `#${tag}`}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="status-filter" className="text-xs font-semibold text-slate-600">
              Estado:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="ALL">Todos los estados</option>
              <option value="OPEN">🟢 Comisiones Abiertas</option>
              <option value="WAITLIST">🟡 Lista de Espera</option>
            </select>

            <label htmlFor="price-filter" className="text-xs font-semibold text-slate-600">
              Presupuesto máx:
            </label>
            <select
              id="price-filter"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800"
            >
              <option value="">Sin límite</option>
              <option value="30000">Hasta $30.000 ARS</option>
              <option value="50000">Hasta $50.000 ARS</option>
              <option value="100000">Hasta $100.000 ARS</option>
            </select>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={showSuggestive}
              onChange={(e) => setShowSuggestive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <span>Mostrar arte Suggestive / +18</span>
          </label>
        </div>
      </section>

      {/* Listado de Artistas y Puestitos */}
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">
            🎨 Puestitos de Artistas Destacados ({artists.length})
          </h2>
          <Link
            href="/login"
            className="text-xs font-semibold text-purple-700 hover:underline"
          >
            ¿Querés probar con cuenta demo? Ingresá acá →
          </Link>
        </div>

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white p-6"
              />
            ))}
          </div>
        ) : artists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-lg font-semibold text-slate-700">
              No encontramos artistas con esos filtros, nya~ (´• ω •`)
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedTag("Todos");
                setStatusFilter("ALL");
                setMaxPrice("");
              }}
              className="mt-4 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {artists.map((artist, artistIdx) => {
              const minPrice =
                artist.services.length > 0
                  ? Math.min(...artist.services.map((s) => s.priceArs))
                  : null;

              return (
                <article
                  key={artist.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  {/* Mini galería superior */}
                  <div className="grid h-44 grid-cols-3 gap-1 bg-slate-100">
                    {artist.portfolio.slice(0, 3).map((item, idx) => (
                      <div key={item.id} className="relative h-44 w-full overflow-hidden">
                        {item.imageUrl ? (<img
                          src={resolveImageUrl(item.imageUrl)}
                          alt={item.title}
                          {...(artistIdx === 0 && idx === 0
                            ? ({ fetchPriority: "high" } as any)
                            : { loading: "lazy" })}
                          className="h-full w-full object-cover transition duration-300 hover:scale-105"
                        />) : (
                          <div className="flex h-full items-center justify-center bg-slate-200 text-xs font-bold text-slate-500">+18</div>
                        )}
                        {item.rating !== "SFW" && (
                          <span className="absolute right-1.5 top-1.5 rounded bg-rose-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {item.rating}
                          </span>
                        )}
                      </div>
                    ))}
                    {artist.portfolio.length === 0 && (
                      <div className="col-span-3 flex items-center justify-center text-xs text-slate-400">
                        Sin muestras en galería aún
                      </div>
                    )}
                  </div>

                  {/* Info del Artista */}
                  <div className="flex flex-1 flex-col justify-between p-5">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={resolveImageUrl(artist.avatarUrl)}
                            alt={artist.displayName}
                            loading="lazy"
                            className="h-12 w-12 rounded-full border-2 border-purple-200 object-cover"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/u/${artist.username}`}
                                className="text-lg font-bold text-slate-900 hover:text-purple-700"
                              >
                                {artist.displayName}
                              </Link>
                              {artist.isVerifiedHuman && (
                                <span
                                  title="Artista 100% Humano Verificado (Sin IA)"
                                  className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800"
                                >
                                  ✓ Humano
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              @{artist.username}
                              {artist.avgRating && (
                                <span className="ml-2 font-semibold text-amber-600">
                                  ★ {artist.avgRating} ({artist.reviewCount})
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                            artist.commissionStatus === "OPEN"
                              ? "bg-emerald-100 text-emerald-800"
                              : artist.commissionStatus === "WAITLIST"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {artist.commissionStatus === "OPEN"
                            ? "🟢 Abiertas"
                            : artist.commissionStatus === "WAITLIST"
                            ? "🟡 Waitlist"
                            : "🔴 Cerradas"}
                        </span>
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm text-slate-600">{artist.bio}</p>

                      {/* Servicios */}
                      {artist.services.length > 0 && (
                        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                          {artist.services.slice(0, 2).map((srv) => (
                            <div
                              key={srv.id}
                              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"
                            >
                              <div className="truncate pr-2">
                                <span className="font-semibold text-slate-800">{srv.title}</span>
                                <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-800">
                                  {srv.paymentPlan === "FULL_100"
                                    ? "100% inicial"
                                    : srv.paymentPlan === "SPLIT_ON_SKETCH"
                                    ? "50/50 en Boceto"
                                    : "50/50 en Preview Final"}
                                </span>
                              </div>
                              <span className="whitespace-nowrap font-bold text-purple-700">
                                ${srv.priceArs.toLocaleString("es-AR")} ARS
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                      <div className="text-xs text-slate-500">
                        {minPrice ? (
                          <>
                            Desde{" "}
                            <strong className="text-sm text-slate-900">
                              ${minPrice.toLocaleString("es-AR")} ARS
                            </strong>
                          </>
                        ) : (
                          "Consultar servicios"
                        )}
                      </div>
                      <Link
                        href={`/u/${artist.username}`}
                        className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-purple-700"
                      >
                        Ver Puestito y Comisiones →
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

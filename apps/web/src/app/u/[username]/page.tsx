"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import { Sparkles, ShieldCheck, Clock, Layers, Star, ExternalLink, ArrowRight } from "lucide-react";

export default function ArtistProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = use(params);
  const username = resolvedParams.username;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"services" | "portfolio" | "reviews">("services");

  useEffect(() => {
    fetchApi(`/artists/${username}`)
      .then((res) => setData(res))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return <div className="text-center py-24 text-neutral-400">Cargando perfil del artista... ✨</div>;
  }

  if (!data?.artist) {
    return (
      <div className="text-center py-24">
        <h1 className="text-2xl font-bold text-neutral-800">Artista no encontrado</h1>
        <p className="text-neutral-500 mt-2">El usuario @{username} no existe o no tiene un perfil activo.</p>
        <Link href="/" className="inline-block mt-4 text-purple-600 font-bold hover:underline">
          Volver al inicio
        </Link>
      </div>
    );
  }

  const { artist, portfolio, services, reviews } = data;

  return (
    <div className="pb-20">
      {/* Banner */}
      <div className="h-48 md:h-64 bg-gradient-to-r from-purple-200 to-pink-200 relative">
        {artist.bannerUrl && (
          <img src={artist.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
        )}
      </div>

      {/* Info Principal */}
      <div className="max-w-5xl mx-auto px-4 relative -mt-16 sm:-mt-20">
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <img
              src={artist.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80"}
              alt={artist.displayName}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-md object-cover bg-white"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black text-neutral-900">{artist.displayName}</h1>
                {artist.isVerifiedHuman && (
                  <span
                    title="Artista Humano Verificado (Sin IA)"
                    className="bg-purple-100 text-purple-700 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" /> 100% Humano
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-neutral-400">@{artist.username}</p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                    artist.commissionStatus === "OPEN"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {artist.commissionStatus === "OPEN" ? "● Comisiones Abiertas" : "Comisiones Cerradas"}
                </span>
              </div>
            </div>
          </div>

          {/* Redes Sociales */}
          {artist.socialLinks && Object.keys(artist.socialLinks).length > 0 && (
            <div className="flex items-center gap-3 self-end sm:self-center">
              {Object.entries(artist.socialLinks).map(([key, url]: any) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold uppercase bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                >
                  {key} <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Bio y Términos */}
        {artist.bio && (
          <div className="mt-6 bg-white rounded-xl border border-neutral-200 p-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Sobre el artista</h3>
            <p className="text-neutral-700 leading-relaxed whitespace-pre-line text-sm sm:text-base">
              {artist.bio}
            </p>
          </div>
        )}

        {/* Tabs de Navegación */}
        <div className="mt-8 border-b border-neutral-200 flex items-center gap-8">
          <button
            onClick={() => setTab("services")}
            className={`pb-3 font-bold text-sm tracking-tight border-b-2 transition ${
              tab === "services"
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            Comisiones ({services.length})
          </button>
          <button
            onClick={() => setTab("portfolio")}
            className={`pb-3 font-bold text-sm tracking-tight border-b-2 transition ${
              tab === "portfolio"
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            Portfolio ({portfolio.length})
          </button>
          <button
            onClick={() => setTab("reviews")}
            className={`pb-3 font-bold text-sm tracking-tight border-b-2 transition ${
              tab === "reviews"
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            Reseñas ({reviews.length})
          </button>
        </div>

        {/* Contenido de Tab: Comisiones */}
        {tab === "services" && (
          <div className="mt-8 space-y-6">
            {services.length === 0 ? (
              <p className="text-neutral-500 text-center py-12">El artista no tiene tipos de comisión creados aún.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {services.map((s: any) => (
                  <div
                    key={s.id}
                    className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="font-bold text-lg text-neutral-900">{s.title}</h3>
                        <span className="text-xs bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full shrink-0">
                          {s.rating}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 leading-relaxed">{s.description}</p>
                      
                      <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500 pt-2">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> {s.turnaroundDays} días entrega
                        </span>
                        <span className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5" /> {s.revisionsIncluded} revisiones
                        </span>
                        <span className="flex items-center gap-1 font-semibold text-emerald-600">
                          <ShieldCheck className="w-3.5 h-3.5" />{" "}
                          {s.paymentPlan === "SPLIT_ON_SKETCH"
                            ? "50% Seña / 50% al aprobar boceto"
                            : s.paymentPlan === "SPLIT_ON_FINAL_PREVIEW"
                            ? "50% Seña / 50% al ver preview final"
                            : "100% al inicio"}
                        </span>
                      </div>
                    </div>

                    <div className="pt-6 mt-6 border-t border-neutral-100 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-neutral-400 block font-semibold uppercase">Precio</span>
                        <span className="text-xl font-black text-neutral-900">
                          ${s.priceArs.toLocaleString("es-AR")} ARS
                        </span>
                      </div>

                      <Link
                        href={`/u/${artist.username}/request/${s.id}`}
                        className="inline-flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow transition"
                      >
                        Comisionar <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contenido de Tab: Portfolio */}
        {tab === "portfolio" && (
          <div className="mt-8">
            {portfolio.length === 0 ? (
              <p className="text-neutral-500 text-center py-12">No hay obras subidas al portfolio aún.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {portfolio.map((item: any) => (
                  <div key={item.id} className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                    <img
                      src={item.imageUrl.startsWith("http") ? item.imageUrl : `http://localhost:4000${item.imageUrl}`}
                      alt={item.title}
                      className="w-full h-56 object-cover bg-neutral-100"
                    />
                    <div className="p-4">
                      <h4 className="font-bold text-sm text-neutral-900">{item.title}</h4>
                      {item.description && <p className="text-xs text-neutral-500 mt-1">{item.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Contenido de Tab: Reseñas */}
        {tab === "reviews" && (
          <div className="mt-8 space-y-4">
            {reviews.length === 0 ? (
              <p className="text-neutral-500 text-center py-12">El artista aún no tiene reseñas de comisiones completadas.</p>
            ) : (
              reviews.map((rev: any) => (
                <div key={rev.id} className="bg-white p-5 rounded-xl border border-neutral-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-neutral-800">{rev.buyerName}</span>
                      <div className="flex text-amber-400">
                        {Array.from({ length: rev.rating }).map((_, i) => (
                          <Star key={i} className="w-3.5 h-3.5 fill-current" />
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-neutral-400">{new Date(rev.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-neutral-600">{rev.comment}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}


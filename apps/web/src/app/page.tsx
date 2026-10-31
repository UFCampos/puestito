"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../lib/api";
import { Search, Sparkles, ShieldCheck, HeartHandshake } from "lucide-react";

export default function HomePage() {
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchApi("/artists/explore")
      .then((data) => setArtists(data.artists || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filteredArtists = artists.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.displayName.toLowerCase().includes(q) ||
      a.username.toLowerCase().includes(q) ||
      a.bio?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-12 pb-16">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-purple-50 via-white to-neutral-50 border-b border-neutral-200 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Descubrí el talento independiente de Argentina
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-neutral-900 tracking-tight leading-tight">
            Comisioná arte a tus artistas favoritos en un solo lugar 🎪
          </h1>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            El stand de feria virtual tipo Booth y VGen adaptado a Argentina: pagá en pesos vía Mercado Pago en 2 etapas, sin miedo a estafas y con arte 100% humano.
          </p>

          {/* Barra de búsqueda */}
          <div className="max-w-xl mx-auto relative flex items-center">
            <Search className="w-5 h-5 text-neutral-400 absolute left-4 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por artista, personaje, fandom (ej: Vocaloid, Genshin)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-neutral-300 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"
            />
          </div>
        </div>
      </section>

      {/* Características principales */}
      <section className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm flex items-start gap-4">
          <div className="bg-purple-100 text-purple-600 p-3 rounded-xl">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-neutral-900 mb-1">Pago protegido en 2 etapas</h3>
            <p className="text-sm text-neutral-500">
              Aboná 50% de seña para que el artista comience y el 50% final recién al aprobar el boceto o la vista previa terminada.
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm flex items-start gap-4">
          <div className="bg-pink-100 text-pink-600 p-3 rounded-xl">
            <HeartHandshake className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-neutral-900 mb-1">Mercado Pago Split Oficial</h3>
            <p className="text-sm text-neutral-500">
              Tu dinero se acredita directo en la cuenta del artista sin intermediaciones sospechosas ni retenciones extrañas.
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm flex items-start gap-4">
          <div className="bg-amber-100 text-amber-600 p-3 rounded-xl">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-neutral-900 mb-1">Comunidad 100% Humana</h3>
            <p className="text-sm text-neutral-500">
              Tolerancia cero a arte generado con IA. Garantizamos que cada trazo fue dibujado por manos de ilustradores humanos.
            </p>
          </div>
        </div>
      </section>

      {/* Grilla de Artistas */}
      <section className="max-w-6xl mx-auto px-4 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black text-neutral-900 tracking-tight">Artistas Destacados</h2>
          <span className="text-sm text-neutral-500 font-medium">
            {filteredArtists.length} {filteredArtists.length === 1 ? "artista" : "artistas"} disponibles
          </span>
        </div>

        {loading ? (
          <div className="text-center py-20 text-neutral-400">Cargando puestitos de arte... ✨</div>
        ) : filteredArtists.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-neutral-200">
            <p className="text-neutral-500 font-medium">No se encontraron artistas con ese término.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredArtists.map((artist) => (
              <div
                key={artist.id}
                className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col"
              >
                {/* Banner & Avatar */}
                <div className="h-28 bg-purple-100 relative">
                  {artist.bannerUrl && (
                    <img
                      src={artist.bannerUrl}
                      alt={artist.displayName}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute -bottom-6 left-4">
                    <img
                      src={artist.avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80"}
                      alt={artist.displayName}
                      className="w-14 h-14 rounded-full border-2 border-white object-cover shadow-sm bg-white"
                    />
                  </div>
                  {artist.commissionStatus === "OPEN" && (
                    <span className="absolute top-3 right-3 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow">
                      Comisiones Abiertas
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="pt-8 p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-neutral-900 text-base">{artist.displayName}</h3>
                      {artist.isVerifiedHuman && (
                        <span title="Artista Humano Verificado" className="text-purple-600 text-xs">
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 font-medium mb-2">@{artist.username}</p>
                    <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed">
                      {artist.bio || "Ilustrador independiente en TuPuestito."}
                    </p>
                  </div>

                  {/* Portfolio Preview Muestras */}
                  {artist.portfolio && artist.portfolio.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5 rounded-lg overflow-hidden">
                      {artist.portfolio.slice(0, 3).map((item: any) => (
                        <img
                          key={item.id}
                          src={item.imageUrl.startsWith("http") ? item.imageUrl : `http://localhost:4000${item.imageUrl}`}
                          alt={item.title}
                          className="w-full h-16 object-cover bg-neutral-100"
                        />
                      ))}
                    </div>
                  )}

                  {/* Precios y botón */}
                  <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-neutral-400 block font-semibold uppercase">Desde</span>
                      <span className="font-extrabold text-neutral-900 text-sm">
                        ${artist.services?.[0]?.priceArs ? artist.services[0].priceArs.toLocaleString("es-AR") : "Consultar"} ARS
                      </span>
                    </div>

                    <Link
                      href={`/u/${artist.username}`}
                      className="text-xs font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition"
                    >
                      Ver Puestito →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isArtist, setIsArtist] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await fetchApi("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, username, displayName, isArtist })
      });
      window.location.href = isArtist ? "/dashboard" : "/";
    } catch (err: any) {
      setError(err.message || "Error al registrar la cuenta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm space-y-6">
        <div className="text-center">
          <span className="text-3xl">🎪</span>
          <h1 className="text-2xl font-black text-neutral-900 mt-2">Crear cuenta en TuPuestito</h1>
          <p className="text-xs text-neutral-500 mt-1">El espacio para el arte independiente en Argentina</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200">
            {error}
          </div>
        )}

        {/* Selector de Rol */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-100 rounded-xl text-xs font-bold text-center">
          <button
            type="button"
            onClick={() => setIsArtist(true)}
            className={`py-2 rounded-lg transition ${isArtist ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            🎨 Soy Artista
          </button>
          <button
            type="button"
            onClick={() => setIsArtist(false)}
            className={`py-2 rounded-lg transition ${!isArtist ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            🛍️ Soy Comprador
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-neutral-700 mb-1">Nombre Público (Display Name)</label>
            <input
              required
              type="text"
              placeholder="Ej: Sakura Art ✨"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full p-3 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-700 mb-1">Nombre de Usuario (@username)</label>
            <input
              required
              type="text"
              placeholder="sakura_art"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-[10px] text-neutral-400 mt-1">Tu URL será: tupuestito.com.ar/u/{username || "tu_nombre"}</p>
          </div>

          <div>
            <label className="block font-bold text-neutral-700 mb-1">Email</label>
            <input
              required
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-700 mb-1">Contraseña</label>
            <input
              required
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl shadow transition text-sm disabled:opacity-50"
          >
            {loading ? "Registrando..." : isArtist ? "Abrir mi Puestito 🎪" : "Crear Cuenta de Comprador"}
          </button>
        </form>

        <div className="text-center text-xs text-neutral-500 pt-2 border-t border-neutral-100">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="text-purple-600 font-bold hover:underline">
            Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}


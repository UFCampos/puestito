"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../lib/api";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await fetchApi("/auth/login", {
        method: "POST",
        body: JSON.stringify({ login, password })
      });
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message || "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <div className="bg-white p-8 rounded-2xl border border-neutral-200 shadow-sm space-y-6">
        <div className="text-center">
          <span className="text-3xl">🎪</span>
          <h1 className="text-2xl font-black text-neutral-900 mt-2">Ingresar a TuPuestito</h1>
          <p className="text-xs text-neutral-500 mt-1">Accedé a tus comisiones y pedidos</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-neutral-700 mb-1">Email o Nombre de Usuario</label>
            <input
              required
              type="text"
              placeholder="tu@email.com o @usuario"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full p-3 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block font-bold text-neutral-700 mb-1">Contraseña</label>
            <input
              required
              type="password"
              placeholder="••••••••"
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
            {loading ? "Ingresando..." : "Iniciar Sesión"}
          </button>
        </form>

        <div className="text-center text-xs text-neutral-500 pt-2 border-t border-neutral-100">
          ¿No tenés cuenta?{" "}
          <Link href="/register" className="text-purple-600 font-bold hover:underline">
            Crear cuenta o abrir puestito
          </Link>
        </div>
      </div>
    </div>
  );
}


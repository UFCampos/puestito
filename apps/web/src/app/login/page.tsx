"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, authClient } from "@/lib/api";
import { SocialLogin } from "@/components/SocialLogin";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const value = login.trim();
      const { error } = value.includes("@")
        ? await authClient.signIn.email({ email: value.toLowerCase(), password })
        : await authClient.signIn.username({ username: value.toLowerCase(), password });
      if (error) {
        throw new Error(
          error.status === 403
            ? "Confirmá tu email antes de ingresar (revisá tu bandeja de entrada)."
            : error.status === 429
            ? "Demasiados intentos. Esperá un minuto."
            : "Usuario/email o contraseña incorrectos"
        );
      }
      const me = await apiFetch<{ artistProfile: unknown }>("/api/me");
      router.push(next ?? (me.artistProfile ? "/dashboard" : "/"));
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (email: string) => {
    setLogin(email);
    setPassword("tupuestito123");
  };

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">Ingresar a TuPuestito</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gestioná tus comisiones, tu puestito o tus pedidos en curso.
        </p>

        <SocialLogin next={next ?? "/"} />

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-input" className="block text-xs font-bold text-slate-700">
              Email o Nombre de Usuario
            </label>
            <input
              id="login-input"
              name="username"
              type="text"
              autoComplete="username"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="maomao@tupuestito.com o maomao"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-purple-600 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="current-password" className="block text-xs font-bold text-slate-700">
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-xs font-semibold text-purple-700 hover:underline"
              >
                {showPassword ? "Ocultar" : "Mostrar contraseña"}
              </button>
            </div>
            <input
              id="current-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-purple-600 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-purple-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? "Ingresando..." : "Iniciar Sesión"}
          </button>
        </form>

        <p className="mt-3 text-right text-xs">
          <Link href="/forgot-password" className="font-semibold text-purple-700 hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>

        {/* Accesos rápidos de prueba (solo desarrollo) */}
        {process.env.NODE_ENV !== "production" && (
        <div className="mt-6 rounded-xl border border-purple-100 bg-purple-50/70 p-4">
          <p className="text-xs font-bold text-purple-900">🧪 Cuentas Demo (1 clic para probar):</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => fillDemo("maomao@tupuestito.com")}
              className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-purple-800 shadow-sm hover:bg-purple-100"
            >
              🌸 Artista (MaoMao)
            </button>
            <button
              type="button"
              onClick={() => fillDemo("comprador@tupuestito.com")}
              className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-100"
            >
              🎨 Comprador (Uriel)
            </button>
          </div>
        </div>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          ¿Todavía no tenés cuenta?{" "}
          <Link href="/register" className="font-bold text-purple-700 hover:underline">
            Registrate gratis acá
          </Link>
        </p>
      </div>
    </main>
  );
}


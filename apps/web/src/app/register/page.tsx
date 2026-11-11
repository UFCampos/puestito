"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, authClient } from "@/lib/api";
import { SocialLogin } from "@/components/SocialLogin";

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isArtist, setIsArtist] = useState(true);
  const [acceptedAntiAi, setAcceptedAntiAi] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isArtist && !acceptedAntiAi) {
      setError("Para abrir un puestito de artista debés aceptar la declaración de Arte 100% Humano.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { data, error } = await authClient.signUp.email({
        name: displayName.trim(),
        username,
        email: email.trim().toLowerCase(),
        password
      });
      if (error) {
        const code = (error.code || "").toUpperCase();
        throw new Error(
          code.includes("USERNAME")
            ? "Ese nombre de usuario ya está en uso o no es válido (3-30 caracteres: a-z, 0-9, _)."
            : code.includes("EXISTS") || code.includes("EMAIL")
            ? "Ya existe una cuenta con ese email."
            : code.includes("PASSWORD")
            ? "La contraseña debe tener entre 8 y 128 caracteres."
            : error.message || "No se pudo crear la cuenta"
        );
      }
      if (!data?.token) {
        // Verificación de email obligatoria: todavía no hay sesión
        setError("");
        setVerifyPending(true);
        return;
      }
      if (isArtist) {
        await apiFetch("/api/me/artist-profile", {
          method: "POST",
          body: JSON.stringify({ acceptHumanArtPledge: true })
        });
        router.push("/dashboard");
      } else {
        router.push("/");
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Error al registrarse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">Crear cuenta en TuPuestito</h1>
        <p className="mt-1 text-sm text-slate-500">
          Abrí tu tienda/portfolio gratis en menos de 5 minutos o registrate para pedir comisiones.
        </p>

        {/* Selector de Rol */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setIsArtist(true)}
            className={`rounded-xl border p-3 text-left transition ${
              isArtist
                ? "border-purple-600 bg-purple-50 ring-2 ring-purple-600/20"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <p className="text-sm font-bold text-slate-900">🎨 Soy Artista</p>
            <p className="text-xs text-slate-500">Quiero mostrar mi portfolio y vender comisiones</p>
          </button>
          <button
            type="button"
            onClick={() => setIsArtist(false)}
            className={`rounded-xl border p-3 text-left transition ${
              !isArtist
                ? "border-purple-600 bg-purple-50 ring-2 ring-purple-600/20"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <p className="text-sm font-bold text-slate-900">🛍️ Soy Comprador</p>
            <p className="text-xs text-slate-500">Quiero encargar arte y seguir mis pedidos</p>
          </button>
        </div>

        <SocialLogin next={isArtist ? "/dashboard" : "/"} />

        {verifyPending && (
          <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
            📧 Te enviamos un email para confirmar tu cuenta. Después de confirmarlo podés ingresar
            {isArtist ? " y abrir tu puestito desde el panel." : "."}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="signup-name" className="block text-xs font-bold text-slate-700">
              Nombre Visible / Artístico
            </label>
            <input
              id="signup-name"
              name="name"
              type="text"
              autoComplete="name"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ej: MaoMao Atelier"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-purple-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="signup-username" className="block text-xs font-bold text-slate-700">
              Nombre de Usuario (tu URL única: tupuestito.com.ar/u/{username || "usuario"})
            </label>
            <input
              id="signup-username"
              name="username"
              type="text"
              autoComplete="username"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              required
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
              }
              placeholder="maomao"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-purple-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="block text-xs font-bold text-slate-700">
              Correo Electrónico
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-purple-600 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="new-password" className="block text-xs font-bold text-slate-700">
                Contraseña (mínimo 8 caracteres)
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
              id="new-password"
              name="new-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-purple-600 focus:outline-none"
            />
          </div>

          {isArtist && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-950">
              <input
                type="checkbox"
                checked={acceptedAntiAi}
                onChange={(e) => setAcceptedAntiAi(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-600"
              />
              <span>
                <strong>Compromiso 100% Arte Humano:</strong> Declaro que todas las obras que suba a mi portfolio y entregue en comisiones son creadas por mí sin utilizar IA generativa.
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-purple-600 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-purple-700 disabled:opacity-50"
          >
            {loading
              ? "Creando cuenta..."
              : isArtist
              ? "Crear mi Puestito de Artista Gratis"
              : "Crear Cuenta de Comprador"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className="font-bold text-purple-700 hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}


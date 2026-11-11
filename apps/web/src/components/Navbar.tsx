"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/api";
import { useMe } from "@/lib/useMe";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, artistProfile, loading, reload } = useMe([pathname]);

  const handleLogout = async () => {
    try {
      await authClient.signOut();
    } catch {
      // ignore
    }
    await reload();
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-purple-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 text-xl font-extrabold text-purple-700">
            <span className="text-2xl">🎪</span>
            <span>TuPuestito</span>
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
              AR Beta
            </span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm font-medium text-slate-600 md:flex">
            <Link href="/" className="hover:text-purple-700">
              Explorar Comisiones
            </Link>
            <Link href="/anti-ai-policy" className="hover:text-purple-700">
              🛡️ 100% Arte Humano
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {!loading && user ? (
            <>
              <Link
                href="/my-orders"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                📦 Mis Pedidos
              </Link>
              {artistProfile ? (
                <>
                  <Link
                    href={`/u/${user.username}`}
                    className="hidden rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-100 sm:inline-block"
                  >
                    🎨 Mi Puestito
                  </Link>
                  <Link
                    href="/dashboard"
                    className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-700"
                  >
                    ⚙️ Panel Artista
                  </Link>
                </>
              ) : (
                <Link
                  href="/dashboard"
                  className="hidden rounded-lg border border-purple-200 px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-50 sm:inline-block"
                >
                  🎨 Abrir mi Puestito
                </Link>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                Salir ({user.username})
              </button>
            </>
          ) : !loading ? (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Ingresar
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700"
              >
                Crear Cuenta / Puestito
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}


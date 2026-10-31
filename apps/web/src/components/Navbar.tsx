"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchApi } from "../lib/api";
import { Palette, User, LogOut, LayoutDashboard, ShoppingBag } from "lucide-react";

export function Navbar() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetchApi("/auth/me")
      .then((data) => setUser(data?.user))
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await fetchApi("/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-neutral-200">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-black text-xl text-neutral-900 tracking-tight">
          <span className="text-2xl">🎪</span>
          <span>TuPuestito</span>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Beta
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            Explorar Artistas
          </Link>

          {user ? (
            <div className="flex items-center gap-3">
              {user.role === "ARTIST" ? (
                <Link
                  href="/dashboard"
                  className="flex items-center gap-1.5 text-sm font-semibold bg-neutral-900 text-white px-3.5 py-1.5 rounded-lg hover:bg-neutral-800 transition"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Mi Puestito
                </Link>
              ) : (
                <Link
                  href="/orders"
                  className="flex items-center gap-1.5 text-sm font-semibold bg-neutral-900 text-white px-3.5 py-1.5 rounded-lg hover:bg-neutral-800 transition"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Mis Pedidos
                </Link>
              )}

              <span className="text-sm font-medium text-neutral-700">@{user.username}</span>
              <button
                onClick={handleLogout}
                className="text-neutral-400 hover:text-neutral-600 p-1.5 rounded-lg hover:bg-neutral-100 transition"
                title="Cerrar sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="text-sm font-medium text-neutral-700 hover:text-neutral-900 px-3 py-1.5 rounded-lg hover:bg-neutral-100 transition"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/register"
                className="text-sm font-semibold bg-purple-600 text-white px-3.5 py-1.5 rounded-lg hover:bg-purple-700 shadow-sm transition"
              >
                Abrir Puestito
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}


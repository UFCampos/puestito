"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { SUPPORT_EMAIL } from "@/lib/site";

const LINK = "rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, artistProfile, attention, loading, reload } = useMe([pathname]);
  const [open, setOpen] = useState(false);

  // Al navegar se cierra el menú del celular
  useEffect(() => setOpen(false), [pathname]);

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

  const links = (
    <>
      <Link href="/" className={LINK}>
        Explorar
      </Link>
      <Link href="/ayuda" className={LINK}>
        Ayuda
      </Link>
      {!loading && user ? (
        <>
          <Link href="/my-orders" className={LINK}>
            📦 Mis Pedidos
            {attention > 0 && (
              <span aria-label={`${attention} pedidos requieren tu atención`} className="ml-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                {attention}
              </span>
            )}
          </Link>
          {artistProfile ? (
            <>
              <Link href={`/u/${user.username}`} className={LINK}>
                🎨 Mi Puestito
              </Link>
              <Link href="/dashboard" className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-700">
                Panel Artista
              </Link>
            </>
          ) : (
            <Link href="/dashboard" className="rounded-lg border border-purple-200 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50">
              🎨 Abrir mi Puestito
            </Link>
          )}
          {user.role === "ADMIN" && (
            <Link href="/admin" className={LINK}>
              🛡️ Moderación
            </Link>
          )}
          <Link href="/cuenta" className={LINK}>
            Mi cuenta
          </Link>
          <button type="button" onClick={handleLogout} className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            Salir
          </button>
        </>
      ) : !loading ? (
        <>
          <Link href="/login" className={LINK}>
            Ingresar
          </Link>
          <Link href="/register" className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700">
            Crear cuenta
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-purple-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-xl font-extrabold text-purple-700">
          <span className="text-2xl">🎪</span>
          <span>TuPuestito</span>
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">AR Beta</span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
          {links}
        </nav>

        <button
          type="button"
          aria-expanded={open}
          aria-controls="menu-principal"
          onClick={() => setOpen(!open)}
          className="relative rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 lg:hidden"
        >
          {open ? "✕ Cerrar" : "☰ Menú"}
          {!open && attention > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-rose-600" />}
        </button>
      </div>

      {open && (
        <nav id="menu-principal" aria-label="Principal" className="flex flex-col gap-1 border-t border-slate-100 px-4 py-3 lg:hidden">
          {links}
        </nav>
      )}

      {user?.suspended && (
        <div role="alert" className="bg-rose-600 px-4 py-2 text-center text-xs font-semibold text-white">
          Tu cuenta está suspendida{user.suspensionReason ? `: ${user.suspensionReason}` : ""}. Podés ver tus pedidos, pero no realizar acciones. Escribinos a{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </div>
      )}
    </header>
  );
}

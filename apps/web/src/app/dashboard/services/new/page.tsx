"use client";

import Link from "next/link";
import { ServiceEditor } from "@/components/ServiceEditor";
import { useMe } from "@/lib/useMe";

export default function NewServicePage() {
  const { user, artistProfile, loading } = useMe();

  if (loading) {
    return <div className="mx-auto max-w-5xl px-4 py-16 text-center text-slate-500">Cargando...</div>;
  }
  if (!user || !artistProfile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Necesitás un puestito para publicar comisiones</h1>
        <Link
          href={user ? "/dashboard" : "/login?next=/dashboard/services/new"}
          className="mt-4 inline-block rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold text-white"
        >
          {user ? "Abrir mi puestito" : "Iniciar sesión"}
        </Link>
      </div>
    );
  }
  return <ServiceEditor />;
}

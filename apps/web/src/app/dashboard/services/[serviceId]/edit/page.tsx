"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ServiceEditor, type ServiceDraft } from "@/components/ServiceEditor";
import { apiFetch } from "@/lib/api";

export default function EditServicePage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const [service, setService] = useState<ServiceDraft | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ services: ServiceDraft[] }>("/api/artists/me/services")
      .then((res) => {
        const found = res.services.find((s) => s.id === serviceId);
        if (found) setService(found);
        else setError("No encontramos esa comisión en tu puestito.");
      })
      .catch((err) =>
        setError(err.status === 401 ? "Iniciá sesión para editar tus comisiones." : err.message || "No se pudo cargar")
      );
  }, [serviceId]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">{error}</h1>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-bold text-purple-700 hover:underline">
          Volver al panel
        </Link>
      </div>
    );
  }
  if (!service) {
    return <div className="mx-auto max-w-5xl px-4 py-16 text-center text-slate-500">Cargando comisión...</div>;
  }
  return <ServiceEditor initial={service} />;
}

"use client";

import { useEffect } from "react";
import { API_URL } from "@/lib/api";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch(`${API_URL}/api/client-errors`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: String(error.message).slice(0, 500), path: window.location.pathname, digest: error.digest })
    }).catch(() => {});
  }, [error]);

  return (
    <main className="mx-auto max-w-xl px-4 py-20 text-center">
      <h1 className="text-2xl font-extrabold text-slate-900">Algo salió mal</h1>
      <p className="mt-2 text-sm text-slate-600">Ya le avisamos al equipo. Probá de nuevo en un momento.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white">
        Reintentar
      </button>
    </main>
  );
}

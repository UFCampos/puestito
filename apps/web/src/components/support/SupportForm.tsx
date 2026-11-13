"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import { SUPPORT_EMAIL } from "@/lib/site";

const INPUT = "mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-purple-600 focus:outline-none";

/**
 * Formulario de contacto con soporte o de arrepentimiento (Res. 424/2020).
 * No exige sesión; si la hay, precarga nombre y email.
 */
export function SupportForm({ kind }: { kind: "contact" | "arrepentimiento" }) {
  const regret = kind === "arrepentimiento";
  const { user } = useMe();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // campo trampa: las personas no lo ven
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (!user) return;
    setName((v) => v || user.name);
    setEmail((v) => v || user.email);
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const number = orderNumber.trim();
    if (number && !/^#?PST-\d+$/i.test(number)) {
      setError("El número de pedido tiene la forma PST-1042 (lo ves en la sala del pedido y en los emails).");
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch<{ code: string }>(`/api/support/${regret ? "arrepentimiento" : "contact"}`, {
        method: "POST",
        body: JSON.stringify({ name, email, orderNumber: number || undefined, message, website })
      });
      setCode(res.code);
    } catch (err: any) {
      setError(err.message || "No se pudo enviar. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  if (code) {
    return (
      <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <p className="text-sm font-bold text-emerald-950">{regret ? "Recibimos tu pedido de arrepentimiento" : "Recibimos tu consulta"}</p>
        <p className="mt-3 text-xs uppercase tracking-wide text-emerald-800">Código de identificación</p>
        <p className="mt-1 font-mono text-2xl font-extrabold text-emerald-950">{code}</p>
        <p className="mt-3 text-sm text-emerald-900">
          {regret ? `Te enviamos la constancia a ${email}. Guardá el código.` : `Te vamos a responder a ${email}.`}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sf-name" className="block text-xs font-bold text-slate-700">Nombre y apellido</label>
          <input id="sf-name" required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label htmlFor="sf-email" className="block text-xs font-bold text-slate-700">Email</label>
          <input id="sf-email" type="email" required maxLength={200} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </div>
      </div>
      <div>
        <label htmlFor="sf-order" className="block text-xs font-bold text-slate-700">
          Número de pedido {regret ? "" : "(opcional)"}
        </label>
        <input id="sf-order" required={regret} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="PST-1042" className={INPUT} />
      </div>
      <div>
        <label htmlFor="sf-message" className="block text-xs font-bold text-slate-700">
          {regret ? "Comentario (opcional)" : "¿En qué te podemos ayudar?"}
        </label>
        <textarea id="sf-message" rows={4} required={!regret} minLength={regret ? undefined : 10} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} className={INPUT} />
      </div>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="sf-website">No completar</label>
        <input id="sf-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">
          ⚠️ {error}
        </p>
      )}
      <button type="submit" disabled={sending} className="w-full rounded-xl bg-purple-600 py-3 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50">
        {sending ? "Enviando…" : regret ? "Enviar pedido de arrepentimiento" : "Enviar consulta"}
      </button>
      <p className="text-center text-xs text-slate-500">
        También podés escribirnos a <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>.
      </p>
    </form>
  );
}

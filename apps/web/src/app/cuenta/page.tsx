"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL, apiFetch, authClient, formatDate } from "@/lib/api";
import { useMe } from "@/lib/useMe";

const CARD = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
const INPUT = "mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-purple-600 focus:outline-none";
const BTN = "rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-50";

function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={`mt-3 text-xs font-semibold ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>
      {msg.ok ? "✅" : "⚠️"} {msg.text}
    </p>
  );
}

export default function CuentaPage() {
  const router = useRouter();
  const { user, loading, reload } = useMe();
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [adult, setAdult] = useState(false);
  const [nsfwMsg, setNsfwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passMsg, setPassMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmUsername, setConfirmUsername] = useState("");
  const [deleteMsg, setDeleteMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    apiFetch<any>("/api/me").then((d) => setTermsAcceptedAt(d.account?.termsAcceptedAt ?? null)).catch(() => {});
    apiFetch<{ hasPassword: boolean }>("/api/me/security").then((d) => setHasPassword(d.hasPassword)).catch(() => {});
  }, [user]);

  if (loading) return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-500">Cargando…</div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Iniciá sesión para ver tu cuenta</h1>
        <Link href="/login?next=/cuenta" className="mt-6 inline-block rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white">
          Iniciar Sesión
        </Link>
      </div>
    );
  }

  async function act(setMsg: (m: { ok: boolean; text: string } | null) => void, okText: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: okText });
      await reload();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || "No se pudo guardar" });
    } finally {
      setBusy(false);
    }
  }
  const prefs = (body: unknown) => apiFetch("/api/me/preferences", { method: "PUT", body: JSON.stringify(body) });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold text-slate-900">Mi cuenta</h1>

      {user.suspended && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <strong>Tu cuenta está suspendida.</strong> {user.suspensionReason} Igual podés descargar tus datos o eliminar tu cuenta.
        </div>
      )}

      <section className={CARD}>
        <h2 className="text-lg font-bold text-slate-900">Datos</h2>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act(setProfileMsg, "Nombre actualizado", () => prefs({ name }));
          }}
        >
          <label htmlFor="acc-name" className="block text-xs font-bold text-slate-700">Nombre visible</label>
          <div className="flex gap-2">
            <input id="acc-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
            <button type="submit" disabled={busy || name.trim() === user.name} className={`${BTN} mt-1`}>Guardar</button>
          </div>
          <Notice msg={profileMsg} />
        </form>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-semibold text-slate-400">Usuario</dt><dd>@{user.username}</dd></div>
          <div>
            <dt className="text-xs font-semibold text-slate-400">Email</dt>
            <dd>{user.email} {user.emailVerified ? "✅" : <span className="text-xs font-semibold text-amber-700">(sin verificar)</span>}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">
          {termsAcceptedAt ? `Aceptaste los términos el ${formatDate(termsAcceptedAt)}. ` : ""}
          <Link href="/terms" className="underline">Términos y Condiciones</Link> · <Link href="/privacy" className="underline">Política de Privacidad</Link>
        </p>
      </section>

      <section className={CARD}>
        <h2 className="text-lg font-bold text-slate-900">Contenido +18</h2>
        {user.showNsfw ? (
          <>
            <p className="mt-2 text-sm text-slate-700">Activado: ves obras y comisiones clasificadas como +18.</p>
            <button type="button" disabled={busy} onClick={() => act(setNsfwMsg, "Contenido +18 desactivado", () => prefs({ showNsfw: false }))} className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Desactivar
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-700">Desactivado. Para ver y pedir contenido para adultos tenés que declarar que sos mayor de edad.</p>
            <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-4 w-4" />
              Declaro que soy mayor de 18 años.
            </label>
            <button type="button" disabled={busy || !adult} onClick={() => act(setNsfwMsg, "Contenido +18 activado", () => prefs({ showNsfw: true, confirmAdult: true }))} className={`${BTN} mt-3`}>
              Activar contenido +18
            </button>
          </>
        )}
        <Notice msg={nsfwMsg} />
      </section>

      <section className={CARD}>
        <h2 className="text-lg font-bold text-slate-900">Contraseña</h2>
        {hasPassword === false ? (
          <p className="mt-2 text-sm text-slate-700">Ingresás con Google o Discord, así que tu cuenta no tiene contraseña en TuPuestito.</p>
        ) : (
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(setPassMsg, "Contraseña cambiada. Cerramos tus otras sesiones.", async () => {
                const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
                if (error) throw new Error(error.status === 400 ? "La contraseña actual no es correcta" : error.message || "No se pudo cambiar la contraseña");
                setCurrentPassword("");
                setNewPassword("");
              });
            }}
          >
            <div>
              <label htmlFor="acc-pass" className="block text-xs font-bold text-slate-700">Contraseña actual</label>
              <input id="acc-pass" type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="acc-newpass" className="block text-xs font-bold text-slate-700">Nueva (mínimo 8 caracteres)</label>
              <input id="acc-newpass" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={INPUT} />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy} className={BTN}>Cambiar contraseña</button>
              <Notice msg={passMsg} />
            </div>
          </form>
        )}
      </section>

      <section className={CARD}>
        <h2 className="text-lg font-bold text-slate-900">Mis datos personales</h2>
        <p className="mt-2 text-sm text-slate-700">
          Podés descargar una copia de todo lo que guardamos sobre tu cuenta: perfil, pedidos, mensajes que enviaste, reseñas y consultas a soporte (Ley 25.326).
        </p>
        <a href={`${API_URL}/api/me/export`} className="mt-3 inline-block rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          ⬇️ Descargar mis datos
        </a>
      </section>

      <section className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-rose-800">Eliminar mi cuenta</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Es definitivo: no se puede deshacer.</li>
          <li>Si nunca tuviste pedidos, borramos todo.</li>
          <li>Si tuviste pedidos, se conservan sin tus datos personales (figurás como “Usuario eliminado”), porque también son el registro de la otra parte. Tu perfil, portfolio y cuenta de cobro se borran.</li>
          <li>No se puede con pedidos en curso: primero tienen que terminar o cancelarse.</li>
        </ul>
        <label htmlFor="acc-delete" className="mt-4 block text-xs font-bold text-slate-700">
          Para confirmar, escribí tu usuario: <span className="font-mono">{user.username}</span>
        </label>
        <input id="acc-delete" autoComplete="off" value={confirmUsername} onChange={(e) => setConfirmUsername(e.target.value)} className={INPUT} />
        <button
          type="button"
          disabled={busy || confirmUsername.trim().toLowerCase().replace(/^@/, "") !== user.username}
          className="mt-3 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
          onClick={async () => {
            if (!confirm("¿Eliminar tu cuenta para siempre?")) return;
            setBusy(true);
            setDeleteMsg(null);
            try {
              await apiFetch("/api/me", { method: "DELETE", body: JSON.stringify({ confirmUsername }) });
              router.push("/");
              router.refresh();
            } catch (err: any) {
              setDeleteMsg({ ok: false, text: err.message });
              setBusy(false);
            }
          }}
        >
          Eliminar mi cuenta
        </button>
        <Notice msg={deleteMsg} />
      </section>
    </main>
  );
}

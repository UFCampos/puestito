"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { STATUS_LABEL, apiFetch, formatDateTime, money, resolveImageUrl } from "@/lib/api";
import { useMe } from "@/lib/useMe";
import {
  BTN,
  Badge,
  Card,
  Empty,
  ErrorBox,
  Field,
  INPUT,
  InlineError,
  Loading,
  Segmented,
  TabHeader,
  errorMessage,
  statusTone,
  timeAgo,
  toDate,
  useAdminData
} from "./_components/shared";
import {
  TAB_KEYS,
  type AdminDispute,
  type AdminOrder,
  type AdminReport,
  type AdminUser,
  type AuditAction,
  type JobsResult,
  type Overview,
  type ReportStatus,
  type SupportMessage,
  type TabKey
} from "./_components/types";

const TAB_LABEL: Record<TabKey, string> = {
  resumen: "Resumen",
  reclamos: "Reclamos",
  denuncias: "Denuncias",
  pedidos: "Pedidos",
  usuarios: "Usuarios",
  soporte: "Soporte",
  auditoria: "Auditoría"
};

const post = (path: string, body: unknown = {}, method = "POST") =>
  apiFetch(path, { method, body: JSON.stringify(body) });

/** Ejecuta una acción del panel: bloquea los botones, muestra el error en la tarjeta y recarga */
function useAction(reload: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    try {
      await action();
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

export default function AdminPageWrapper() {
  return (
    <Suspense>
      <AdminPage />
    </Suspense>
  );
}

function AdminPage() {
  const { user, loading } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("tab") ?? "";
  const alias: Record<string, TabKey> = { disputes: "reclamos", reports: "denuncias", orders: "pedidos", users: "usuarios", support: "soporte" };
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(raw) ? (raw as TabKey) : alias[raw] ?? "resumen";
  const overview = useAdminData<Overview>("/api/admin/overview");

  if (loading) return <div className="mx-auto max-w-6xl px-4 py-16"><Loading /></div>;
  if (!user || user.role !== "ADMIN") {
    // No revelamos que el panel existe
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Página no encontrada</h1>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white">
          Volver al inicio
        </Link>
      </div>
    );
  }

  const counts = overview.data?.counts;
  const pending: Partial<Record<TabKey, number>> = {
    reclamos: counts?.openDisputes,
    denuncias: counts?.openReports,
    soporte: counts?.openSupport
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold text-slate-900">🛡️ Moderación y operaciones</h1>
      <nav aria-label="Secciones del panel" className="mt-4 flex gap-1.5 overflow-x-auto pb-2">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? "page" : undefined}
            onClick={() => router.replace(`/admin?tab=${key}`)}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === key ? "bg-purple-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {TAB_LABEL[key]}
            {pending[key] ? (
              <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${tab === key ? "bg-white text-purple-700" : "bg-rose-600 text-white"}`}>
                {pending[key]}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="mt-4 space-y-4">
        {tab === "resumen" && <OverviewTab state={overview} />}
        {tab === "reclamos" && <DisputesTab onChange={overview.reload} />}
        {tab === "denuncias" && <ReportsTab onChange={overview.reload} />}
        {tab === "pedidos" && <OrdersTab />}
        {tab === "usuarios" && <UsersTab />}
        {tab === "soporte" && <SupportTab onChange={overview.reload} />}
        {tab === "auditoria" && <AuditTab />}
      </div>
    </div>
  );
}

// ───────────────────────── Resumen ─────────────────────────
function Stat({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${alert ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${alert ? "text-rose-700" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function OverviewTab({ state }: { state: ReturnType<typeof useAdminData<Overview>> }) {
  const [jobs, setJobs] = useState<JobsResult | null>(null);
  const action = useAction(state.reload);
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />;
  if (!state.data) return <Loading />;
  const { counts, money: m, launchChecklist, rules, environment, ordersByStatus } = state.data;
  const missing = launchChecklist.filter((c) => !c.ok).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Reclamos abiertos" value={counts.openDisputes} alert={counts.openDisputes > 0} />
        <Stat label="Denuncias abiertas" value={counts.openReports} alert={counts.openReports > 0} />
        <Stat label="Soporte sin responder" value={counts.openSupport} alert={counts.openSupport > 0} />
        <Stat label="Entregas atrasadas" value={counts.overdueOrders} alert={counts.overdueOrders > 0} />
        <Stat label="Usuarios" value={counts.users} />
        <Stat label="Artistas" value={counts.artists} />
        <Stat label="Pedidos en curso" value={counts.activeOrders} />
        <Stat label="Pedidos completados" value={counts.completedOrders} />
        <Stat label="Pagado por compradores" value={money(m.gmv)} />
        <Stat label="Comisión cobrada" value={money(m.fees)} />
        <Stat label="Pagado (30 días)" value={money(m.gmv30d)} />
        <Stat label="Comisión (30 días)" value={money(m.fees30d)} />
      </div>

      <Card>
        <TabHeader
          title={missing === 0 ? "✅ Configuración lista para operar" : `⚠️ Faltan ${missing} cosas para abrir al público`}
          description={`Entorno: ${environment.production ? "producción" : "desarrollo"} · pagos ${environment.paymentsMode} · archivos ${environment.storage} · versión ${environment.version}`}
        />
        <ul className="mt-4 space-y-2">
          {launchChecklist.map((c) => (
            <li key={c.key} className="flex gap-3 text-sm">
              <span aria-hidden>{c.ok ? "✅" : "⚠️"}</span>
              <span>
                <span className="font-semibold text-slate-900">{c.label}</span>
                {!c.ok && <span className="block text-xs text-slate-500">{c.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-slate-900">Pedidos por estado</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {Object.entries(ordersByStatus).map(([status, n]) => (
              <li key={status} className="flex justify-between">
                <span className="text-slate-700">{STATUS_LABEL[status] ?? status}</span>
                <span className="font-bold text-slate-900">{n}</span>
              </li>
            ))}
            {Object.keys(ordersByStatus).length === 0 && <li className="text-slate-500">Todavía no hay pedidos.</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-slate-900">Reglas vigentes</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Comisión">{rules.platformFeePercent}%</Field>
            <Field label="Pago inicial">{rules.depositExpirationHours} hs</Field>
            <Field label="Solicitud sin respuesta">{rules.requestExpirationDays} días</Field>
            <Field label="Aprobación automática">{rules.reviewAutoApproveDays} días</Field>
            <Field label="Pago intermedio">{rules.paymentTimeoutDays} días</Field>
            <Field label="Reclamo tras la entrega">{rules.postDeliveryDisputeDays} días</Field>
          </dl>
          <button
            type="button"
            disabled={action.busy}
            className={`${BTN.secondary} mt-5`}
            onClick={() => action.run(async () => setJobs((await post("/api/admin/jobs/run", { job: "all" })) as JobsResult))}
          >
            {action.busy ? "Corriendo…" : "Correr plazos y limpieza ahora"}
          </button>
          <InlineError message={action.error} />
          {jobs && (
            <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-50 p-3 text-[11px] text-slate-700">
              {JSON.stringify({ plazos: jobs.timers, limpieza: jobs.cleanup }, null, 2)}
            </pre>
          )}
        </Card>
      </div>
    </>
  );
}

// ───────────────────────── Reclamos ─────────────────────────
const OPENER: Record<string, string> = { BUYER: "el comprador", ARTIST: "el artista", SYSTEM: "TuPuestito (automático)" };

function DisputesTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<"OPEN" | "RESOLVED">("OPEN");
  const { data, error, loading, reload } = useAdminData<{ disputes: AdminDispute[] }>(`/api/admin/disputes?status=${status}`);
  const refresh = () => {
    reload();
    onChange();
  };
  return (
    <>
      <TabHeader
        title="Reclamos"
        description="TuPuestito no mueve dinero: el reembolso lo emite el artista o lo decide Mercado Pago. Acá decidís si el pedido sigue, se cancela o se da por completado."
      >
        <Segmented label="Estado" value={status} onChange={setStatus} options={[{ value: "OPEN", label: "Abiertos" }, { value: "RESOLVED", label: "Resueltos" }]} />
      </TabHeader>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && loading && <Loading />}
      {data?.disputes.length === 0 && <Empty title={status === "OPEN" ? "No hay reclamos abiertos 🎉" : "Todavía no hay reclamos resueltos"} />}
      {data?.disputes.map((d) => <DisputeCard key={d.id} dispute={d} reload={refresh} />)}
    </>
  );
}

function DisputeCard({ dispute: d, reload }: { dispute: AdminDispute; reload: () => void }) {
  const [note, setNote] = useState("");
  const action = useAction(reload);
  const canComplete = d.order.hasFinalDelivery && d.order.paidAmount >= d.order.totalAmount;
  const resolve = (act: "RESUME" | "CANCEL" | "COMPLETE", confirmText?: string) =>
    action.run(() => post(`/api/admin/disputes/${d.id}/resolve`, { action: act, note }), confirmText);
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-400">#{d.order.orderNumber}</span>
        <Badge tone={d.status === "OPEN" ? "rose" : "emerald"}>{d.status === "OPEN" ? "Abierto" : "Resuelto"}</Badge>
        {d.hasProposal && <Badge tone="amber">Propuesta pendiente del comprador</Badge>}
        <span className="text-xs text-slate-500">{timeAgo(d.createdAt)}</span>
        <Link href={`/orders/${d.order.id}`} className={`${BTN.link} ml-auto`}>
          Abrir sala del pedido →
        </Link>
      </div>
      <h3 className="mt-2 font-bold text-slate-900">{d.order.serviceTitle}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Artista">@{d.order.artistUsername}</Field>
        <Field label="Comprador">@{d.order.buyerUsername}</Field>
        <Field label="Pagado / total">{money(d.order.paidAmount)} / {money(d.order.totalAmount)}</Field>
        <Field label="Estaba en">{STATUS_LABEL[d.statusBefore] ?? d.statusBefore}</Field>
      </dl>
      <p className="mt-3 text-sm text-slate-700">
        <strong>Lo abrió {OPENER[d.openerRole]}:</strong> {d.reasonLabel}.
      </p>
      <p className="mt-1 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{d.description}</p>

      {d.status === "RESOLVED" ? (
        <p className="mt-3 text-xs text-slate-500">
          Resuelto {formatDateTime(toDate(d.resolvedAt))}: {d.resolution}
          {d.resolutionNote ? ` — ${d.resolutionNote}` : ""}
        </p>
      ) : (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <label htmlFor={`note-${d.id}`} className="text-xs font-bold text-slate-700">
            Nota para las partes (se publica en el hilo del pedido)
          </label>
          <textarea id={`note-${d.id}`} rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className={`${INPUT} mt-1`} />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={action.busy} className={BTN.primary} onClick={() => resolve("RESUME")}>
              El pedido continúa
            </button>
            <button
              type="button"
              disabled={action.busy}
              className={BTN.danger}
              onClick={() => resolve("CANCEL", "¿Cancelar el pedido? No se mueve dinero: el reembolso lo emite el artista o lo decide Mercado Pago.")}
            >
              Cancelar el pedido
            </button>
            <button
              type="button"
              disabled={action.busy || !canComplete}
              title={canComplete ? undefined : "Solo si hay entrega final y el pedido está 100% pago"}
              className={BTN.success}
              onClick={() => resolve("COMPLETE", "¿Dar el pedido por completado? El comprador va a poder descargar el original.")}
            >
              Dar por completado
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Continúa: vuelve al estado anterior. Cancelar: cierra el pedido sin mover dinero. Completado: libera el original (requiere entrega final y 100% pago).
          </p>
          <InlineError message={action.error} />
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── Denuncias ─────────────────────────
function ReportsTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<ReportStatus>("OPEN");
  const { data, error, loading, reload } = useAdminData<{ reports: AdminReport[] }>(`/api/admin/reports?status=${status}`);
  const refresh = () => {
    reload();
    onChange();
  };
  return (
    <>
      <TabHeader title="Denuncias" description="Prioridad absoluta: contenido ilegal o sexualización de menores. En esos casos eliminá la obra (borra el archivo) y suspendé la cuenta.">
        <Segmented
          label="Estado"
          value={status}
          onChange={setStatus}
          options={[{ value: "OPEN", label: "Abiertas" }, { value: "RESOLVED", label: "Resueltas" }, { value: "DISMISSED", label: "Desestimadas" }]}
        />
      </TabHeader>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && loading && <Loading />}
      {data?.reports.length === 0 && <Empty title="No hay denuncias en esta lista" />}
      {data?.reports.map((r) => <ReportCard key={r.id} report={r} reload={refresh} />)}
    </>
  );
}

function ReportCard({ report: r, reload }: { report: AdminReport; reload: () => void }) {
  const [note, setNote] = useState("");
  const action = useAction(reload);
  const urgent = r.reason === "ILLEGAL_CONTENT" || r.reason === "MINOR_SAFETY";
  const hidden = Boolean(r.target.hidden);
  const needReason = () => {
    if (note.trim().length >= 5) return true;
    window.alert("Escribí el motivo en la nota (mínimo 5 caracteres).");
    return false;
  };
  return (
    <Card className={urgent && r.status === "OPEN" ? "border-rose-300" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={urgent ? "rose" : "amber"}>{urgent ? "🚨 " : ""}{r.reasonLabel}</Badge>
        {hidden && <Badge tone="slate">Ya oculto / suspendido</Badge>}
        <span className="text-xs text-slate-500">
          {timeAgo(r.createdAt)} · denunció @{r.reporterUsername ?? "cuenta eliminada"}
        </span>
      </div>
      <div className="mt-3 flex gap-4">
        {r.target.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolveImageUrl(r.target.imageUrl)} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
        )}
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{r.target.label}</p>
          {r.artistUsername && (
            <Link href={`/u/${r.artistUsername}`} className={BTN.link}>
              Puestito de @{r.artistUsername} →
            </Link>
          )}
          {r.target.text && <p className="mt-1 line-clamp-3 text-xs text-slate-600">{r.target.text}</p>}
          {r.details && <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{r.details}</p>}
        </div>
      </div>

      {r.status !== "OPEN" ? (
        <p className="mt-3 text-xs text-slate-500">
          Cerrada {formatDateTime(toDate(r.resolvedAt))}
          {r.resolutionNote ? ` — ${r.resolutionNote}` : ""}
        </p>
      ) : (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <label htmlFor={`rnote-${r.id}`} className="text-xs font-bold text-slate-700">
            Nota / motivo (se le informa al artista si tomás una medida)
          </label>
          <input id={`rnote-${r.id}`} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={`${INPUT} mt-1`} />
          <div className="mt-3 flex flex-wrap gap-2">
            {r.targetType === "PORTFOLIO_ITEM" && (
              <>
                <button type="button" disabled={action.busy} className={BTN.secondary} onClick={() => action.run(() => post(`/api/admin/portfolio/${r.targetId}/hide`, { hidden: !hidden, reason: note }))}>
                  {hidden ? "Volver a mostrar la obra" : "Ocultar la obra"}
                </button>
                <button
                  type="button"
                  disabled={action.busy}
                  className={BTN.dangerOutline}
                  onClick={() => needReason() && action.run(() => post(`/api/admin/portfolio/${r.targetId}`, { reason: note }, "DELETE"), "¿Eliminar la obra y su archivo para siempre? No se puede deshacer.")}
                >
                  Eliminar la obra
                </button>
              </>
            )}
            {r.targetType === "SERVICE" && (
              <button type="button" disabled={action.busy} className={BTN.secondary} onClick={() => action.run(() => post(`/api/admin/services/${r.targetId}/moderate`, { hidden: !hidden, reason: note }))}>
                {hidden ? "Levantar la medida" : "Despublicar la comisión"}
              </button>
            )}
            {r.targetType === "REVIEW" && (
              <button type="button" disabled={action.busy} className={BTN.secondary} onClick={() => action.run(() => post(`/api/admin/reviews/${r.targetId}/hide`, { hidden: !hidden, reason: note }))}>
                {hidden ? "Volver a mostrar la reseña" : "Ocultar la reseña"}
              </button>
            )}
            {r.targetType === "ORDER" && (
              <Link href={`/orders/${r.targetId}`} className={BTN.secondary}>
                Abrir el pedido
              </Link>
            )}
            {r.artistUserId && !(r.targetType === "ARTIST" && hidden) && (
              <button
                type="button"
                disabled={action.busy}
                className={BTN.dangerOutline}
                onClick={() => needReason() && action.run(() => post(`/api/admin/users/${r.artistUserId}/suspend`, { reason: note }), `¿Suspender a @${r.artistUsername}? Se cancelan sus pedidos sin pagar y los pagos pasan a reclamo.`)}
              >
                Suspender la cuenta
              </button>
            )}
            <span className="grow" />
            <button type="button" disabled={action.busy} className={BTN.secondary} onClick={() => action.run(() => post(`/api/admin/reports/${r.id}/resolve`, { status: "DISMISSED", note }))}>
              Desestimar
            </button>
            <button type="button" disabled={action.busy} className={BTN.primary} onClick={() => action.run(() => post(`/api/admin/reports/${r.id}/resolve`, { status: "RESOLVED", note }))}>
              Marcar resuelta
            </button>
          </div>
          <InlineError message={action.error} />
        </div>
      )}
    </Card>
  );
}

// ───────────────────────── Pedidos ─────────────────────────
function SearchBox({ onSearch, placeholder }: { onSearch: (q: string) => void; placeholder: string }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value.trim());
      }}
      className="flex gap-2"
    >
      <input type="search" aria-label={placeholder} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className={INPUT} />
      <button type="submit" className={BTN.secondary}>
        Buscar
      </button>
    </form>
  );
}

function OrdersTab() {
  const [filter, setFilter] = useState("active");
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useAdminData<{ orders: AdminOrder[] }>(`/api/admin/orders?filter=${filter}&q=${encodeURIComponent(q)}`);
  return (
    <>
      <TabHeader title="Pedidos" description="Hasta 100 resultados, del más reciente al más antiguo.">
        <Segmented
          label="Filtro"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: "En curso" },
            { value: "disputed", label: "En reclamo" },
            { value: "overdue", label: "Atrasados" },
            { value: "unpaid", label: "Pago vencido" },
            { value: "all", label: "Todos" }
          ]}
        />
      </TabHeader>
      <SearchBox onSearch={setQ} placeholder="Número de pedido o @usuario" />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && loading && <Loading />}
      {data?.orders.length === 0 && <Empty title="No hay pedidos con ese filtro" />}
      {data && data.orders.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                {["Pedido", "Estado", "Artista", "Comprador", "Total", "En este estado", "Entrega estimada"].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => {
                const due = toDate(o.workDueAt);
                return (
                  <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/orders/${o.id}`} className="font-bold text-purple-700 hover:underline">#{o.orderNumber}</Link>
                      <span className="block max-w-[220px] truncate text-xs text-slate-500">{o.serviceTitle}</span>
                    </td>
                    <td className="px-4 py-3"><Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status] ?? o.status}</Badge></td>
                    <td className="px-4 py-3">@{o.artistUsername}</td>
                    <td className="px-4 py-3">@{o.buyerUsername}</td>
                    <td className="px-4 py-3 font-semibold">{money(o.totalAmount)}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{timeAgo(o.statusChangedAt)}</td>
                    <td className={`px-4 py-3 text-xs ${due && due < new Date() ? "font-bold text-rose-600" : "text-slate-600"}`}>{due ? timeAgo(due) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

// ───────────────────────── Usuarios ─────────────────────────
function UsersTab() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useAdminData<{ users: AdminUser[] }>(`/api/admin/users?filter=${filter}&q=${encodeURIComponent(q)}`);
  return (
    <>
      <TabHeader title="Usuarios" description="Para sumar a alguien al equipo: agregá su email a ADMIN_EMAILS (tiene que tener el email verificado).">
        <Segmented
          label="Filtro"
          value={filter}
          onChange={setFilter}
          options={[{ value: "all", label: "Todos" }, { value: "artists", label: "Artistas" }, { value: "suspended", label: "Suspendidos" }, { value: "admins", label: "Equipo" }]}
        />
      </TabHeader>
      <SearchBox onSearch={setQ} placeholder="Nombre, @usuario o email" />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && loading && <Loading />}
      {data?.users.length === 0 && <Empty title="No se encontraron usuarios" />}
      {data?.users.map((u) => <UserCard key={u.id} user={u} reload={reload} />)}
    </>
  );
}

function UserCard({ user: u, reload }: { user: AdminUser; reload: () => void }) {
  const [reason, setReason] = useState("");
  const action = useAction(reload);
  const canModerate = u.role !== "ADMIN" && !u.deletedAt;
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-slate-900">{u.name}</span>
        <span className="text-sm text-slate-500">@{u.username}</span>
        <Badge tone={u.role === "ADMIN" ? "purple" : u.role === "ARTIST" ? "indigo" : "slate"}>{u.role === "ADMIN" ? "Equipo" : u.role === "ARTIST" ? "Artista" : "Comprador"}</Badge>
        {!u.emailVerified && <Badge tone="amber">Email sin verificar</Badge>}
        {u.isVerifiedHuman && <Badge tone="emerald">100% Humano</Badge>}
        {u.suspendedAt && <Badge tone="rose">Suspendida</Badge>}
        {u.deletedAt && <Badge tone="slate">Eliminada</Badge>}
        {u.artistId && !u.deletedAt && (
          <Link href={`/u/${u.username}`} className={`${BTN.link} ml-auto`}>
            Ver puestito →
          </Link>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {u.email} · desde {formatDateTime(toDate(u.createdAt))}
        {u.suspensionReason ? ` · Motivo de la suspensión: ${u.suspensionReason}` : ""}
      </p>
      {canModerate && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {u.artistId && (
            <button type="button" disabled={action.busy} className={BTN.secondary} onClick={() => action.run(() => post(`/api/admin/artists/${u.artistId}/verify-human`, { verified: !u.isVerifiedHuman }))}>
              {u.isVerifiedHuman ? "Quitar insignia 100% Humano" : "Dar insignia 100% Humano"}
            </button>
          )}
          {u.suspendedAt ? (
            <button type="button" disabled={action.busy} className={BTN.success} onClick={() => action.run(() => post(`/api/admin/users/${u.id}/unsuspend`, {}))}>
              Reactivar la cuenta
            </button>
          ) : (
            <>
              <input aria-label={`Motivo para suspender a ${u.username}`} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de la suspensión" className={`${INPUT} max-w-xs`} />
              <button
                type="button"
                disabled={action.busy || reason.trim().length < 5}
                className={BTN.dangerOutline}
                onClick={() => action.run(() => post(`/api/admin/users/${u.id}/suspend`, { reason }), `¿Suspender a @${u.username}? Se cancelan sus pedidos sin pagar y los que tienen pagos pasan a reclamo.`)}
              >
                Suspender
              </button>
            </>
          )}
        </div>
      )}
      <InlineError message={action.error} />
    </Card>
  );
}

// ───────────────────────── Soporte ─────────────────────────
const KIND_LABEL: Record<string, string> = { CONTACT: "Consulta", ARREPENTIMIENTO: "Botón de arrepentimiento", DATA_REQUEST: "Datos personales" };

function SupportTab({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const { data, error, loading, reload } = useAdminData<{ messages: SupportMessage[] }>(`/api/admin/support?status=${status}`);
  const refresh = () => {
    reload();
    onChange();
  };
  return (
    <>
      <TabHeader title="Soporte" description="Respondé por email (el link ya arma el asunto con el código) y después cerrá la gestión acá.">
        <Segmented label="Estado" value={status} onChange={setStatus} options={[{ value: "OPEN", label: "Abiertas" }, { value: "CLOSED", label: "Cerradas" }]} />
      </TabHeader>
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && loading && <Loading />}
      {data?.messages.length === 0 && <Empty title="No hay gestiones en esta lista" />}
      {data?.messages.map((m) => <SupportCard key={m.id} message={m} reload={refresh} />)}
    </>
  );
}

function SupportCard({ message: m, reload }: { message: SupportMessage; reload: () => void }) {
  const [note, setNote] = useState("");
  const action = useAction(reload);
  const regret = m.kind === "ARREPENTIMIENTO";
  return (
    <Card className={regret && m.status === "OPEN" ? "border-amber-300" : ""}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-bold text-slate-700">{m.code}</span>
        <Badge tone={regret ? "amber" : "sky"}>{KIND_LABEL[m.kind]}</Badge>
        {m.orderNumber && <Badge>#{m.orderNumber}</Badge>}
        <span className="text-xs text-slate-500">{timeAgo(m.createdAt)}</span>
      </div>
      {regret && m.status === "OPEN" && <p className="mt-2 text-xs font-bold text-amber-800">Hay que responderle dentro de las 24 hs de recibido.</p>}
      <p className="mt-2 text-sm text-slate-800">
        <strong>{m.name}</strong> ·{" "}
        <a href={`mailto:${m.email}?subject=${encodeURIComponent(`[${m.code}] TuPuestito`)}`} className="text-purple-700 underline">
          {m.email}
        </a>
      </p>
      <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{m.message || "(sin mensaje)"}</p>
      {m.status === "CLOSED" ? (
        <p className="mt-3 text-xs text-slate-500">
          Cerrada {formatDateTime(toDate(m.handledAt))}
          {m.adminNote ? ` — ${m.adminNote}` : ""}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <input aria-label="Nota interna" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Nota interna: qué se respondió" className={`${INPUT} max-w-md`} />
          <button type="button" disabled={action.busy} className={BTN.primary} onClick={() => action.run(() => post(`/api/admin/support/${m.id}/close`, { note }))}>
            Marcar como respondida
          </button>
        </div>
      )}
      <InlineError message={action.error} />
    </Card>
  );
}

// ───────────────────────── Auditoría ─────────────────────────
function AuditTab() {
  const { data, error, loading, reload } = useAdminData<{ actions: AuditAction[] }>("/api/admin/audit");
  return (
    <>
      <TabHeader title="Auditoría" description="Las últimas 200 acciones del equipo de moderación." />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {!data && loading && <Loading />}
      {data?.actions.length === 0 && <Empty title="Todavía no hay acciones registradas" />}
      {data && data.actions.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                {["Fecha", "Quién", "Acción", "Sobre", "Nota"].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.actions.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatDateTime(toDate(a.createdAt))}</td>
                  <td className="px-4 py-3">@{a.adminUsername ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.action}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {a.targetType}
                    {typeof a.metadata?.orderNumber === "string" ? ` #${a.metadata.orderNumber}` : typeof a.metadata?.username === "string" ? ` @${a.metadata.username}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{a.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

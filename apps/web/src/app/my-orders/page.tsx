"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, formatDate, planSummary, STATUS_LABEL, TERMINAL_STATUSES } from "../../lib/api";
import { useMe } from "../../lib/useMe";

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "done">("active");
  const { user, loading: userLoading } = useMe();

  useEffect(() => {
    if (!user) return;
    apiFetch<{ orders: any[] }>("/api/orders")
      .then((res) => setOrders(res.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (userLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-16 text-center text-slate-500">Cargando...</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Iniciá sesión para ver tus pedidos</h1>
        <p className="mt-2 text-sm text-slate-600">Acá vas a encontrar el seguimiento de tus comisiones compradas o vendidas.</p>
        <Link href="/login?next=/my-orders" className="mt-6 inline-block rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white">
          Iniciar Sesión
        </Link>
      </div>
    );
  }

  const needsAttention = (o: any) => o.awaitingMe || o.unread || o.status === "DISPUTED";
  const active = orders.filter((o) => !TERMINAL_STATUSES.includes(o.status)).sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)));
  const done = orders.filter((o) => TERMINAL_STATUSES.includes(o.status));
  const shown = tab === "active" ? active : done;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-extrabold text-slate-900">Mis Pedidos</h1>
      <p className="text-sm text-slate-600">Seguimiento de entregas, pagos y descargas de tus comisiones.</p>

      <div role="tablist" className="mt-5 flex gap-2">
        {(
          [
            ["active", `En curso (${active.length})`],
            ["done", `Finalizados (${done.length})`]
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? "bg-purple-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">Cargando tus pedidos...</div>
      ) : shown.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-base font-bold text-slate-800">{tab === "active" ? "No tenés pedidos en curso" : "Todavía no tenés pedidos finalizados"}</p>
          <p className="mt-1 text-sm text-slate-500">Explorá los puestitos de artistas argentinos o compartí el link del tuyo.</p>
          <Link href="/" className="mt-5 inline-block rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white">
            Explorar Puestitos
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {shown.map((order) => {
            const isArtist = order.role === "ARTIST";
            const due = order.workDueAt ? new Date(order.workDueAt) : null;
            return (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                  needsAttention(order) && tab === "active" ? "border-purple-400" : "border-slate-200 hover:border-purple-300"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-400">#{order.orderNumber}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${order.status === "DISPUTED" ? "bg-amber-100 text-amber-800" : "bg-purple-50 text-purple-700"}`}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                    {order.awaitingMe && <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">Te toca a vos</span>}
                    {order.unread && <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white">Novedades</span>}
                  </div>
                  <p className="mt-1.5 text-sm font-bold text-slate-900">
                    {order.serviceTitle} · {isArtist ? `para @${order.buyerUsername}` : `con @${order.artistUsername}`}
                  </p>
                  <p className="mt-1 line-clamp-1 text-xs text-slate-600">{order.buyerBrief}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {isArtist ? "Sos el artista" : "Sos el comprador"} · {planSummary(order.paymentPlanSnapshot)} · creado el {formatDate(order.createdAt)}
                    {due && (
                      <span className={due < new Date() ? "font-bold text-amber-700" : ""}>
                        {" "}· {due < new Date() ? "Entrega atrasada" : `Entrega estimada ${formatDate(due)}`}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-extrabold text-slate-900">
                    ${Number(order.totalAmount).toLocaleString("es-AR")} {order.currency}
                  </p>
                  <span className="mt-1 inline-block text-xs font-semibold text-purple-600">Abrir sala del pedido →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

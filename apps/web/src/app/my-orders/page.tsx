"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, PLAN_LABEL, STATUS_LABEL } from "../../lib/api";
import { useMe } from "../../lib/useMe";

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
        <p className="mt-2 text-sm text-slate-600">
          Aquí vas a encontrar el seguimiento en tiempo real de tus comisiones compradas o vendidas.
        </p>
        <Link href="/login?next=/my-orders" className="mt-6 inline-block rounded-xl bg-purple-600 px-6 py-3 text-sm font-bold text-white">
          Iniciar Sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Mis Pedidos de Comisión</h1>
          <p className="text-sm text-slate-600">
            Seguimiento de bocetos, pagos por hitos y descargas HD sin marca de agua.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          Cargando tus pedidos...
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-base font-bold text-slate-800">Todavía no tenés pedidos activos</p>
          <p className="mt-1 text-sm text-slate-500">
            Explorá los puestos de artistas argentinos verificados o compartí el link de tu puesto.
          </p>
          <Link
            href="/"
            className="mt-5 inline-block rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white"
          >
            Explorar Puestos
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-purple-300 hover:shadow-md"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">#{order.orderNumber || order.id.slice(0, 8)}</span>
                  <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-purple-700">
                    {STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-bold text-slate-900">
                  {order.serviceTitle} • Artista: @{order.artistUsername} / Comprador: @{order.buyerUsername}
                </p>
                <p className="mt-1 line-clamp-1 text-xs text-slate-600">{order.buyerBrief}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Creado el {new Date(order.createdAt).toLocaleDateString("es-AR")} • Plan:{" "}
                  <strong>{PLAN_LABEL[order.paymentPlanSnapshot] ?? order.paymentPlanSnapshot}</strong> • Sos {order.role === "ARTIST" ? "el artista" : "el comprador"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold text-slate-900">
                  ${Number(order.totalAmount).toLocaleString("es-AR")} {order.currency}
                </p>
                <span className="mt-1 inline-block text-xs font-semibold text-purple-600">
                  Abrir sala del pedido →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

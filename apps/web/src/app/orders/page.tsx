"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../lib/api";
import { ShoppingBag, Clock } from "lucide-react";

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi("/orders")
      .then((res) => setOrders(res.orders || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-24 text-neutral-400">Cargando tus pedidos... ✨</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-neutral-900">Mis Pedidos y Comisiones 🛍️</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Seguí el estado de tus comisiones pedidas, revisá bocetos y descargá tus obras finales.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-2xl border border-neutral-200 space-y-3">
          <ShoppingBag className="w-12 h-12 text-neutral-300 mx-auto" />
          <p className="text-neutral-600 font-medium">Aún no realizaste ningún pedido de comisión.</p>
          <Link
            href="/"
            className="inline-block mt-2 bg-purple-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow"
          >
            Explorar Artistas y Puestitos
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-200 divide-y divide-neutral-100 shadow-sm overflow-hidden">
          {orders.map((o) => (
            <div key={o.id} className="p-5 flex items-center justify-between hover:bg-neutral-50 transition">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-neutral-900">#{o.orderNumber}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                    {o.status}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Monto Total: <strong>${o.totalAmount.toLocaleString("es-AR")} ARS</strong> • Fecha:{" "}
                  {new Date(o.createdAt).toLocaleDateString()}
                </p>
              </div>

              <Link
                href={`/orders/${o.id}`}
                className="text-xs font-bold bg-neutral-900 text-white px-4 py-2 rounded-xl hover:bg-neutral-800 transition shadow-sm"
              >
                Abrir Sala del Pedido →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


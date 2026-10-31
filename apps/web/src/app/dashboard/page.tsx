"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "../../lib/api";
import {
  Plus,
  CreditCard,
  Image,
  Layers,
  Settings,
  CheckCircle,
  ExternalLink,
  DollarSign
} from "lucide-react";

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [mpStatus, setMpStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Formulario nuevo servicio
  const [showNewService, setShowNewService] = useState(false);
  const [serviceTitle, setServiceTitle] = useState("");
  const [serviceDesc, setServiceDesc] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [servicePlan, setServicePlan] = useState("SPLIT_ON_SKETCH");
  const [serviceDays, setServiceDays] = useState("14");

  const loadData = async () => {
    try {
      const me = await fetchApi("/auth/me");
      setProfile(me.artistProfile);

      const ord = await fetchApi("/orders");
      setOrders(ord.orders || []);

      const mp = await fetchApi("/payments/status");
      setMpStatus(mp.mercadopago);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConnectMp = async () => {
    try {
      await fetchApi("/payments/connect-mp", {
        method: "POST",
        body: JSON.stringify({ mockToken: "APP_USR_MOCK_DEMO_TOKEN_123" })
      });
      alert("¡Cuenta de Mercado Pago vinculada exitosamente con Split de Pagos!");
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi("/artists/services", {
        method: "POST",
        body: JSON.stringify({
          title: serviceTitle,
          description: serviceDesc,
          priceArs: Number(servicePrice),
          paymentPlan: servicePlan,
          turnaroundDays: Number(serviceDays)
        })
      });
      setShowNewService(false);
      setServiceTitle("");
      setServiceDesc("");
      setServicePrice("");
      alert("¡Servicio de comisión creado!");
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="text-center py-24 text-neutral-400">Cargando panel... ✨</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-neutral-900">Panel de Control: Mi Puestito 🎪</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Gestioná tus comisiones, configurá tu Mercado Pago split y subí obras a tu portfolio.
          </p>
        </div>

        {profile && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowNewService(true)}
              className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow transition"
            >
              <Plus className="w-4 h-4" /> Nueva Comisión
            </button>
          </div>
        )}
      </div>

      {/* Checklist Onboarding & Mercado Pago Split */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Mercado Pago Card */}
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <CreditCard className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-900 text-base">Cobros en Pesos (Mercado Pago)</h3>
              <p className="text-xs text-neutral-500">Split 1:1 donde el 95% va directo a tu cuenta bancaria/MP.</p>
            </div>
          </div>

          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 flex items-center justify-between">
            <div className="text-xs">
              <span className="font-bold block text-neutral-800">
                Estado: {mpStatus?.connected ? "✅ Conectado y Activo" : "❌ No vinculado"}
              </span>
              <span className="text-neutral-500">
                {mpStatus?.connected
                  ? `Seller ID: ${mpStatus.providerUserId}`
                  : "Conectá tu cuenta para poder recibir comisiones."}
              </span>
            </div>

            {!mpStatus?.connected ? (
              <button
                onClick={handleConnectMp}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition"
              >
                Vincular Mercado Pago
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                Listo para cobrar
              </span>
            )}
          </div>
        </div>

        {/* Marca de Agua Card */}
        <div className="bg-white p-6 rounded-2xl border border-neutral-200 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-neutral-900 text-base">Protección y Marca de Agua</h3>
              <p className="text-xs text-neutral-500">Protegé tus bocetos y previews automáticamente con Sharp.</p>
            </div>
          </div>

          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-100 text-xs text-neutral-600 space-y-1">
            <p>
              Modo actual: <strong>{profile?.defaultWatermarkMode || "AUTO_TEXT"}</strong>
            </p>
            <p className="text-neutral-400">
              Estampa un patrón en diagonal sobre tus bocetos para que los clientes no puedan robar la muestra antes de pagar.
            </p>
          </div>
        </div>
      </div>

      {/* Modal / Formulario Nueva Comisión */}
      {showNewService && (
        <div className="bg-white p-6 rounded-2xl border-2 border-purple-300 shadow-md space-y-4">
          <h3 className="font-bold text-base text-neutral-900">Crear Nuevo Tipo de Comisión</h3>
          <form onSubmit={handleCreateService} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1">
              <label className="font-bold text-neutral-700">Título del servicio</label>
              <input
                required
                placeholder="Ej: Busto Full Color"
                value={serviceTitle}
                onChange={(e) => setServiceTitle(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-700">Precio en Pesos (ARS)</label>
              <input
                required
                type="number"
                placeholder="35000"
                value={servicePrice}
                onChange={(e) => setServicePrice(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-700">Modalidad de Cobro</label>
              <select
                value={servicePlan}
                onChange={(e) => setServicePlan(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-neutral-300"
              >
                <option value="SPLIT_ON_SKETCH">50% Seña / 50% al aprobar boceto (Recomendado)</option>
                <option value="SPLIT_ON_FINAL_PREVIEW">50% Seña / 50% al aprobar vista previa final</option>
                <option value="FULL_100">100% por adelantado</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-neutral-700">Días estimados de entrega</label>
              <input
                type="number"
                value={serviceDays}
                onChange={(e) => setServiceDays(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="font-bold text-neutral-700">Descripción detallada</label>
              <textarea
                rows={2}
                placeholder="Qué incluye, fondo, estilo, restricciones..."
                value={serviceDesc}
                onChange={(e) => setServiceDesc(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-neutral-300"
              />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewService(false)}
                className="px-4 py-2 rounded-lg bg-neutral-100 font-bold"
              >
                Cancelar
              </button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-purple-600 text-white font-bold">
                Guardar Comisión
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de Pedidos del Artista */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-4">
        <h3 className="font-bold text-base text-neutral-900">Pedidos y Encargos Recibidos ({orders.length})</h3>

        {orders.length === 0 ? (
          <p className="text-neutral-400 text-center py-8 text-xs">Aún no recibiste pedidos de comisiones.</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {orders.map((o: any) => (
              <div key={o.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-neutral-800">#{o.orderNumber}</span>
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                      {o.status}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Total: ${o.totalAmount.toLocaleString("es-AR")} ARS • {new Date(o.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <Link
                  href={`/orders/${o.id}`}
                  className="text-xs font-bold bg-neutral-900 text-white px-3.5 py-1.5 rounded-lg hover:bg-neutral-800 transition"
                >
                  Abrir Sala →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


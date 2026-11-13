"use client";

import { useState } from "react";
import Link from "next/link";
import { DISPUTE_RESOLUTION_LABEL, apiFetch, formatDate, formatDateTime, money } from "@/lib/api";
import { ReportButton } from "@/components/ReportButton";

export interface OrderDispute {
  id: string;
  status: "OPEN" | "RESOLVED";
  reasonLabel: string;
  description: string;
  openerRole: "BUYER" | "ARTIST" | "SYSTEM";
  openedByMe: boolean;
  createdAt: string;
  proposal: { paymentIds: string[]; amount: number; proposedAt: string } | null;
  resolution: string | null;
  resolutionNote: string | null;
}

export interface OrderPermissions {
  canOpenDispute: boolean;
  disputeReasons: { value: string; label: string }[];
  canWithdrawDispute: boolean;
  canRefund: boolean;
  canProposePartialRefund: boolean;
  canAnswerProposal: boolean;
  canCloseUnpaid: boolean;
}

export interface OrderDeadlines {
  depositExpiresAt: string | null;
  requestExpiresAt: string | null;
  reviewAutoApproveAt: string | null;
  paymentTimeoutAt: string | null;
  workDueAt: string | null;
  disputeWindowEndsAt: string | null;
}

interface PaymentRow {
  id: string;
  stage: string;
  milestoneIndex: number;
  grossAmount: number;
  status: string;
}

interface ActionProps {
  orderId: string;
  busy: boolean;
  /** Ejecuta la acción, muestra el error en la sala y recarga el pedido */
  run: (action: () => Promise<unknown>, confirmText?: string) => Promise<void>;
}

const post = (orderId: string, path: string, body: unknown = {}) =>
  apiFetch(`/api/orders/${orderId}/${path}`, { method: "POST", body: JSON.stringify(body) });

const BTN = "rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50";

/** Aviso del plazo que rige el estado actual: qué pasa y cuándo, para que nadie se sorprenda */
export function DeadlineNotice({ status, deadlines, isBuyer }: { status: string; deadlines?: OrderDeadlines | null; isBuyer: boolean }) {
  if (!deadlines) return null;
  let text = "";
  let late = false;
  if (status === "REQUESTED" && deadlines.requestExpiresAt) {
    text = `Si el artista no responde antes del ${formatDate(deadlines.requestExpiresAt)}, la solicitud vence sola y no se cobra nada.`;
  } else if (deadlines.reviewAutoApproveAt) {
    text = isBuyer
      ? `Si no respondés antes del ${formatDate(deadlines.reviewAutoApproveAt)}, la entrega se aprueba automáticamente.`
      : `Si el comprador no responde, la entrega se aprueba sola el ${formatDate(deadlines.reviewAutoApproveAt)}.`;
  } else if (deadlines.paymentTimeoutAt) {
    text = `Si el pago no se abona antes del ${formatDate(deadlines.paymentTimeoutAt)}, el artista puede cerrar el pedido.`;
  } else if (deadlines.workDueAt) {
    late = new Date(deadlines.workDueAt) < new Date();
    text = late
      ? isBuyer
        ? `La entrega estimada era el ${formatDate(deadlines.workDueAt)}. Escribile al artista por el chat; si no responde, podés abrir un reclamo.`
        : `La entrega estimada era el ${formatDate(deadlines.workDueAt)}: subila cuanto antes o avisale al comprador cómo venís.`
      : `Entrega estimada: ${formatDate(deadlines.workDueAt)}.`;
  }
  if (!text) return null;
  return (
    <p className={`mt-3 rounded-xl px-3 py-2 text-xs font-medium ${late ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>
      {late ? "⚠️" : "⏱️"} {text}
    </p>
  );
}

/** Panel principal mientras el pedido está en pausa por un reclamo */
export function DisputePanel({
  dispute,
  permissions,
  payments,
  paidAmount,
  isBuyer,
  isArtist,
  supportEmail,
  ...act
}: ActionProps & {
  dispute: OrderDispute;
  permissions: OrderPermissions;
  payments: PaymentRow[];
  paidAmount: number;
  isBuyer: boolean;
  isArtist: boolean;
  supportEmail: string;
}) {
  const approved = payments.filter((p) => p.status === "APPROVED");
  const [selected, setSelected] = useState<string[]>([]);
  const [proposing, setProposing] = useState(false);
  const selectedAmount = approved.filter((p) => selected.includes(p.id)).reduce((acc, p) => acc + p.grossAmount, 0);
  const opener =
    dispute.openerRole === "SYSTEM" ? "TuPuestito abrió" : dispute.openedByMe ? "Abriste" : dispute.openerRole === "BUYER" ? "El comprador abrió" : "El artista abrió";

  return (
    <div className="mt-3 space-y-4">
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <p className="text-sm font-bold text-amber-950">
          ⚠️ {opener} un reclamo: {dispute.reasonLabel}
        </p>
        <p className="mt-1 whitespace-pre-line text-sm text-amber-900">{dispute.description}</p>
        <p className="mt-2 text-xs text-amber-800">
          Desde el {formatDateTime(dispute.createdAt)}. El pedido está en pausa: no corren plazos ni se pueden hacer entregas o pagos hasta resolverlo.
        </p>
      </div>

      <p className="text-sm text-slate-700">
        {dispute.openerRole === "SYSTEM"
          ? "Este reclamo lo abrió la plataforma (por un aviso de Mercado Pago o una medida de moderación) y lo resuelve el equipo de TuPuestito."
          : "Hablen por el hilo del pedido para llegar a un acuerdo. El equipo de TuPuestito ya fue avisado y puede intervenir."}{" "}
        TuPuestito no retiene el dinero: un reembolso lo emite el artista desde su cuenta de Mercado Pago.
      </p>

      {permissions.canAnswerProposal && dispute.proposal && (
        <div className="rounded-2xl border border-purple-300 bg-white p-4">
          <p className="text-sm font-bold text-slate-900">🤝 Propuesta del artista</p>
          <p className="mt-1 text-sm text-slate-700">
            Cancelar el pedido {dispute.proposal.amount > 0 ? <>reembolsándote <strong>{money(dispute.proposal.amount)}</strong> de los {money(paidAmount)} que pagaste</> : <>sin reembolso (lo pagado corresponde al trabajo ya entregado)</>}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={act.busy}
              className={`${BTN} bg-emerald-600 text-white hover:bg-emerald-700`}
              onClick={() => act.run(() => post(act.orderId, "dispute/accept-proposal"), "¿Aceptar la propuesta? El pedido se cancela y no se puede deshacer.")}
            >
              Aceptar y cancelar el pedido
            </button>
            <button type="button" disabled={act.busy} className={`${BTN} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} onClick={() => act.run(() => post(act.orderId, "dispute/reject-proposal"))}>
              Rechazar
            </button>
          </div>
        </div>
      )}
      {isArtist && dispute.proposal && (
        <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          Propusiste cancelar reembolsando {money(dispute.proposal.amount)}. Esperando la respuesta del comprador.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {permissions.canWithdrawDispute && (
          <button type="button" disabled={act.busy} className={`${BTN} bg-purple-600 text-white hover:bg-purple-700`} onClick={() => act.run(() => post(act.orderId, "dispute/withdraw"), "¿Retirar el reclamo? El pedido continúa donde estaba.")}>
            Retirar el reclamo y continuar
          </button>
        )}
        {permissions.canRefund && (
          <button
            type="button"
            disabled={act.busy}
            className={`${BTN} bg-rose-600 text-white hover:bg-rose-700`}
            onClick={() => act.run(() => post(act.orderId, "refund"), `¿Cancelar el pedido y reembolsar ${money(paidAmount)} al comprador desde tu cuenta de Mercado Pago? No se puede deshacer.`)}
          >
            Cancelar y reembolsar todo ({money(paidAmount)})
          </button>
        )}
        {permissions.canProposePartialRefund && !proposing && (
          <button type="button" disabled={act.busy} className={`${BTN} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`} onClick={() => setProposing(true)}>
            Proponer otro acuerdo
          </button>
        )}
      </div>

      {proposing && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-bold text-slate-900">Proponer cancelar con reembolso parcial</p>
          <p className="mt-1 text-xs text-slate-600">
            Elegí qué pagos devolvés. Si no marcás ninguno, proponés cancelar sin reembolso. El comprador tiene que aceptar.
          </p>
          <div className="mt-3 space-y-2">
            {approved.map((p, i) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.includes(p.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))}
                />
                Pago {i + 1} — {money(p.grossAmount)}
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={act.busy || selected.length === approved.length}
              className={`${BTN} bg-purple-600 text-white hover:bg-purple-700`}
              onClick={() => act.run(async () => { await post(act.orderId, "refund", { paymentIds: selected }); setProposing(false); })}
            >
              Enviar propuesta: reembolsar {money(selectedAmount)}
            </button>
            <button type="button" className="text-xs font-semibold text-slate-500 underline" onClick={() => setProposing(false)}>
              Cancelar
            </button>
          </div>
          {selected.length === approved.length && <p className="mt-2 text-xs text-slate-500">Para devolver todo usá “Cancelar y reembolsar todo”.</p>}
        </div>
      )}

      <p className="text-xs text-slate-500">
        ¿Necesitás ayuda? Escribinos a <a href={`mailto:${supportEmail}`} className="underline">{supportEmail}</a>.
        {isBuyer && " Si corresponde un reembolso y no lo recibís, también podés iniciar un reclamo en Mercado Pago desde el detalle del pago."}
      </p>
    </div>
  );
}

/** Tarjeta lateral: las salidas cuando algo no va bien */
export function OrderHelpCard({
  order,
  dispute,
  permissions,
  deadlines,
  paidAmount,
  isBuyer,
  supportEmail,
  paymentTimeoutDays,
  ...act
}: ActionProps & {
  order: { id: string; status: string };
  dispute: OrderDispute | null;
  permissions: OrderPermissions;
  deadlines?: OrderDeadlines | null;
  paidAmount: number;
  isBuyer: boolean;
  supportEmail: string;
  paymentTimeoutDays: number;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const inDispute = order.status === "DISPUTED";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">🛟 ¿Algún problema con este pedido?</h3>

      {dispute?.status === "RESOLVED" && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          Hubo un reclamo: {DISPUTE_RESOLUTION_LABEL[dispute.resolution ?? ""] ?? "resuelto"}.
          {dispute.resolutionNote ? ` ${dispute.resolutionNote}` : ""}
        </p>
      )}

      {permissions.canOpenDispute && !open && (
        <>
          <p className="mt-3 text-xs text-slate-600">
            Primero probá resolverlo por el chat. Si no hay caso, abrí un reclamo: el pedido queda en pausa y el equipo de TuPuestito interviene.
            {order.status === "COMPLETED_HD_UNLOCKED" && deadlines?.disputeWindowEndsAt ? ` Tenés tiempo hasta el ${formatDate(deadlines.disputeWindowEndsAt)}.` : ""}
          </p>
          <button type="button" onClick={() => setOpen(true)} className="mt-3 w-full rounded-xl border border-amber-300 bg-amber-50 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100">
            Abrir un reclamo
          </button>
        </>
      )}

      {open && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act.run(async () => {
              await post(order.id, "dispute", { reason, description: description.trim() });
              setOpen(false);
              setDescription("");
            });
          }}
        >
          <label htmlFor="dispute-reason" className="block text-xs font-bold text-slate-700">Motivo</label>
          <select id="dispute-reason" required value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
            <option value="">Elegí un motivo…</option>
            {permissions.disputeReasons.map((r) => (
              <option key={r.value} value={r.value}>{r.label.charAt(0).toUpperCase() + r.label.slice(1)}</option>
            ))}
          </select>
          <label htmlFor="dispute-description" className="block text-xs font-bold text-slate-700">Contanos qué pasó</label>
          <textarea id="dispute-description" required rows={4} minLength={20} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-xs" />
          <p className="text-[11px] text-slate-500">{description.trim().length < 20 ? `Mínimo 20 caracteres (${description.trim().length}/20). ` : ""}Lo van a leer la otra parte y el equipo de TuPuestito.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={act.busy || description.trim().length < 20 || !reason} className="flex-1 rounded-xl bg-amber-500 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">
              Abrir reclamo y pausar el pedido
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600">
              Volver
            </button>
          </div>
        </form>
      )}

      {!inDispute && permissions.canRefund && (
        <button
          type="button"
          disabled={act.busy}
          className="mt-2 w-full rounded-xl border border-rose-200 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          onClick={() => act.run(() => post(order.id, "refund"), `¿Cancelar el pedido y reembolsar ${money(paidAmount)} al comprador desde tu cuenta de Mercado Pago? No se puede deshacer.`)}
        >
          Cancelar el pedido y reembolsar todo
        </button>
      )}

      {permissions.canCloseUnpaid && (
        <button
          type="button"
          disabled={act.busy}
          className="mt-2 w-full rounded-xl border border-slate-300 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => act.run(() => post(order.id, "close-unpaid"), `¿Cerrar el pedido? Pasaron más de ${paymentTimeoutDays} días sin el pago. Lo ya cobrado no se reembolsa.`)}
        >
          Cerrar el pedido por falta de pago
        </button>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
        <Link href="/ayuda" className="font-semibold text-purple-700 hover:underline">Centro de ayuda</Link>
        <a href={`mailto:${supportEmail}`} className="text-slate-500 hover:underline">{supportEmail}</a>
        <ReportButton targetType="ORDER" targetId={order.id} subject="este pedido" />
      </div>
      {isBuyer && order.status !== "REQUESTED" && order.status !== "ACCEPTED_WAITING_DEPOSIT" && !permissions.canOpenDispute && !inDispute && order.status === "COMPLETED_HD_UNLOCKED" && (
        <p className="mt-2 text-[11px] text-slate-400">El plazo para reclamar sobre este pedido ya terminó; podés denunciarlo o escribir a soporte.</p>
      )}
    </div>
  );
}

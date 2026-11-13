/**
 * Tests e2e de lo que hace falta para operar en público: reclamos y reembolsos, plazos automáticos,
 * eventos de Mercado Pago posteriores al pago, moderación, soporte y datos personales.
 * Corre después de flow.mjs, sobre la misma API y base (ver run.sh).
 */
import { client, ok, check, png, fd, section } from "./helpers.mjs";

const DAY = 86_400_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const img = await png(600, 600, "#7c3aed");
const LONG = "El artista no sube el boceto y hace una semana que no responde los mensajes.";

const buyer = client(), artist = client(), admin = client(), kaito = client(), anon = client();

const login = async (c, username) =>
  ok(`login ${username}`, await c("/api/auth/sign-in/username", { method: "POST", json: { username, password: "tupuestito123" } }));
const signup = async (c, username) =>
  ok(`signup ${username}`, await c("/api/auth/sign-up/email", { method: "POST", json: { email: `${username}@test.com`, password: "password123", name: username, username } }));
const post = (c, path, json = {}) => c(path, { method: "POST", json });
const getOrder = async (c, id, label) => ok(label, await c(`/api/orders/${id}`));
const simulate = (c, milestoneId, result) =>
  c("/api/payments/mock-approve", { method: "POST", form: new URLSearchParams({ milestoneId, result }) });
const sketch = (id) => artist(`/api/orders/${id}/sketch`, { method: "POST", form: fd({ watermarkMode: "MANUAL" }, { file: [img, "s.png", "image/png"] }) });
const deliver = (id) => artist(`/api/orders/${id}/deliver-final`, { method: "POST", form: fd({ watermarkMode: "MANUAL" }, { file: [img, "final.png", "image/png"] }) });

/** Crea un pedido y lo deja pago (o solo solicitado / aceptado) */
async function order(c, serviceId, label, upTo = "paid") {
  const created = ok(`${label}: pedido`, await post(c, "/api/orders", { serviceId, buyerBrief: "Pedido de prueba para los tests de lanzamiento", acceptedTerms: true }));
  if (upTo === "requested") return { ...created, milestoneId: null };
  ok(`${label}: aceptar`, await post(artist, `/api/orders/${created.id}/accept`));
  if (upTo === "accepted") return { ...created, milestoneId: null };
  const co = ok(`${label}: checkout`, await post(c, `/api/orders/${created.id}/checkout`));
  ok(`${label}: pago`, await simulate(c, co.milestoneId, "approved"), 302);
  return { ...created, milestoneId: co.milestoneId };
}
const dispute = (c, id, reason, description = LONG) => post(c, `/api/orders/${id}/dispute`, { reason, description });
const runJobs = async (plusDays, job = "timers") =>
  ok(`tareas programadas a +${plusDays} días (${job})`, await post(admin, "/api/admin/jobs/run", { job, now: new Date(Date.now() + plusDays * DAY).toISOString() }));
const adminDispute = async (orderId) => {
  const list = ok("admin: reclamos abiertos", await admin("/api/admin/disputes"));
  return list.disputes.find((d) => d.order.id === orderId);
};
const resolve = (disputeId, action, note = "Resuelto en los tests") => post(admin, `/api/admin/disputes/${disputeId}/resolve`, { action, note });

// ───────────────────────────────────────────────────────────
section("Acceso al panel y configuración pública");
await login(buyer, "uriel_fan");
await login(artist, "maomao");
await login(admin, "moderadora");
await login(kaito, "kaito_ink");
const third = client();
await signup(third, "tercero");

const cfg = ok("config pública", await anon("/api/config"));
check("la config trae plazos, soporte y versión de términos", cfg.reviewAutoApproveDays === 7 && cfg.requestExpirationDays === 7 && Boolean(cfg.supportEmail) && Boolean(cfg.termsVersion));
ok("panel sin sesión", await anon("/api/admin/overview"), 401);
ok("panel como comprador (no existe)", await buyer("/api/admin/overview"), 404);
const overview = ok("panel: resumen", await admin("/api/admin/overview"));
check("resumen con checklist de lanzamiento y conteos", Array.isArray(overview.launchChecklist) && overview.counts.users >= 4 && overview.rules.reviewAutoApproveDays === 7);
const meKaito = ok("me (kaito)", await kaito("/api/me"));
check("ADMIN_EMAILS promueve cuentas con email verificado", meKaito.user.role === "ADMIN");
const meThird = ok("me (tercero)", await third("/api/me"));
check("el registro deja asentada la aceptación de términos", Boolean(meThird.account.termsAcceptedAt) && meThird.user.role === "BUYER");
const sitemap = ok("sitemap de artistas", await anon("/api/artists/sitemap"));
check("el sitemap lista los puestitos públicos", sitemap.artists.some((a) => a.username === "maomao"));

const svc = (extra) => ({ title: "Lanzamiento", description: "Servicio de prueba", priceArs: 20000, paymentPlan: "FULL_100", turnaroundDays: 5, maxSlots: 50, revisionsIncluded: 2, rating: "SFW", tags: [], addons: [], ...extra });
const full = ok("servicio 100%", await post(artist, "/api/artists/services", svc({ title: "Lanzamiento · pago único" })));
const split = ok("servicio 50/50", await post(artist, "/api/artists/services", svc({ title: "Lanzamiento · 50/50", paymentPlan: "SPLIT_ON_SKETCH" })));
const adult = ok("servicio +18", await post(artist, "/api/artists/services", svc({ title: "Lanzamiento · +18", rating: "NSFW" })));

// ───────────────────────────────────────────────────────────
section("Reclamos: abrir, proponer, rechazar, retirar y reembolsar");
const d1 = await order(buyer, split.id, "reclamo");
let o = await getOrder(buyer, d1.id, "reclamo: pedido en curso");
check("el primer pago fija la fecha estimada de entrega", o.order.status === "IN_PROGRESS_SKETCH" && Math.abs(new Date(o.deadlines.workDueAt) - Date.now() - 5 * DAY) < 120_000);
check("términos con las reglas de plazos de la plataforma", /se considera aprobada/.test(o.order.termsSnapshot));
check("con un pago hecho se puede reclamar", o.permissions.canOpenDispute === true && o.permissions.disputeReasons.length > 3);
ok("cancelar con un pago acreditado", await post(buyer, `/api/orders/${d1.id}/cancel`), 409);
ok("reclamo sin detalle", await dispute(buyer, d1.id, "LATE_DELIVERY", "corto"), 400);
ok("reclamo con un motivo que no le corresponde", await dispute(buyer, d1.id, "BUYER_UNRESPONSIVE"), 400);
ok("reclamo de un tercero", await dispute(third, d1.id, "OTHER"), 404);
ok("abrir reclamo", await dispute(buyer, d1.id, "LATE_DELIVERY"));
o = await getOrder(buyer, d1.id, "reclamo: abierto");
check("pedido en pausa, mostrando el estado en que quedó", o.order.status === "DISPUTED" && o.order.flowStatus === "IN_PROGRESS_SKETCH" && o.dispute.status === "OPEN" && o.dispute.openedByMe && o.permissions.canWithdrawDispute);
ok("segundo reclamo sobre el mismo pedido", await dispute(buyer, d1.id, "OTHER"), 409);
ok("entregar con el reclamo abierto", await sketch(d1.id), 409);
ok("mensaje durante el reclamo", await post(artist, `/api/orders/${d1.id}/messages`, { content: "Perdón, estuve sin internet. Ya te mando el boceto." }));
let oa = await getOrder(artist, d1.id, "reclamo: vista del artista");
check("el artista puede reembolsar o proponer, no retirar", oa.permissions.canRefund && oa.permissions.canProposePartialRefund && !oa.permissions.canWithdrawDispute);
ok("retirar un reclamo ajeno", await post(artist, `/api/orders/${d1.id}/dispute/withdraw`), 403);
const proposal = ok("propuesta: cancelar sin reembolso", await post(artist, `/api/orders/${d1.id}/refund`, { paymentIds: [] }));
check("un reembolso parcial queda como propuesta", proposal.proposed === true && proposal.status === "DISPUTED");
o = await getOrder(buyer, d1.id, "reclamo: con propuesta");
check("el comprador ve la propuesta", o.dispute.proposal?.amount === 0 && o.permissions.canAnswerProposal);
ok("el artista no puede aceptar su propia propuesta", await post(artist, `/api/orders/${d1.id}/dispute/accept-proposal`), 403);
ok("rechazar propuesta", await post(buyer, `/api/orders/${d1.id}/dispute/reject-proposal`));
ok("rechazar una propuesta que ya no existe", await post(buyer, `/api/orders/${d1.id}/dispute/reject-proposal`), 409);
ok("retirar reclamo", await post(buyer, `/api/orders/${d1.id}/dispute/withdraw`));
o = await getOrder(buyer, d1.id, "reclamo: retirado");
check("el pedido vuelve al estado anterior", o.order.status === "IN_PROGRESS_SKETCH" && o.dispute.status === "RESOLVED" && o.dispute.resolution === "WITHDRAWN");
ok("boceto tras retomar", await sketch(d1.id));
ok("aprobar boceto", await post(buyer, `/api/orders/${d1.id}/approve-sketch`));
ok("reembolso parcial fuera de un reclamo", await post(artist, `/api/orders/${d1.id}/refund`, { paymentIds: [] }), 409);
ok("el comprador no puede emitir un reembolso", await post(buyer, `/api/orders/${d1.id}/refund`), 403);
ok("segundo reclamo (quiere cancelar)", await dispute(buyer, d1.id, "WANTS_TO_CANCEL"));
const refunded = ok("el artista reembolsa todo", await post(artist, `/api/orders/${d1.id}/refund`));
o = await getOrder(buyer, d1.id, "reclamo: reembolsado");
check("pedido cancelado, pago reembolsado y reclamo cerrado", refunded.status === "CANCELLED" && !refunded.proposed && o.payments[0].status === "REFUNDED" && o.paidAmount === 0 && o.dispute.resolution === "REFUNDED");

const d2 = await order(buyer, split.id, "acuerdo");
ok("acuerdo: reclamo", await dispute(buyer, d2.id, "WANTS_TO_CANCEL", "Cambié de idea y prefiero no seguir con el encargo, gracias igual."));
ok("acuerdo: propuesta sin reembolso", await post(artist, `/api/orders/${d2.id}/refund`, { paymentIds: [] }));
ok("acuerdo: el comprador acepta", await post(buyer, `/api/orders/${d2.id}/dispute/accept-proposal`));
o = await getOrder(buyer, d2.id, "acuerdo: cerrado");
check("cancelado de común acuerdo, el pago queda en el artista", o.order.status === "CANCELLED" && o.payments[0].status === "APPROVED" && o.dispute.status === "RESOLVED");

const r1 = await order(buyer, full.id, "reembolso directo");
const direct = ok("cancelar reembolsando todo (sin reclamo)", await post(artist, `/api/orders/${r1.id}/refund`));
o = await getOrder(buyer, r1.id, "reembolso directo: resultado");
check("reembolso total unilateral del artista", direct.status === "CANCELLED" && o.payments[0].status === "REFUNDED" && o.dispute === null);
ok("reembolsar un pedido ya cancelado", await post(artist, `/api/orders/${r1.id}/refund`), 409);

// ───────────────────────────────────────────────────────────
section("Mercado Pago después del pago: reclamo, contracargo y reembolso");
const p1 = await order(buyer, full.id, "mediación");
ok("MP informa un reclamo del comprador", await simulate(buyer, p1.milestoneId, "in_mediation"), 302);
o = await getOrder(buyer, p1.id, "mediación: pedido");
check("el pedido se pausa con un reclamo del sistema", o.order.status === "DISPUTED" && o.dispute.openerRole === "SYSTEM" && o.dispute.reason === "PROVIDER_CLAIM" && !o.permissions.canWithdrawDispute);
ok("retirar un reclamo del sistema", await post(buyer, `/api/orders/${p1.id}/dispute/withdraw`), 403);
let dz = await adminDispute(p1.id);
check("el reclamo aparece en el panel", Boolean(dz) && dz.order.paidAmount === 20000);
ok("panel: acción inválida", await resolve(dz.id, "NOPE"), 400);
ok("panel: completar sin entrega final", await resolve(dz.id, "COMPLETE"), 409);
ok("panel: el comprador no puede resolver", await post(buyer, `/api/admin/disputes/${dz.id}/resolve`, { action: "RESUME" }), 404);
ok("panel: retomar el pedido", await resolve(dz.id, "RESUME", "Mercado Pago cerró el reclamo a favor del artista"));
ok("panel: resolver dos veces", await resolve(dz.id, "RESUME"), 409);
o = await getOrder(buyer, p1.id, "mediación: retomado");
check("el pedido sigue donde estaba", o.order.status === "IN_PROGRESS_SKETCH" && o.dispute.resolution === "RESUMED_BY_ADMIN");
ok("MP informa un contracargo", await simulate(buyer, p1.milestoneId, "charged_back"), 302);
ok("contracargo repetido (idempotente)", await simulate(buyer, p1.milestoneId, "charged_back"), 302);
oa = await getOrder(artist, p1.id, "contracargo: pedido");
check("contracargo: pago revertido y pedido en reclamo", oa.order.status === "DISPUTED" && oa.payments[0].status === "CHARGED_BACK" && oa.paidAmount === 0 && !oa.permissions.canRefund);
check("el contracargo repetido no vuelve a abrir un reclamo", oa.messages.filter((m) => /abrió un reclamo/.test(m.content)).length === 2);
dz = await adminDispute(p1.id);
ok("panel: cancelar el pedido", await resolve(dz.id, "CANCEL", "Contracargo confirmado"));
o = await getOrder(buyer, p1.id, "contracargo: cancelado");
check("pedido cancelado por moderación", o.order.status === "CANCELLED" && o.dispute.resolution === "CANCELLED_BY_ADMIN");

const p2 = await order(buyer, full.id, "post-entrega");
ok("post-entrega: boceto", await sketch(p2.id));
ok("post-entrega: aprobar boceto", await post(buyer, `/api/orders/${p2.id}/approve-sketch`));
ok("post-entrega: entrega final", await deliver(p2.id));
ok("post-entrega: descarga", await buyer(`/api/orders/${p2.id}/download-hd`));
ok("el artista no puede reclamar un pedido completado", await dispute(artist, p2.id, "BUYER_UNRESPONSIVE"), 409);
ok("reclamo del comprador después de la entrega", await dispute(buyer, p2.id, "NOT_AS_AGREED", "Lo entregado no coincide con el boceto que aprobé: cambió la pose."));
ok("descarga bloqueada durante el reclamo", await buyer(`/api/orders/${p2.id}/download-hd`), 402);
dz = await adminDispute(p2.id);
ok("panel: dar el pedido por completado", await resolve(dz.id, "COMPLETE", "La entrega coincide con lo pactado"));
ok("descarga habilitada de nuevo", await buyer(`/api/orders/${p2.id}/download-hd`));
ok("MP informa un reembolso sobre un pedido completado", await simulate(buyer, p2.milestoneId, "refunded"), 302);
o = await getOrder(buyer, p2.id, "post-entrega: reembolsado");
check("sigue completado pero el original se bloquea", o.order.status === "COMPLETED_HD_UNLOCKED" && o.order.hdUnlocked === false && o.payments[0].status === "REFUNDED");
ok("descarga bloqueada tras el reembolso", await buyer(`/api/orders/${p2.id}/download-hd`), 402);

const p3 = await order(buyer, full.id, "reembolso externo");
ok("MP informa un reembolso sobre un pedido en curso", await simulate(buyer, p3.milestoneId, "refunded"), 302);
o = await getOrder(buyer, p3.id, "reembolso externo: pedido");
check("un reembolso hecho por fuera cancela el pedido", o.order.status === "CANCELLED" && o.payments[0].status === "REFUNDED");

// ───────────────────────────────────────────────────────────
section("Plazos automáticos (simulando el paso de los días)");
const t1 = await order(buyer, full.id, "sin responder", "requested");
const t2 = await order(buyer, full.id, "sin revisar");
ok("sin revisar: boceto", await sketch(t2.id));
const t3 = await order(buyer, split.id, "sin pagar");
ok("sin pagar: boceto", await sketch(t3.id));
ok("sin pagar: aprobar boceto", await post(buyer, `/api/orders/${t3.id}/approve-sketch`));
const waitingSince = Date.now();
ok("cerrar por falta de pago antes de tiempo", await post(artist, `/api/orders/${t3.id}/close-unpaid`), 409);
const t4 = await order(buyer, full.id, "atrasado");

let rep = await runJobs(4);
check("recordatorio al artista por la solicitud sin responder", rep.timers.requestReminders >= 1 && rep.timers.expiredRequests === 0);
check("aviso de pago vencido al artista", rep.timers.paymentTimeouts >= 1);
rep = await runJobs(5.5);
check("recordatorio al comprador antes de la aprobación automática", rep.timers.reviewReminders >= 1 && rep.timers.autoApproved === 0);
check("aviso por entrega atrasada", rep.timers.overdueNotices >= 1 && rep.timers.overdueEscalations === 0);
rep = await runJobs(8);
check("vence la solicitud y se aprueba sola la entrega", rep.timers.expiredRequests >= 1 && rep.timers.autoApproved >= 1);
o = await getOrder(buyer, t1.id, "sin responder: pedido");
check("solicitud vencida sin cobro", o.order.status === "EXPIRED");
o = await getOrder(buyer, t2.id, "sin revisar: pedido");
check("boceto aprobado automáticamente, con constancia en el hilo", o.order.status === "WORKING_FINAL" && o.messages.some((m) => /Aprobación automática/.test(m.content)));
rep = await runJobs(8);
check("correr dos veces no repite nada", rep.timers.expiredRequests === 0 && rep.timers.autoApproved === 0 && rep.timers.reviewReminders === 0 && rep.timers.requestReminders === 0);
rep = await runJobs(13);
check("el atraso largo se escala a moderación", rep.timers.overdueEscalations >= 1);
o = await getOrder(buyer, t4.id, "atrasado: pedido");
check("el pedido atrasado sigue su curso (nada se cancela solo)", o.order.status === "IN_PROGRESS_SKETCH" && o.permissions.canOpenDispute);

await sleep(Math.max(0, 6500 - (Date.now() - waitingSince)));
oa = await getOrder(artist, t3.id, "sin pagar: vista del artista");
check("vencido el plazo, el artista puede cerrar el pedido", oa.permissions.canCloseUnpaid === true);
ok("el comprador no puede cerrarlo", await post(buyer, `/api/orders/${t3.id}/close-unpaid`), 403);
ok("cerrar por falta de pago", await post(artist, `/api/orders/${t3.id}/close-unpaid`));
o = await getOrder(buyer, t3.id, "sin pagar: cerrado");
check("cerrado sin reembolso de lo ya trabajado", o.order.status === "CANCELLED" && o.payments[0].status === "APPROVED");

const orphan = await png(300, 300, "#112233");
const orphanUp = ok("referencia que nunca se usa", await post(buyer, "/api/uploads/reference", { contentType: "image/png", size: orphan.length }));
ok("subir la referencia", await buyer(orphanUp.uploadUrl, { method: "PUT", raw: orphan, headers: orphanUp.headers }));
rep = await runJobs(2, "cleanup");
check("la limpieza borra referencias huérfanas y archivos de pedidos cerrados", rep.cleanup.orphanReferences >= 1 && rep.cleanup.purgedOrders >= 1 && rep.cleanup.purgedFiles >= 1);
o = await getOrder(buyer, d1.id, "pedido cancelado tras la limpieza");
check("el pedido conserva su historial pero ya no sus archivos", Boolean(o.order.filesPurgedAt) && o.order.sketchWatermarkedUrl === null && o.messages.every((m) => m.attachments.length === 0));
o = await getOrder(buyer, p2.id, "pedido completado tras la limpieza");
check("los pedidos completados conservan sus archivos", !o.order.filesPurgedAt && o.order.hasFinalHd);

// ───────────────────────────────────────────────────────────
section("Mensajes sin leer, 'te toca a vos' y sala en vivo");
const m1 = await order(buyer, full.id, "mensajes", "requested");
const meArtist = ok("me (artista)", await artist("/api/me"));
check("el contador de atención incluye la solicitud nueva", meArtist.attention >= 1);
let list = ok("pedidos del artista", await artist("/api/orders"));
let row = list.orders.find((x) => x.id === m1.id);
check("solicitud nueva: le toca al artista y tiene novedades", row.awaitingMe === true && row.unread === true);
await getOrder(artist, m1.id, "el artista abre el pedido");
list = ok("pedidos del artista (ya lo abrió)", await artist("/api/orders"));
check("al abrirlo deja de figurar como no leído", list.orders.find((x) => x.id === m1.id).unread === false);
const pulse1 = ok("pulso del pedido", await artist(`/api/orders/${m1.id}/pulse`)).version;
ok("mensaje del comprador", await post(buyer, `/api/orders/${m1.id}/messages`, { content: "¡Hola! ¿Llegaste a ver las referencias?" }));
const pulse2 = ok("pulso tras el mensaje", await artist(`/api/orders/${m1.id}/pulse`)).version;
check("el pulso cambia cuando hay novedades", pulse1 !== pulse2);
ok("un tercero no puede escribir", await post(third, `/api/orders/${m1.id}/messages`, { content: "hola" }), 404);
ok("moderación interviene en el hilo", await post(admin, `/api/orders/${m1.id}/messages`, { content: "Hola, soy del equipo. Avisen si necesitan ayuda." }));
o = await getOrder(buyer, m1.id, "hilo con mensaje del equipo");
check("el mensaje del equipo se identifica como tal", o.messages.some((m) => m.content.startsWith("🛡️ Equipo de TuPuestito")));
const staffView = await getOrder(admin, m1.id, "moderación ve el pedido");
check("moderación lo ve como staff, sin ser parte", staffView.isStaffView === true && !staffView.isBuyer && !staffView.isArtist);
ok("retirar la solicitud", await post(buyer, `/api/orders/${m1.id}/cancel`));

// ───────────────────────────────────────────────────────────
section("Denuncias y moderación de contenido");
const prof = ok("perfil público", await buyer("/api/artists/maomao"));
const item = prof.portfolio[0];
const report = (c, json) => post(c, "/api/reports", json);
ok("denunciar una obra", await report(buyer, { targetType: "PORTFOLIO_ITEM", targetId: item.id, reason: "AI_GENERATED", details: "Parece generada con IA" }));
const dup = ok("repetir la denuncia", await report(buyer, { targetType: "PORTFOLIO_ITEM", targetId: item.id, reason: "AI_GENERATED" }));
check("la denuncia repetida no se duplica", dup.duplicate === true);
ok("denunciar algo que no existe", await report(buyer, { targetType: "SERVICE", targetId: "00000000-0000-4000-8000-000000000000", reason: "SPAM" }), 404);
ok("denunciar sin sesión", await report(anon, { targetType: "PORTFOLIO_ITEM", targetId: item.id, reason: "SPAM" }), 401);
ok("denunciar el puestito propio", await report(artist, { targetType: "ARTIST", targetId: prof.artist.id, reason: "SPAM" }), 400);
ok("denunciar un pedido ajeno", await report(third, { targetType: "ORDER", targetId: d1.id, reason: "SCAM_OR_FRAUD" }), 404);
ok("denunciar un pedido propio", await report(buyer, { targetType: "ORDER", targetId: d1.id, reason: "SCAM_OR_FRAUD", details: "Prueba" }));
const reports = ok("panel: denuncias", await admin("/api/admin/reports"));
const rp = reports.reports.find((r) => r.targetId === item.id);
check("la denuncia llega al panel con el detalle de la obra", Boolean(rp) && rp.target.label.includes(item.title) && rp.reporterUsername === "uriel_fan");

ok("panel: ocultar la obra", await post(admin, `/api/admin/portfolio/${item.id}/hide`, { hidden: true, reason: "En revisión" }));
let pub = ok("perfil público (obra oculta)", await buyer("/api/artists/maomao"));
let own = ok("perfil visto por su dueña", await artist("/api/artists/maomao"));
const explore = ok("explorar", await anon("/api/artists/explore"));
check("la obra oculta no se ve en el perfil ni en explorar, pero su dueña la ve marcada",
  !pub.portfolio.some((p) => p.id === item.id) &&
  !explore.artists.find((a) => a.username === "maomao").portfolio.some((p) => p.id === item.id) &&
  own.portfolio.find((p) => p.id === item.id)?.moderationHidden === true);
ok("panel: volver a mostrar la obra", await post(admin, `/api/admin/portfolio/${item.id}/hide`, { hidden: false }));
ok("panel: desestimar la denuncia", await post(admin, `/api/admin/reports/${rp.id}/resolve`, { status: "DISMISSED", note: "Mostró el proceso: es arte humano" }));
ok("panel: resolver una denuncia cerrada", await post(admin, `/api/admin/reports/${rp.id}/resolve`, { status: "RESOLVED" }), 409);

ok("panel: despublicar una comisión", await post(admin, `/api/admin/services/${split.id}/moderate`, { hidden: true, reason: "Descripción engañosa" }));
pub = ok("perfil público (comisión despublicada)", await buyer("/api/artists/maomao"));
check("la comisión despublicada no se ofrece", !pub.services.some((s) => s.id === split.id));
ok("pedir una comisión despublicada", await post(buyer, "/api/orders", { serviceId: split.id, buyerBrief: "pedido a comisión moderada", acceptedTerms: true }), 404);
ok("la artista no puede republicarla", await artist(`/api/artists/services/${split.id}/status`, { method: "PATCH", json: { isActive: true } }), 409);
ok("panel: levantar la medida", await post(admin, `/api/admin/services/${split.id}/moderate`, { hidden: false }));
ok("la artista la republica", await artist(`/api/artists/services/${split.id}/status`, { method: "PATCH", json: { isActive: true } }));

const found = ok("panel: buscar usuario", await admin("/api/admin/users?q=kaito"));
const kaitoRow = found.users.find((u) => u.username === "kaito_ink");
ok("panel: quitar la insignia de humano verificado", await post(admin, `/api/admin/artists/${kaitoRow.artistId}/verify-human`, { verified: false }));
check("la insignia se refleja en el perfil", ok("perfil kaito", await anon("/api/artists/kaito_ink")).artist.isVerifiedHuman === false);
ok("panel: devolver la insignia", await post(admin, `/api/admin/artists/${kaitoRow.artistId}/verify-human`, { verified: true }));

const uploaded = ok("subir una obra", await artist("/api/artists/portfolio", { method: "POST", form: fd({ title: "Obra a eliminar", rating: "SFW", watermarkMode: "MANUAL" }, { file: [img, "p.png", "image/png"] }) }));
ok("la imagen es pública", await anon(uploaded.imageUrl));
ok("panel: eliminar una obra sin motivo", await admin(`/api/admin/portfolio/${uploaded.id}`, { method: "DELETE", json: {} }), 400);
ok("panel: eliminar la obra", await admin(`/api/admin/portfolio/${uploaded.id}`, { method: "DELETE", json: { reason: "Contenido prohibido por los términos" } }));
ok("el archivo también se borra", await anon(uploaded.imageUrl), 404);

// ───────────────────────────────────────────────────────────
section("Contenido +18");
const minor = client();
await signup(minor, "sin_confirmar");
let pubN = ok("perfil sin contenido adulto activado", await minor("/api/artists/maomao"));
check("las comisiones +18 no se muestran", !pubN.services.some((s) => s.id === adult.id) && pubN.hiddenNsfwServices >= 1);
ok("pedir una comisión +18 sin confirmar la edad", await post(minor, "/api/orders", { serviceId: adult.id, buyerBrief: "pedido +18 sin confirmar edad", acceptedTerms: true }), 403);
ok("activar +18 sin declarar la mayoría de edad", await minor("/api/me/preferences", { method: "PUT", json: { showNsfw: true } }), 400);
ok("activar +18 declarando ser mayor", await minor("/api/me/preferences", { method: "PUT", json: { showNsfw: true, confirmAdult: true } }));
pubN = ok("perfil con contenido adulto activado", await minor("/api/artists/maomao"));
check("ahora ve las comisiones +18", pubN.services.some((s) => s.id === adult.id) && pubN.hiddenNsfwServices === 0);
const adultOrder = ok("pedir la comisión +18", await post(minor, "/api/orders", { serviceId: adult.id, buyerBrief: "pedido +18 con la edad confirmada", acceptedTerms: true }));
ok("retirar el pedido +18", await post(minor, `/api/orders/${adultOrder.id}/cancel`));

// ───────────────────────────────────────────────────────────
section("Suspensión de cuentas");
const troll = client();
await signup(troll, "cuenta_trucha");
ok("abre un puestito", await post(troll, "/api/me/artist-profile", { acceptHumanArtPledge: true }));
const trollRequest = await order(troll, full.id, "suspensión: solicitud", "requested");
const trollPaid = await order(troll, full.id, "suspensión: pedido pago");
const trollRow = ok("panel: buscar la cuenta", await admin("/api/admin/users?q=cuenta_trucha")).users[0];
const meAdmin = ok("me (moderadora)", await admin("/api/me"));
ok("panel: suspender sin motivo", await post(admin, `/api/admin/users/${trollRow.id}/suspend`, {}), 400);
ok("panel: suspenderse a una misma", await post(admin, `/api/admin/users/${meAdmin.user.id}/suspend`, { reason: "No debería poder" }), 400);
ok("panel: suspender a otra cuenta del equipo", await post(admin, `/api/admin/users/${kaitoRow.id}/suspend`, { reason: "No debería poder" }), 409);
const suspension = ok("panel: suspender la cuenta", await post(admin, `/api/admin/users/${trollRow.id}/suspend`, { reason: "Múltiples denuncias por estafa" }));
check("sus pedidos sin pagar se cancelan y los pagos pasan a reclamo", suspension.cancelled === 1 && suspension.disputed === 1);
const meTroll = ok("me (cuenta suspendida)", await troll("/api/me"));
check("la cuenta se entera de la suspensión y del motivo", meTroll.user.suspended === true && /estafa/.test(meTroll.user.suspensionReason));
ok("suspendida: no puede crear pedidos", await post(troll, "/api/orders", { serviceId: full.id, buyerBrief: "pedido desde cuenta suspendida", acceptedTerms: true }), 403);
ok("suspendida: sí puede ver sus pedidos", await troll("/api/orders"));
ok("suspendida: sí puede exportar sus datos", await troll("/api/me/export"));
ok("su puestito deja de ser público", await buyer("/api/artists/cuenta_trucha"), 404);
ok("pero su dueño lo sigue viendo", await troll("/api/artists/cuenta_trucha"));
o = await getOrder(troll, trollRequest.id, "suspensión: solicitud");
check("la solicitud quedó cancelada", o.order.status === "CANCELLED");
o = await getOrder(troll, trollPaid.id, "suspensión: pedido pago");
check("el pedido pago quedó en reclamo por la suspensión", o.order.status === "DISPUTED" && o.dispute.reason === "ACCOUNT_SUSPENDED");
ok("panel: reactivar la cuenta", await post(admin, `/api/admin/users/${trollRow.id}/unsuspend`, { note: "Se aclaró el malentendido" }));
ok("panel: reactivar dos veces", await post(admin, `/api/admin/users/${trollRow.id}/unsuspend`, {}), 409);
ok("su puestito vuelve a ser público", await buyer("/api/artists/cuenta_trucha"));
const adminOrders = ok("panel: pedidos en reclamo", await admin("/api/admin/orders?filter=disputed"));
check("el listado de pedidos filtra por estado", adminOrders.orders.length >= 1 && adminOrders.orders.every((x) => x.status === "DISPUTED"));
const byNumber = ok("panel: buscar pedido por número", await admin(`/api/admin/orders?q=${d1.orderNumber}`));
check("la búsqueda encuentra el pedido", byNumber.orders.some((x) => x.id === d1.id));
dz = await adminDispute(trollPaid.id);
ok("panel: retomar el pedido pausado", await resolve(dz.id, "RESUME"));
const audit = ok("panel: auditoría", await admin("/api/admin/audit"));
check("todo lo que hizo moderación quedó registrado", ["user.suspend", "user.unsuspend", "portfolio.delete", "dispute.resume", "report.dismissed", "jobs.run"].every((a) => audit.actions.some((x) => x.action === a)));

// ───────────────────────────────────────────────────────────
section("Soporte y botón de arrepentimiento");
const contact = ok("consulta a soporte (sin sesión)", await post(anon, "/api/support/contact", { name: "Ana", email: "ana@test.com", message: "No me llega el email de verificación de la cuenta." }));
check("devuelve un código de gestión", /^SOP-[2-9A-Z]{8}$/.test(contact.code));
ok("consulta con el campo trampa completo (bot)", await post(anon, "/api/support/contact", { name: "Bot", email: "bot@test.com", message: "Compre seguidores baratos ya mismo", website: "http://spam.example" }), 400);
ok("arrepentimiento sin número de pedido", await post(anon, "/api/support/arrepentimiento", { name: "Uriel", email: "comprador@tupuestito.com" }), 400);
const regret = ok("botón de arrepentimiento (sin sesión)", await post(anon, "/api/support/arrepentimiento", { name: "Uriel", email: "comprador@tupuestito.com", orderNumber: `#${t4.orderNumber.toLowerCase()}`, message: "Quiero revocar la compra" }));
check("devuelve el código de identificación", /^ARR-[2-9A-Z]{8}$/.test(regret.code));
o = await getOrder(buyer, t4.id, "pedido con arrepentimiento");
check("queda asentado en el pedido", o.messages.some((m) => m.content.includes(regret.code)));
const inbox = ok("panel: soporte", await admin("/api/admin/support"));
check("las dos gestiones están en la bandeja", [contact.code, regret.code].every((code) => inbox.messages.some((m) => m.code === code)));
const ticket = inbox.messages.find((m) => m.code === contact.code);
ok("panel: cerrar la consulta", await post(admin, `/api/admin/support/${ticket.id}/close`, { note: "Se reenviaron los emails" }));
ok("panel: cerrarla dos veces", await post(admin, `/api/admin/support/${ticket.id}/close`, {}), 409);

// ───────────────────────────────────────────────────────────
section("Datos personales: exportar y eliminar la cuenta");
const exported = ok("exportar mis datos", await buyer("/api/me/export"));
check("el export trae la cuenta y los pedidos, sin claves internas de archivos", exported.cuenta.usuario === "uriel_fan" && exported.pedidosComoComprador.length >= 8 && !/finalHdPrivateKey|orders\/[0-9a-f-]{36}\//.test(JSON.stringify(exported)));
check("ingresa con contraseña", ok("seguridad de la cuenta", await buyer("/api/me/security")).hasPassword === true);
ok("eliminar la cuenta con pedidos en curso", await buyer("/api/me", { method: "DELETE", json: { confirmUsername: "uriel_fan" } }), 409);
ok("una cuenta de administración no se elimina sola", await admin("/api/me", { method: "DELETE", json: { confirmUsername: "moderadora" } }), 409);

const ghost = client();
await signup(ghost, "fantasma");
ok("eliminar con el usuario mal escrito", await ghost("/api/me", { method: "DELETE", json: { confirmUsername: "otro" } }), 400);
const gone = ok("eliminar una cuenta sin historial", await ghost("/api/me", { method: "DELETE", json: { confirmUsername: "@fantasma" } }));
check("sin historial se borra por completo", gone.mode === "deleted");
ok("la sesión dejó de existir", await ghost("/api/me"), 401);
ok("ya no puede ingresar", await client()("/api/auth/sign-in/username", { method: "POST", json: { username: "fantasma", password: "password123" } }), 401);

const former = client();
await signup(former, "ex_cliente");
const last = await order(former, full.id, "ex cliente");
ok("ex cliente: boceto", await sketch(last.id));
ok("ex cliente: aprobar boceto", await post(former, `/api/orders/${last.id}/approve-sketch`));
ok("ex cliente: entrega final", await deliver(last.id));
ok("ex cliente: reseña", await post(former, `/api/orders/${last.id}/review`, { rating: 4, comment: "Muy buena experiencia" }));
const anonymized = ok("eliminar una cuenta con pedidos terminados", await former("/api/me", { method: "DELETE", json: { confirmUsername: "ex_cliente" } }));
check("con historial se anonimiza", anonymized.mode === "anonymized");
ok("la sesión dejó de existir", await former("/api/me"), 401);
oa = await getOrder(artist, last.id, "el pedido sigue existiendo para la artista");
check("sin los datos personales del comprador", oa.buyer.displayName === "Usuario eliminado" && oa.buyer.username.startsWith("eliminado_") && oa.order.status === "COMPLETED_HD_UNLOCKED");
const reviewsNow = ok("reseñas del perfil", await anon("/api/artists/maomao")).reviews;
check("la reseña queda, firmada como usuario eliminado", reviewsNow.some((r) => r.comment === "Muy buena experiencia" && r.buyerName === "Usuario eliminado"));
ok("el email queda libre para volver a registrarse", await client()("/api/auth/sign-up/email", { method: "POST", json: { email: "ex_cliente@test.com", password: "password123", name: "De vuelta", username: "ex_cliente_2" } }));

console.log(process.exitCode ? "\n❌ Hay tests de lanzamiento fallando" : "\n✅ Tests de lanzamiento OK");

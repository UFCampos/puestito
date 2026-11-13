import { and, eq, inArray, notInArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  accounts,
  artistProfiles,
  commissionAddons,
  commissionOrders,
  commissionServices,
  orderMessages,
  orderMilestonePayments,
  paymentAccounts,
  portfolioItems,
  reports,
  reviews,
  sessions,
  supportMessages,
  users,
  verifications
} from "../db/schema.js";
import { HttpError, type SessionUser } from "../lib/http.js";
import { TERMINAL_STATUSES } from "./order.service.js";
import { storage } from "./storage.service.js";

/**
 * Derechos del titular de los datos (Ley 25.326): acceso (exportar) y supresión (eliminar la cuenta).
 */

/** Todo lo que TuPuestito guarda sobre la persona, en un JSON descargable */
export async function exportAccountData(user: SessionUser) {
  const [account] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!account) throw new HttpError(404, "Cuenta no encontrada");
  const [profile] = await db.select().from(artistProfiles).where(eq(artistProfiles.userId, user.id)).limit(1);

  const [logins, userSessions, asBuyer, written, made, support] = await Promise.all([
    db.select({ providerId: accounts.providerId, createdAt: accounts.createdAt }).from(accounts).where(eq(accounts.userId, user.id)),
    db
      .select({ ipAddress: sessions.ipAddress, userAgent: sessions.userAgent, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(eq(sessions.userId, user.id)),
    db.select().from(commissionOrders).where(eq(commissionOrders.buyerId, user.id)),
    db.select().from(reviews).where(eq(reviews.buyerId, user.id)),
    db.select().from(reports).where(eq(reports.reporterId, user.id)),
    db.select().from(supportMessages).where(eq(supportMessages.userId, user.id))
  ]);

  const [portfolio, services, payAccounts, asArtist, received] = profile
    ? await Promise.all([
        db.select().from(portfolioItems).where(eq(portfolioItems.artistId, profile.id)),
        db.select().from(commissionServices).where(eq(commissionServices.artistId, profile.id)),
        db
          .select({
            provider: paymentAccounts.provider,
            providerUserId: paymentAccounts.providerUserId,
            isActive: paymentAccounts.isActive,
            liveMode: paymentAccounts.liveMode,
            createdAt: paymentAccounts.createdAt
          })
          .from(paymentAccounts)
          .where(eq(paymentAccounts.artistId, profile.id)),
        db.select().from(commissionOrders).where(eq(commissionOrders.artistId, profile.id)),
        db.select().from(reviews).where(eq(reviews.artistId, profile.id))
      ])
    : [[], [], [], [], []];

  const serviceIds = services.map((s) => s.id);
  const addons = serviceIds.length
    ? await db.select().from(commissionAddons).where(inArray(commissionAddons.serviceId, serviceIds))
    : [];
  const orderIds = [...asBuyer, ...asArtist].map((o) => o.id);
  const [myMessages, payments] = orderIds.length
    ? await Promise.all([
        db
          .select({ orderId: orderMessages.orderId, content: orderMessages.content, type: orderMessages.type, createdAt: orderMessages.createdAt })
          .from(orderMessages)
          .where(and(inArray(orderMessages.orderId, orderIds), eq(orderMessages.senderId, user.id))),
        db
          .select({
            orderId: orderMilestonePayments.orderId,
            stage: orderMilestonePayments.stage,
            grossAmount: orderMilestonePayments.grossAmount,
            marketplaceFee: orderMilestonePayments.marketplaceFee,
            status: orderMilestonePayments.status,
            paidAt: orderMilestonePayments.paidAt
          })
          .from(orderMilestonePayments)
          .where(inArray(orderMilestonePayments.orderId, orderIds))
      ])
    : [[], []];

  // Los archivos del pedido (claves internas del storage) no forman parte de los datos personales
  const orderView = (o: (typeof asBuyer)[number], role: "comprador" | "artista") => ({
    numero: o.orderNumber,
    rol: role,
    estado: o.status,
    servicio: o.serviceSnapshot.title,
    extras: o.addonsSnapshot.map((a) => a.name),
    total: o.totalAmount,
    moneda: o.currency,
    modalidadDePago: o.paymentPlanSnapshot,
    // El brief y los términos aceptados son datos del comprador
    ...(role === "comprador"
      ? { brief: o.buyerBrief, tableroExterno: o.externalBoardUrl, terminosAceptados: o.termsSnapshot, terminosAceptadosEl: o.termsAcceptedAt }
      : {}),
    creado: o.createdAt,
    completado: o.completedAt,
    pagos: payments.filter((p) => p.orderId === o.id).map(({ orderId: _orderId, ...p }) => p),
    mensajesEnviados: myMessages.filter((m) => m.orderId === o.id).map(({ orderId: _orderId, ...m }) => m)
  });

  return {
    generado: new Date().toISOString(),
    nota: "Estos son los datos personales que TuPuestito conserva sobre tu cuenta (Ley 25.326, derecho de acceso).",
    cuenta: {
      id: account.id,
      nombre: account.name,
      usuario: account.username,
      email: account.email,
      emailVerificado: account.emailVerified,
      avatar: account.image,
      rol: account.role,
      verContenidoAdulto: account.showNsfw,
      mayoriaDeEdadDeclaradaEl: account.adultConfirmedAt,
      terminosAceptadosEl: account.termsAcceptedAt,
      versionDeTerminos: account.termsVersion,
      suspendidaEl: account.suspendedAt,
      motivoDeSuspension: account.suspensionReason,
      creadaEl: account.createdAt
    },
    metodosDeIngreso: logins.map((l) => ({ proveedor: l.providerId === "credential" ? "email y contraseña" : l.providerId, desde: l.createdAt })),
    sesiones: userSessions,
    perfilDeArtista: profile
      ? {
          bio: profile.bio,
          banner: profile.bannerUrl,
          estadoDeComisiones: profile.commissionStatus,
          marcaDeAgua: profile.defaultWatermarkMode,
          textoDeMarcaDeAgua: profile.watermarkCustomText,
          terminosDeServicio: profile.termsOfService,
          redes: profile.socialLinks,
          humanoVerificado: profile.isVerifiedHuman,
          creadoEl: profile.createdAt
        }
      : null,
    cuentasDeCobro: payAccounts,
    portfolio: portfolio.map((p) => ({ titulo: p.title, descripcion: p.description, imagen: p.imageUrl, clasificacion: p.rating, subidaEl: p.createdAt })),
    comisiones: services.map((s) => ({
      titulo: s.title,
      descripcion: s.description,
      precioArs: s.priceArs,
      modalidadDePago: s.paymentPlan,
      publicada: s.isActive,
      extras: addons.filter((a) => a.serviceId === s.id).map((a) => ({ nombre: a.name, precioArs: a.priceArs })),
      creadaEl: s.createdAt
    })),
    pedidosComoComprador: asBuyer.map((o) => orderView(o, "comprador")),
    pedidosComoArtista: asArtist.map((o) => orderView(o, "artista")),
    reseniasEscritas: written.map((r) => ({ estrellas: r.rating, comentario: r.comment, fecha: r.createdAt })),
    reseniasRecibidas: received.map((r) => ({ estrellas: r.rating, comentario: r.comment, fecha: r.createdAt })),
    denunciasRealizadas: made.map((r) => ({ tipo: r.targetType, motivo: r.reason, detalle: r.details, estado: r.status, fecha: r.createdAt })),
    consultasASoporte: support.map((s) => ({ codigo: s.code, tipo: s.kind, pedido: s.orderNumber, mensaje: s.message, estado: s.status, fecha: s.createdAt }))
  };
}

/**
 * Elimina la cuenta a pedido de su titular.
 *
 * - Sin historial de pedidos ni reseñas: se borra todo.
 * - Con historial: los pedidos son un registro contractual que también le pertenece a la otra
 *   parte (y que hay que conservar por obligaciones legales), así que la cuenta se anonimiza:
 *   se borran credenciales, perfil público, portfolio y cuentas de cobro, y los datos personales
 *   se reemplazan por un marcador.
 */
export async function deleteAccount(user: SessionUser): Promise<{ mode: "deleted" | "anonymized" }> {
  if (user.role === "ADMIN") {
    throw new HttpError(409, "Una cuenta de administración no se puede eliminar desde acá. Primero hay que quitarle el rol.");
  }
  const [profile] = await db.select().from(artistProfiles).where(eq(artistProfiles.userId, user.id)).limit(1);
  const mine = profile
    ? or(eq(commissionOrders.buyerId, user.id), eq(commissionOrders.artistId, profile.id))
    : eq(commissionOrders.buyerId, user.id);

  const active = await db
    .select({ id: commissionOrders.id })
    .from(commissionOrders)
    .where(and(mine, notInArray(commissionOrders.status, TERMINAL_STATUSES)));
  if (active.length > 0) {
    throw new HttpError(
      409,
      `Tenés ${active.length} pedido${active.length === 1 ? "" : "s"} en curso. Para eliminar tu cuenta primero tienen que terminar o cancelarse.`
    );
  }

  const [anyOrder] = await db.select({ id: commissionOrders.id }).from(commissionOrders).where(mine).limit(1);
  const [anyReview] = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.buyerId, user.id)).limit(1);
  const portfolio = profile ? await db.select({ imageKey: portfolioItems.imageKey }).from(portfolioItems).where(eq(portfolioItems.artistId, profile.id)) : [];
  const publicKeys = [
    storage.keyFromPublicUrl(user.image),
    storage.keyFromPublicUrl(profile?.bannerUrl),
    ...portfolio.map((p) => p.imageKey)
  ].filter((k): k is string => Boolean(k));

  let mode: "deleted" | "anonymized";
  if (!anyOrder && !anyReview) {
    // Las tablas dependientes (sesiones, credenciales, perfil, portfolio, comisiones) caen en cascada
    await db.delete(users).where(eq(users.id, user.id));
    mode = "deleted";
  } else {
    await db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      await tx.delete(accounts).where(eq(accounts.userId, user.id));
      await tx.delete(verifications).where(eq(verifications.identifier, user.email));
      if (profile) {
        await tx.delete(paymentAccounts).where(eq(paymentAccounts.artistId, profile.id));
        await tx.delete(portfolioItems).where(eq(portfolioItems.artistId, profile.id));
        await tx.update(commissionServices).set({ isActive: false }).where(eq(commissionServices.artistId, profile.id));
        await tx
          .update(artistProfiles)
          .set({
            bio: null,
            bannerUrl: null,
            commissionStatus: "CLOSED",
            watermarkCustomText: null,
            termsOfService: null,
            isVerifiedHuman: false,
            socialLinks: {}
          })
          .where(eq(artistProfiles.id, profile.id));
      }
      const placeholder = `eliminado_${user.id.replace(/-/g, "").slice(0, 12)}`;
      await tx
        .update(users)
        .set({
          name: "Usuario eliminado",
          email: `${placeholder}@eliminado.invalid`,
          emailVerified: false,
          image: null,
          username: placeholder,
          displayUsername: placeholder,
          showNsfw: false,
          adultConfirmedAt: null,
          deletedAt: new Date()
        })
        .where(eq(users.id, user.id));
    });
    mode = "anonymized";
  }

  // Los archivos públicos se borran al final: si algo falla arriba, no queda un perfil sin imágenes
  await Promise.all(publicKeys.map((key) => storage.delete("public", key).catch(() => {})));
  return { mode };
}

/** Formas de las respuestas de /api/admin (ver apps/api/src/routes/admin.routes.ts) */

export const TAB_KEYS = ["resumen", "reclamos", "denuncias", "pedidos", "usuarios", "soporte", "auditoria"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

/** Cambia de pestaña; `params` son filtros que viajan en la URL (para compartir el link) */
export type GoTo = (tab: TabKey, params?: Record<string, string>) => void;
/** Aviso flotante después de una acción */
export type Notify = (text: string, kind?: "ok" | "error") => void;

export interface Overview {
  counts: {
    users: number;
    artists: number;
    suspendedUsers: number;
    orders: number;
    activeOrders: number;
    completedOrders: number;
    openDisputes: number;
    openReports: number;
    openSupport: number;
    overdueOrders: number;
    unpaidStuckOrders: number;
  };
  oldestOpenDisputeAt: string | null;
  ordersByStatus: Record<string, number>;
  money: { gmv: number; fees: number; gmv30d: number; fees30d: number };
  launchChecklist: { key: string; ok: boolean; label: string; hint: string }[];
  rules: {
    depositExpirationHours: number;
    requestExpirationDays: number;
    reviewAutoApproveDays: number;
    paymentTimeoutDays: number;
    postDeliveryDisputeDays: number;
    platformFeePercent: number;
  };
  environment: { paymentsMode: string; storage: string; version: string; production: boolean };
}

export interface JobsResult {
  ok: boolean;
  timers: Record<string, number> | null;
  cleanup: Record<string, number> | null;
}

export interface AdminDispute {
  id: string;
  status: "OPEN" | "RESOLVED";
  reason: string;
  reasonLabel: string;
  description: string;
  openerRole: "BUYER" | "ARTIST" | "SYSTEM";
  statusBefore: string;
  hasProposal: boolean;
  resolution: string | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    serviceTitle: string;
    totalAmount: number;
    paidAmount: number;
    hasFinalDelivery: boolean;
    buyerUsername: string | null;
    artistUsername: string | null;
  };
}

export type ReportStatus = "OPEN" | "RESOLVED" | "DISMISSED";
export type ReportTargetType = "ARTIST" | "PORTFOLIO_ITEM" | "SERVICE" | "ORDER" | "REVIEW";

export interface AdminReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  reasonLabel: string;
  details: string;
  status: ReportStatus;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporterUsername: string | null;
  artistId: string | null;
  artistUserId: string | null;
  artistUsername: string | null;
  target: { label: string; imageUrl?: string | null; hidden?: boolean; text?: string | null };
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  paymentPlan: string;
  serviceTitle: string;
  statusChangedAt: string;
  workDueAt: string | null;
  createdAt: string;
  buyerUsername: string | null;
  artistUsername: string | null;
}

export interface AdminUser {
  id: string;
  name: string;
  username: string | null;
  email: string;
  role: "BUYER" | "ARTIST" | "ADMIN";
  emailVerified: boolean;
  suspendedAt: string | null;
  suspensionReason: string | null;
  deletedAt: string | null;
  createdAt: string;
  artistId: string | null;
  isVerifiedHuman: boolean | null;
  commissionStatus: "OPEN" | "WAITLIST" | "CLOSED" | null;
}

export interface SupportMessage {
  id: string;
  kind: "CONTACT" | "ARREPENTIMIENTO" | "DATA_REQUEST";
  code: string;
  userId: string | null;
  name: string;
  email: string;
  orderNumber: string | null;
  message: string;
  status: "OPEN" | "CLOSED";
  adminNote: string | null;
  handledById: string | null;
  handledAt: string | null;
  createdAt: string;
}

export interface AuditAction {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  adminUsername: string | null;
}

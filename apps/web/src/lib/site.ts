/**
 * Datos del sitio y de su titular. Los completa quien opera la plataforma con variables
 * NEXT_PUBLIC_* (se incrustan al compilar; ver .env.production.example).
 */
export const SITE_NAME = "TuPuestito";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const SITE_DESCRIPTION =
  "Encontrá artistas argentinos, pedí comisiones de ilustración con pago en etapas por Mercado Pago y apoyá el arte 100% humano.";

/** Casilla de soporte (la misma que SUPPORT_EMAIL de la API) */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "soporte@tupuestito.com.ar";

/** Titular del sitio: razón social o nombre, CUIT y domicilio legal (obligatorios en los textos legales) */
export const LEGAL = {
  name: process.env.NEXT_PUBLIC_LEGAL_NAME || "",
  taxId: process.env.NEXT_PUBLIC_LEGAL_CUIT || "",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "",
  /** Link del formulario 960/D "Data Fiscal" de ARCA (ex AFIP) del titular */
  dataFiscalUrl: process.env.NEXT_PUBLIC_DATA_FISCAL_URL || ""
};

/** Cómo nombrar al titular en los textos cuando todavía no se cargó la razón social */
export const LEGAL_OWNER = LEGAL.name || SITE_NAME;

/** Versión vigente de Términos y Privacidad (coincide con TERMS_VERSION de la API) */
export const TERMS_VERSION = "2026-11";
export const TERMS_UPDATED_LABEL = "noviembre de 2026";

/** Reglas de la plataforma que se citan en los textos (los valores reales llegan por /api/config) */
export const RULES = {
  minimumAge: 18,
  platformFeePercent: 5,
  depositExpirationHours: 72,
  requestExpirationDays: 7,
  reviewAutoApproveDays: 7,
  paymentTimeoutDays: 14,
  postDeliveryDisputeDays: 7,
  closedOrderFilesRetentionDays: 30
};

/** Ventanilla Única Federal de Defensa del Consumidor */
export const CONSUMER_DEFENSE_URL = "https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario";

/** Analítica sin cookies (opcional): dominio registrado en Plausible */
export const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN || "";

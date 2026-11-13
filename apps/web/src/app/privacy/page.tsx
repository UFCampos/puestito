import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/LegalDoc";
import { LEGAL, LEGAL_OWNER, PLAUSIBLE_DOMAIN, RULES, SUPPORT_EMAIL, TERMS_UPDATED_LABEL } from "@/lib/site";

export const metadata: Metadata = { title: "Política de Privacidad" };

const owner = [LEGAL.name || LEGAL_OWNER, LEGAL.taxId && `CUIT ${LEGAL.taxId}`, LEGAL.address && `con domicilio en ${LEGAL.address}`].filter(Boolean).join(", ");
const mail = <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

const sections: LegalSection[] = [
  { id: "responsable", title: "Responsable", body: <p>El responsable de la base de datos es {owner}. Contacto: {mail}.</p> },
  {
    id: "datos",
    title: "Qué datos tratamos",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Cuenta: nombre, usuario, email, foto de perfil y, si ingresás con Google o Discord, el identificador de esa cuenta.</li>
        <li>Artistas: perfil público, portfolio, comisiones, el identificador de su cuenta de Mercado Pago y los permisos de acceso, guardados cifrados (AES-256-GCM). Nunca guardamos datos de tarjetas.</li>
        <li>Pedidos: brief, referencias, mensajes, entregas, pagos y reseñas.</li>
        <li>Técnicos: dirección IP y navegador de tus sesiones.</li>
        <li>Consentimientos: fecha y versión de los términos aceptados y de la declaración de mayoría de edad.</li>
      </ul>
    )
  },
  {
    id: "finalidad",
    title: "Para qué los usamos",
    body: <p>Para prestar el servicio y ejecutar los pedidos que contratás, enviarte avisos sobre ellos, prevenir fraudes, moderar contenido y cumplir obligaciones legales y fiscales. No vendemos tus datos ni usamos tus obras para entrenar IA.</p>
  },
  {
    id: "terceros",
    title: "Con quién los compartimos",
    body: (
      <p>
        Con la otra parte de cada pedido (lo necesario para ejecutarlo) y con proveedores que los tratan por cuenta nuestra: Mercado Pago (pagos), Cloudflare (alojamiento de
        archivos), Resend (envío de emails), nuestro proveedor de servidores y Google o Discord si los usás para ingresar. Algunos están fuera de Argentina, lo que implica
        una transferencia internacional de datos con las garantías que exige la ley.
      </p>
    )
  },
  {
    id: "conservacion",
    title: "Cuánto tiempo los guardamos",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Referencias subidas que no llegan a usarse en un pedido: 24 horas.</li>
        <li>Archivos de pedidos rechazados, vencidos o cancelados: {RULES.closedOrderFilesRetentionDays} días desde su cierre.</li>
        <li>Pedidos y pagos: mientras exista la cuenta y luego el plazo que exigen las obligaciones contractuales y fiscales, sin datos personales si eliminaste tu cuenta.</li>
      </ul>
    )
  },
  {
    id: "derechos",
    title: "Tus derechos y cómo ejercerlos",
    body: (
      <>
        <p>
          Podés acceder, rectificar, actualizar y suprimir tus datos. Desde <Link href="/cuenta" className="underline">Mi cuenta</Link> podés descargar todo lo que guardamos
          y eliminar tu cuenta; también podés pedirlo a {mail}. Respondemos los pedidos de acceso dentro de los 10 días corridos y los de rectificación o supresión dentro de
          los 5 días hábiles.
        </p>
        <p>
          Al eliminar tu cuenta: si nunca tuviste pedidos, borramos todo. Si los tuviste, los conservamos sin tus datos personales, porque también son el registro de la otra
          parte.
        </p>
        <p className="rounded-xl bg-slate-50 p-3 text-xs">
          El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo
          que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN
          PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten
          afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.
        </p>
      </>
    )
  },
  { id: "seguridad", title: "Seguridad", body: <p>Los archivos de los pedidos son privados y solo se acceden con enlaces temporales; las credenciales de pago se guardan cifradas; las contraseñas, con hash.</p> },
  { id: "menores", title: "Menores de edad", body: <p>El servicio es para mayores de {RULES.minimumAge} años. Si detectamos una cuenta de un menor, la eliminamos.</p> },
  {
    id: "cookies",
    title: "Cookies",
    body: <p>Solo usamos las cookies necesarias para mantener tu sesión iniciada.{PLAUSIBLE_DOMAIN ? " Medimos visitas con Plausible, que no usa cookies ni identifica personas." : ""}</p>
  },
  { id: "cambios", title: "Cambios", body: <p>Si cambiamos esta política te avisaremos con anticipación.</p> },
  { id: "contacto", title: "Contacto", body: <p>{mail}</p> }
];

export default function PrivacyPage() {
  return <LegalDoc title="Política de Privacidad" subtitle={`Ley 25.326 de Protección de Datos Personales · Última actualización: ${TERMS_UPDATED_LABEL}`} sections={sections} />;
}

import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/LegalDoc";
import { CONSUMER_DEFENSE_URL, LEGAL, LEGAL_OWNER, RULES, SUPPORT_EMAIL, TERMS_UPDATED_LABEL } from "@/lib/site";

export const metadata: Metadata = { title: "Términos y Condiciones" };

const owner = [LEGAL.name || LEGAL_OWNER, LEGAL.taxId && `CUIT ${LEGAL.taxId}`, LEGAL.address && `con domicilio en ${LEGAL.address}`]
  .filter(Boolean)
  .join(", ");

const sections: LegalSection[] = [
  {
    id: "quienes-somos",
    title: "Quiénes somos",
    body: <p>TuPuestito es operado por {owner} (en adelante, “TuPuestito”). Podés contactarnos en <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
  },
  {
    id: "aceptacion",
    title: "Aceptación y capacidad",
    body: (
      <p>
        Para usar TuPuestito tenés que ser mayor de {RULES.minimumAge} años. Al crear tu cuenta aceptás estos Términos y la Política de Privacidad; guardamos la fecha y la
        versión que aceptaste.
      </p>
    )
  },
  {
    id: "que-es",
    title: "Qué es TuPuestito",
    body: (
      <>
        <p>
          TuPuestito es una vidriera y una herramienta de gestión para que artistas independientes ofrezcan comisiones de ilustración y compradores las encarguen. El
          contrato de cada comisión se celebra entre el artista y el comprador; TuPuestito actúa como intermediario tecnológico.
        </p>
        <p>TuPuestito no es una entidad financiera ni un proveedor de servicios de pago y no recibe ni custodia fondos de terceros: los pagos se acreditan directamente en la cuenta de Mercado Pago del artista.</p>
      </>
    )
  },
  {
    id: "cuentas",
    title: "Cuentas",
    body: <p>Tenés que dar datos veraces, usar una sola cuenta por persona y cuidar tu acceso. Sos responsable de lo que se haga desde tu cuenta. Podemos suspender cuentas según la sección de moderación.</p>
  },
  {
    id: "artistas",
    title: "Obligaciones de los artistas",
    body: (
      <p>
        El artista declara que su obra es propia y hecha por una persona, sin inteligencia artificial generativa; se compromete a cumplir lo que publica (descripción, plazos
        estimados, revisiones incluidas) y a vincular una cuenta de Mercado Pago a su nombre. Sus obligaciones impositivas por las ventas son propias. Sus términos
        particulares no pueden contradecir estos Términos ni la normativa de defensa del consumidor.
      </p>
    )
  },
  {
    id: "compradores",
    title: "Obligaciones de los compradores",
    body: <p>El comprador se compromete a describir claramente su pedido, a usar referencias sobre las que tenga derecho, y a revisar las entregas y realizar los pagos en los plazos de la sección 9.</p>
  },
  {
    id: "pedidos",
    title: "Pedidos",
    body: (
      <p>
        Un pedido pasa por solicitud, aceptación del artista, pagos y entregas. Al enviar la solicitud, el comprador acepta los términos del artista y la modalidad de pago
        (pago único al inicio; 50% de seña y 50% al aprobar el boceto o la vista previa final; o pago por etapas). Guardamos una copia inmutable de lo aceptado con fecha y
        hora. El pedido incluye la cantidad de revisiones indicada en la comisión.
      </p>
    )
  },
  {
    id: "pagos",
    title: "Pagos y comisión",
    body: (
      <p>
        Los pagos se procesan con Mercado Pago y van directo a la cuenta del artista. TuPuestito cobra una comisión del {RULES.platformFeePercent}% sobre cada pago, que
        Mercado Pago descuenta automáticamente. Los conceptos de cobro son neutros. El archivo original en alta calidad se habilita cuando el 100% del pedido figura
        acreditado, y vuelve a bloquearse si un pago es reembolsado o revertido.
      </p>
    )
  },
  {
    id: "plazos",
    title: "Plazos automáticos",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Una solicitud que el artista no responde vence a los {RULES.requestExpirationDays} días, sin cargo.</li>
        <li>El pago inicial debe hacerse dentro de las {RULES.depositExpirationHours} horas de aceptado el pedido; si no, vence.</li>
        <li>Una entrega (boceto, vista previa o etapa) que el comprador no revisa se aprueba automáticamente a los {RULES.reviewAutoApproveDays} días, con aviso previo.</li>
        <li>Si un pago posterior no se abona en {RULES.paymentTimeoutDays} días, el artista puede cerrar el pedido sin reembolsar lo ya trabajado.</li>
        <li>Los plazos de entrega son estimados y corren solo mientras el pedido está en manos del artista. Un atraso no cancela el pedido: avisamos a las partes y el comprador puede abrir un reclamo.</li>
      </ul>
    )
  },
  {
    id: "cancelaciones",
    title: "Cancelaciones y reembolsos",
    body: (
      <>
        <p>Antes de cualquier pago, cualquiera de las partes puede cancelar sin costo.</p>
        <p>
          Con pagos acreditados, el artista puede cancelar reembolsando todo lo cobrado. Un reembolso parcial o la cancelación sin reembolso solo procede por acuerdo de
          las partes dentro de un reclamo. Los reembolsos los emite el artista a través de Mercado Pago: TuPuestito no mueve dinero de terceros. La seña no es
          reembolsable una vez entregado el boceto, salvo acuerdo de las partes o lo que disponga la normativa vigente.
        </p>
      </>
    )
  },
  {
    id: "reclamos",
    title: "Reclamos y mediación",
    body: (
      <p>
        Cualquiera de las partes puede abrir un reclamo en un pedido con pagos acreditados; el comprador también puede hacerlo hasta {RULES.postDeliveryDisputeDays} días
        después de la entrega final. Mientras el reclamo está abierto, el pedido queda en pausa. Si las partes no llegan a un acuerdo, el equipo de TuPuestito puede decidir
        que el pedido continúe, cancelarlo o darlo por completado. Siempre conservás el derecho de reclamar ante Mercado Pago, ante Defensa del Consumidor o en la justicia.
        Los contracargos informados por Mercado Pago ponen el pedido en revisión.
      </p>
    )
  },
  {
    id: "arrepentimiento",
    title: "Derecho de arrepentimiento",
    body: (
      <p>
        Podés revocar la contratación dentro de los 10 días corridos (art. 34 de la Ley 24.240 y art. 1110 del Código Civil y Comercial). Las obras hechas según tus
        especificaciones pueden estar alcanzadas por la excepción del art. 1116 del Código Civil y Comercial; analizamos cada caso y siempre respondemos. Podés ejercerlo
        desde el <Link href="/arrepentimiento" className="underline">botón de arrepentimiento</Link>, sin registrarte.
      </p>
    )
  },
  {
    id: "propiedad",
    title: "Propiedad intelectual",
    body: (
      <p>
        El artista conserva los derechos de autor sobre sus obras. Salvo que la comisión diga otra cosa, el comprador recibe una licencia de uso personal y no comercial. El
        artista otorga a TuPuestito una licencia limitada para mostrar su portfolio en la plataforma. Nadie (ni TuPuestito) puede usar las obras para entrenar modelos de
        inteligencia artificial.
      </p>
    )
  },
  {
    id: "contenido",
    title: "Contenido permitido",
    body: (
      <p>
        Las obras y comisiones se clasifican como SFW, sugerentes o +18. El contenido +18 solo se muestra a personas que declararon ser mayores de edad. Está prohibido en
        forma absoluta: cualquier representación sexual de menores (incluidos dibujos y estilos que los representen), contenido no consentido, bestialismo, violencia
        extrema, contenido ilegal, obras generadas con IA y plagio.
      </p>
    )
  },
  {
    id: "moderacion",
    title: "Moderación y sanciones",
    body: (
      <p>
        Cualquier persona puede denunciar contenido. El equipo puede ocultar o eliminar obras, despublicar comisiones, ocultar reseñas y suspender cuentas. Una cuenta
        suspendida queda en solo lectura: sus pedidos sin pagar se cancelan y los que tienen pagos se revisan uno por uno. Ante contenido ilegal podemos dar intervención a
        las autoridades. La insignia “100% Humano Verificado” la otorga moderación.
      </p>
    )
  },
  { id: "resenas", title: "Reseñas", body: <p>Solo puede reseñar quien completó un pedido. Las reseñas tienen que ser honestas y respetuosas; las que no lo sean pueden ocultarse.</p> },
  {
    id: "responsabilidad",
    title: "Responsabilidad",
    body: (
      <p>
        TuPuestito responde por el funcionamiento de la plataforma conforme a la ley. Cada artista responde por las obras que ofrece y entrega. Nada de estos Términos limita
        los derechos que te reconoce la Ley de Defensa del Consumidor.
      </p>
    )
  },
  {
    id: "baja",
    title: "Baja de la cuenta",
    body: <p>Podés eliminar tu cuenta desde <Link href="/cuenta" className="underline">Mi cuenta</Link>. Qué pasa con tus datos está explicado en la <Link href="/privacy" className="underline">Política de Privacidad</Link>.</p>
  },
  { id: "cambios", title: "Cambios", body: <p>Si cambiamos estos Términos te avisaremos con anticipación. Los pedidos ya iniciados se rigen por lo que aceptaste al hacerlos.</p> },
  {
    id: "ley",
    title: "Ley aplicable y jurisdicción",
    body: (
      <p>
        Rige la ley de la República Argentina. Si sos consumidor, son competentes los tribunales de tu domicilio. Podés reclamar en la{" "}
        <a href={CONSUMER_DEFENSE_URL} target="_blank" rel="noopener noreferrer" className="underline">Ventanilla Única Federal de Defensa del Consumidor</a>.
      </p>
    )
  },
  { id: "contacto", title: "Contacto", body: <p>Escribinos a <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> o desde el <Link href="/ayuda#contacto" className="underline">Centro de ayuda</Link>.</p> }
];

export default function TermsPage() {
  return <LegalDoc title="Términos y Condiciones" subtitle={`Última actualización: ${TERMS_UPDATED_LABEL} · República Argentina`} sections={sections} />;
}

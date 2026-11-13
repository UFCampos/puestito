import type { Metadata } from "next";
import Link from "next/link";
import { SupportForm } from "@/components/support/SupportForm";
import { RULES } from "@/lib/site";

export const metadata: Metadata = {
  title: "Centro de ayuda",
  description: "Cómo funcionan las comisiones, los pagos, los plazos, los reclamos y los reembolsos en TuPuestito."
};

type Faq = { q: string; a: React.ReactNode };

const BUYERS: Faq[] = [
  {
    q: "¿Cómo pido una comisión?",
    a: "Entrá al puestito del artista, elegí una comisión y completá el pedido: contale qué querés, sumá hasta 10 imágenes de referencia y aceptá sus términos. El artista revisa la solicitud y la acepta o la rechaza. No pagás nada hasta que la acepte."
  },
  {
    q: "¿Cómo se paga?",
    a: "Con Mercado Pago, directo a la cuenta del artista. Cada artista elige la modalidad de cada comisión: pago único al inicio, 50% de seña y 50% al aprobar el boceto o la vista previa final, o pago por etapas (cada etapa se abona antes de que la empiece). Lo ves antes de pedir y queda guardado en el pedido."
  },
  {
    q: "¿Por qué veo la obra con marca de agua?",
    a: "Los bocetos y las vistas previas se muestran protegidos. El archivo original en alta calidad se habilita para descargar cuando el 100% del pedido está pago."
  },
  {
    q: "¿Qué pasa si no reviso una entrega?",
    a: `Te avisamos por email. Si pasan ${RULES.reviewAutoApproveDays} días sin que la apruebes o pidas cambios, se aprueba automáticamente para que el pedido no quede trabado.`
  },
  {
    q: "¿Y si no pago una etapa?",
    a: `El pago inicial tiene ${RULES.depositExpirationHours} horas; si no se abona, el pedido vence sin costo. Para los pagos siguientes, a los ${RULES.paymentTimeoutDays} días el artista puede cerrar el pedido, y lo ya pagado no se reembolsa porque corresponde al trabajo entregado.`
  },
  {
    q: "¿Puedo cancelar?",
    a: "Antes de pagar, sí, libremente desde la sala del pedido. Con un pago hecho, hablalo con el artista: puede cancelar reembolsándote, o pueden acordar otra cosa dentro de un reclamo."
  },
  {
    q: "El artista no responde o no entrega. ¿Qué hago?",
    a: `Escribile por el chat del pedido. Si no hay respuesta, abrí un reclamo desde la sala del pedido ("¿Algún problema con este pedido?"): el pedido queda en pausa y el equipo de TuPuestito interviene. También podés reclamar hasta ${RULES.postDeliveryDisputeDays} días después de recibir la entrega final.`
  },
  {
    q: "¿Cómo funcionan los reembolsos?",
    a: "TuPuestito no retiene tu dinero: cada pago va directo a la cuenta de Mercado Pago del artista. Por eso los reembolsos los emite el artista desde la plataforma, y vuelven por el mismo medio de pago. Si corresponde un reembolso y no lo recibís, podés iniciar además un reclamo en Mercado Pago desde el detalle del pago."
  },
  {
    q: "¿Qué es el botón de arrepentimiento?",
    a: (
      <>
        Es tu derecho a pedir la revocación de una compra online dentro de los 10 días. Lo encontrás al pie de todas las páginas o{" "}
        <Link href="/arrepentimiento" className="font-semibold text-purple-700 underline">acá</Link>.
      </>
    )
  }
];

const ARTISTS: Faq[] = [
  {
    q: "¿Cómo abro mi puestito y cuánto cuesta?",
    a: `Es gratis. Creá tu cuenta, abrí el puestito desde el panel, subí obras y publicá tus comisiones. TuPuestito cobra una comisión del ${RULES.platformFeePercent}% sobre cada pago que recibís; se descuenta sola en Mercado Pago.`
  },
  {
    q: "¿Por qué tengo que vincular Mercado Pago?",
    a: "Porque el dinero va directo a tu cuenta: nosotros no lo retenemos. Sin la cuenta vinculada no podés aceptar pedidos. La vinculás desde el Panel Artista."
  },
  {
    q: "¿Qué pasa si me atraso?",
    a: "El plazo es estimado y solo corre mientras el pedido está en tus manos (no mientras esperás al comprador). Si se vence, les avisamos a los dos. Nada se cancela solo, pero el comprador puede abrir un reclamo: avisale por el chat cómo venís."
  },
  {
    q: "¿Cómo cancelo un pedido que ya cobré?",
    a: "Desde la sala del pedido podés cancelarlo reembolsando todo lo cobrado. Si ya entregaste parte del trabajo y querés devolver solo una parte, abrí un reclamo y hacé una propuesta: el comprador tiene que aceptarla."
  },
  {
    q: "El comprador desapareció",
    a: `Si no revisa una entrega, se aprueba sola a los ${RULES.reviewAutoApproveDays} días. Si no paga la etapa siguiente, a los ${RULES.paymentTimeoutDays} días podés cerrar el pedido y liberar el cupo.`
  },
  {
    q: "¿Qué es la insignia “100% Humano Verificado”?",
    a: "La otorga el equipo de moderación a artistas cuyo proceso de trabajo pudo comprobar. No se puede comprar ni autoasignar."
  },
  {
    q: "¿Qué contenido está permitido?",
    a: (
      <>
        Arte propio y hecho por vos, sin IA generativa. El contenido +18 tiene que estar clasificado como tal y solo lo ven personas adultas que lo activaron.
        Está prohibido cualquier contenido ilegal, incluida toda representación sexual de menores. Más detalle en los{" "}
        <Link href="/terms" className="font-semibold text-purple-700 underline">Términos</Link>.
      </>
    )
  }
];

const COMMUNITY: Faq[] = [
  { q: "¿Cómo denuncio una obra, un puestito o una reseña?", a: "Con el botón “Denunciar” que aparece junto a cada contenido. La denuncia es confidencial y la revisa el equipo de moderación." },
  { q: "¿Qué pasa si suspenden una cuenta?", a: "La cuenta queda en solo lectura y su puestito deja de mostrarse. Sus pedidos sin pagar se cancelan, y los que tienen pagos quedan en pausa hasta que el equipo los revise uno por uno." },
  {
    q: "¿Cómo descargo o elimino mis datos?",
    a: (
      <>
        Desde <Link href="/cuenta" className="font-semibold text-purple-700 underline">Mi cuenta</Link> podés descargar todo lo que guardamos sobre vos y eliminar tu cuenta.
      </>
    )
  }
];

function Group({ title, items }: { title: string; items: Faq[] }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.map((f) => (
          <details key={f.q} className="rounded-2xl border border-slate-200 bg-white p-4 open:shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">{f.q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function AyudaPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold text-slate-900">Centro de ayuda</h1>
      <p className="mt-2 text-sm text-slate-600">Cómo funciona TuPuestito y qué hacer cuando algo no sale como esperabas.</p>
      <Group title="Para compradores" items={BUYERS} />
      <Group title="Para artistas" items={ARTISTS} />
      <Group title="Seguridad y comunidad" items={COMMUNITY} />

      <section id="contacto" className="mt-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">¿No encontraste lo que buscabas? Escribinos</h2>
        <p className="mt-1 text-sm text-slate-600">Si es sobre un pedido en curso, lo más rápido es abrir un reclamo desde la sala del pedido.</p>
        <div className="mt-5">
          <SupportForm kind="contact" />
        </div>
      </section>
    </main>
  );
}

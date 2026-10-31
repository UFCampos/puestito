# 🎪 Modelo de negocio y rentabilidad (v2)

> [!NOTE]
> **Documentos relacionados**
> - 🛍️ [Encuesta a compradores + plan de difusión](file:///C:/Users/lolog/.gemini/antigravity/brain/3676c15b-495d-49f4-9476-473a97001792/encuesta_compradores.md)
> - 💳 [Pagos: Mercado Pago + AstroPay](file:///C:/Users/lolog/.gemini/antigravity/brain/3676c15b-495d-49f4-9476-473a97001792/pagos_mercadopago_astropay.md)
> - 📊 [Planilla financiera editable](file:///f:/repos/TuPuestito/docs/modelo_financiero.xlsx)

> [!NOTE]
> **Cambios respecto a la v1**
> - Corregí la nota de sesgo: no es sesgo de tu círculo, es autoselección.
> - Pasé los montos de 2025 a hoy con inflación y dólar.
> - Los stands/merch quedan guardados para más adelante.
> - La tienda es el perfil del artista (como VGen), sin dominio propio.
> - El MVP cobra: Mercado Pago (ARS) y AstroPay (USD).
> - Escenarios rehechos para alguien solo, sin plata y con todo el tiempo.

> [!NOTE]
> Base: encuesta a **25 artistas** (fines de sep a principios de nov 2025). Dólar MEP hoy: **~ARS 1.560**. Las tarifas de terceros salen de búsquedas web y **hay que verificarlas en las fuentes oficiales**.

---

## 1. Qué dijo la encuesta (n = 25)

### Perfil
| Dato | Resultado |
|---|---|
| Hacen ilustración | 25/25 (100%) |
| Además venden merch | 10/25 (40%) · Cómics 3 · Música 2 · Diseño/servicios 1 |
| Canales actuales | **X/Twitter 52%** · **Instagram 40%** · Ferias 20% · Discord 20% · Mercado Libre 16% · VGen 12% · Facebook 12% · No vende aún 12% |
| Ventas/mes | <50K ARS: **10** · 50–100K: **6** · >200K: **5** · No vende: **4** |

### Dolores
| Problema | % |
|---|---|
| **Falta de visibilidad** | **88%** (22/25) |
| Comisiones altas | 28% (7/25) |
| Logística cara/lenta | 16% (4/25) |
| Configuración complicada | 12% (3/25) |

### Qué funciones valoran
| Función | % |
|---|---|
| **Pagos internacionales USD/EUR** | **72%** (18) |
| **Galería visual de arte** | **68%** (17) |
| **Tienda gratis sin fees mensuales** | **48%** (12) |
| Comisiones bajas | 28% (7) |
| Envíos locales baratos | 20% (5) |
| Login con Pixiv/X/DeviantArt | 16% (4) |
| **Feed comunitario tipo Pixiv** | **8%** (2) |

### Intención
- **Sí 60%** · Tal vez 28% · Depende 12% · **No 0%**.
- Quieren que los contactes para la beta: **21/25 (84%)**.
- Importancia de pagos en pesos + envíos locales: **4.0/5**.

### 🔍 Conclusiones
1. **El problema real es visibilidad, no precio.** 88% contra 28% en comisiones. Hay que competir por **descubrimiento**.
2. **Cobrar USD fácil es la función estrella** (72%). Ahí es donde AstroPay puede ser un diferencial real.
3. **No construyas un clon de Pixiv.** El feed comunitario lo pidió 8%. La galería/portfolio sí (68%).
4. **Pareto fuerte:** los 5 artistas de >200K generan ~68% de las ventas de la muestra. Hay que sumar primero a los "artistas ancla".
5. **Onboarding simple:** objetivo, perfil listo en menos de 5 minutos.
6. **Los canales son X e Instagram.** Ahí está el marketing: `Tutupuestito.com.ar/artista` para poner en la bio.

> [!NOTE]
> **Sobre el sesgo, tenés razón.** Reclutaste sin sesgo de círculo (conocés a menos del 15%). Lo que queda es **autoselección**: quienes responden una encuesta sobre una plataforma así suelen ser los más interesados, y el reclutamiento por internet alcanza más a artistas activos en X/Discord. No invalida nada, pero conviene tenerlo en cuenta en los porcentajes de interés.
>
> **Sobre la conversión:** concuerdo con que hoy el panorama es otro. Esa conversión de 10–25% era para una idea sin producto. Con un MVP funcional y más canales de reclutamiento, los números serán distintos.
>
> **Lo que falta** (ya preparado en la [encuesta](file:///C:/Users/lolog/.gemini/antigravity/brain/3676c15b-495d-49f4-9476-473a97001792/encuesta_compradores.md)): datos de compradores, preguntas de precios y método preferido para cobrar USD.

---

## 2. Cuánto se vende hoy, ajustado por inflación

La encuesta se hizo entre fines de sep y principios de nov 2025. Pasé los montos a hoy con:
- **Inflación INDEC oct-2025 → sep-2026: 33,4%.**
- **Dólar MEP:** 1.477 (fin oct-2025) → 1.560 (hoy), **+5,6%**.
- En términos reales, los pesos rinden **~26% más en dólares** que hace un año.

| Tramo (puntos medios) | Artistas | Ventas 2025 | Ajustado a hoy |
|---|---|---|---|
| Menos de \$50K | 10 | US\$17 | **US\$21** |
| \$50–100K | 6 | US\$51 | **US\$64** |
| Más de \$200K | 5 | US\$203 | **US\$257** |

| | 2025 (dólar de entonces) | Hoy, ajustado |
|---|---|---|
| GMV mensual de los 25 artistas | US\$1.489 | **US\$1.881** |
| Promedio por artista que vende (21) | US\$71 | **US\$90** |

> [!WARNING]
> **Supuesto fuerte:** que los artistas subieron sus precios al ritmo de la inflación. Si no, el valor real es menor. Está como pregunta A6 en la encuesta de seguimiento.

En la v1 había usado montos de 2025 con el dólar de hoy (**US\$67**), por eso subestimaba el valor real en un ~25%.

**Supuesto para el modelo:** si la plataforma capta la mitad de esas ventas al principio, queda **~US\$45/mes por artista activo**.

Con un take rate de 5% sobre una comisión de US\$30 (ARS 46.800):
| Concepto | Monto |
|---|---|
| Fee bruto | ARS 2.340 |
| Menos IVA 21% | ARS 1.934 |
| Menos Ingresos Brutos (~3%) | **ARS ~1.876 ≈ US\$1,20 por comisión** |

Cada comisión aporta poco, **la plata sale del volumen**.

---

## 3. Modelo de negocio

### Cómo funciona
Como VGen: **el perfil del artista es su tienda.** Portfolio, hoja de comisiones, solicitud de pedido y cobro, todo en un mismo lugar con una URL corta (`Tutupuestito.com.ar/nombre`).

| Para… | Valor |
|---|---|
| **Artista** | Perfil/portfolio gratis, ser descubierto (SEO + tags por fandom), **cobrar ARS y USD sin lío**, onboarding en 5 minutos. |
| **Comprador** | Buscar comisiones por estilo, personaje y precio, con precios claros y pago por etapas. |

> [!NOTE]
> **Stands/merch (estilo BOOTH): guardado para más adelante.** La prioridad del MVP son las comisiones. La base técnica (perfil, catálogo, pedidos) se diseña para poder sumar productos físicos después.

### Fuentes de ingreso
| # | Fuente | Detalle | Prioridad |
|---|---|---|---|
| 1 | **Take rate** | **5% IVA incl.** sobre ventas por la plataforma. Primeros 6 meses: 3% para "artistas fundadores". | 🟢 Base |
| 2 | **Plan Pro** (opcional) | ~ARS 6.000/mes: estadísticas, **destacados en el buscador**, personalización del perfil, fee 3%. El plan gratis es completo. | 🟡 Fase 2 |
| 3 | **Destacados / eventos** | Posiciones destacadas por fandom o por temporada. | 🟡 Fase 2–3 |
| 4 | **Sponsors** | Marcas de materiales, tabletas, convenciones. | 🟡 Oportunista |
| 5 | Stands, merch, print-on-demand | Guardados. | ⚪ Futuro |

**Sobre el dominio propio:** como el perfil es la tienda, **lo saqué del plan Pro.** Si más adelante hay demanda, se puede ofrecer un **subdominio** (`nombre.Tutupuestito.com.ar`) en lugar de dominio propio: es mucho más simple y mantiene el tráfico dentro de la plataforma. Lo decidís cuando llegue el momento.

### Comisión total que ve el artista (Mercado Pago, con IVA, sin plazo configurable)
| Liberación | MP con IVA | + Plataforma 5% | Total |
|---|---|---|---|
| Inmediata | 7,61% | 5% | **12,6%** |
| 10 días | 5,31% | 5% | 10,3% |
| 18 días | 4,10% | 5% | 9,1% |

El plazo seguramente es un ajuste de **la cuenta de cada artista en Mercado Pago**, no algo que configure la plataforma por pago (ver [pagos](file:///C:/Users/lolog/.gemini/antigravity/brain/3676c15b-495d-49f4-9476-473a97001792/pagos_mercadopago_astropay.md)). En el modelo uso el caso conservador: **inmediata (12,6%)**.

Referencia (verificar): VGen 5% + procesador · BOOTH 5,6% + fijo por pedido · Cafecito 5% + MP.

### Estrategia de pagos
| Moneda | Solución | Cuándo |
|---|---|---|
| **ARS** | Mercado Pago split 1:1 (dinero directo al artista, sin custodiar) | MVP |
| **USD** | **AstroPay** | Cuando den acceso. Mientras tanto: registro, sandbox y pitch de piloto |
| **Confianza** | Pago por etapas (50% reserva / 50% entrega), reseñas, verificación | MVP / Fase 2 |

Detalles técnicos, preguntas para AstroPay y mails en el [documento de pagos](file:///C:/Users/lolog/.gemini/antigravity/brain/3676c15b-495d-49f4-9476-473a97001792/pagos_mercadopago_astropay.md).

> [!IMPORTANT]
> **Evitá custodiar fondos de terceros.** Con el split de Mercado Pago el dinero va directo al artista. Con AstroPay, usalo **solo si también acredita directo al artista**; si te piden que la plata pase por tu cuenta, desistí de esa vía y lanzá solo con ARS. Reglas completas en el [documento de pagos](file:///C:/Users/lolog/.gemini/antigravity/brain/3676c15b-495d-49f4-9476-473a97001792/pagos_mercadopago_astropay.md).

---

## 4. Costos (estimación, USD/mes)

| Rubro | Lean (VPS + autogestión) | Normal (con equipo) |
|---|---|---|
| Infra (VPS ~US\$5–7 + dominio `.com.ar` + Cloudflare R2/free tiers) | **8** | 100 |
| Contador + legales | **0** *(autogestión en ARCA)* | 100 |
| Moderación / soporte | **0** *(lo hacés vos)* | 400 |
| Marketing | **0** *(100% orgánico / sorteos con artistas)* | 300 |
| Herramientas | **0** *(open-source / free tiers)* | 50 |
| **Total** | **≈ US\$8** | **≈ US\$950** |

> [!TIP]
> **¿Cómo operar sin contador ni abogado al inicio?**
> - **Sin abogado:** seguí las 10 reglas de no custodia del [documento de pagos](file:///C:/Users/lolog/.gemini/antigravity/brain/3676c15b-495d-49f4-9476-473a97001792/pagos_mercadopago_astropay.md) y adaptá los Términos y Condiciones públicos de plataformas similares (Cafecito, VGen).
> - **Sin contador:** no necesitás armar una sociedad (SRL/SAS) para arrancar. Podés operar como persona física bajo el **Monotributo** en ARCA (ex-AFIP), que se gestiona 100% online sin contador.
> - **Dato clave del Monotributo:** si aún no sos monotributista, la **Categoría A** cuesta **$49.527 ARS/mes (~US\$32/mes)** y te permite facturar hasta ~$12M ARS/año (~US\$7.700/año en comisiones tuyas). No hace falta que te des de alta el día 1 de programación: podés darte de alta recién cuando lances los cobros en producción y empieces a recibir el `marketplace_fee`. Si además trabajás en relación de dependencia, pagás solo el componente impositivo (~$4.000–$6.000 ARS/mes).

Variables: fraude/disputas ~0,5% del GMV, infra y soporte variable ~0,3%.
Con el fee de 5% (IVA incl.) o equivalente para monotributista y descontando IIBB (3%) y variables, **queda ≈ 3,2% a 4,0% del GMV como contribución.**

---

## 5. Rentabilidad: escenarios a 12 meses

Fuente: [planilla editable](file:///f:/repos/TuPuestito/docs/modelo_financiero.xlsx), hoja *Escenarios*. Incluye plan Pro (con fee 3%) e IIBB. **Antes de sueldos.**

| Escenario | Artistas activos | GMV/artista | GMV total/mes | Ingresos netos/mes | Costos fijos | **Resultado operativo/mes** |
|---|---|---|---|---|---|---|
| 😿 Pesimista (VPS lean) | 150 | US\$30 | US\$4.500 | ~US\$198 | US\$8 | **≈ +US\$154** |
| 🌸 **Base (VPS lean)** | 400 | US\$45 | US\$18.000 | ~US\$788 | US\$8 | **≈ +US\$636** |
| 🌸 Base + equipo | 400 | US\$45 | US\$18.000 | ~US\$788 | US\$950 | **≈ –US\$306** |
| ✨ Optimista | 1.000 | US\$65 | US\$65.000 | ~US\$2.780 | US\$950 | **≈ +US\$1.310** |

*(Nota: si sumás los ~US\$32/mes de la cuota completa del Monotributo Cat. A como gasto fijo del proyecto, restale US\$32 al resultado operativo Lean: queda **+US\$122/mes** en el Pesimista y **+US\$604/mes** en el Base).*

### Punto de equilibrio (a US\$45/artista, sin Pro)
| Take rate | Costos Lean VPS (US\$8) | Lean + Monotributo (US\$40) | Costos Normal (US\$950) |
|---|---|---|---|
| 3% | ~12 artistas | ~56 artistas | ~1.315 artistas |
| **5%** | **~6 artistas** | **~28 artistas** | **~658 artistas** |
| 7% | ~4 artistas | ~19 artistas | ~439 artistas |
| 10% | ~3 artistas | ~13 artistas | ~293 artistas |

### 🎯 Veredicto
> [!TIP]
> - **Hosteando en un VPS y sin contador ni abogado fijo, el riesgo financiero es casi cero.** Con US\$8/mes de infra, empatás los gastos del servidor con apenas **6 artistas activos** (o **~28 artistas activos** si también cubrís la cuota completa del Monotributo Categoría A).
> - **Da ganancia desde el escenario pesimista:** con 150 artistas activos ya te quedan **~US\$120–150/mes limpios**, y en el escenario base (400 artistas) unos **~US\$600–636/mes**.
> - **Crecimiento orgánico:** podés mantener esta estructura ultra-lean hasta que el volumen de facturación te obligue a subir de categoría de Monotributo o armar una sociedad, momento en el cual la misma plataforma ya se paga sola el contador.

---

## 6. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| **Huevo y gallina** (artistas sin compradores) | Artistas ancla, SEO por fandom, tráfico desde X/IG, y que los artistas lleven a su propia audiencia. |
| **Acceso a AstroPay** | Empezar por ARS con Mercado Pago, registrarse en el sandbox y presentar un piloto con datos reales. Plan B: PayPal/Wise. |
| **Propiedad intelectual de fanart** | Política tipo doujin (pequeñas tiradas, sin logos oficiales), takedown rápido. Validar con tu abogado. |
| **Arte generado por IA** | Política explícita (prohibir o etiquetar). |
| **Disputas en comisiones** | Pago por etapas, estados claros del pedido, reglas de reembolso. |
| **Regulación** | Defensa del Consumidor, protección de datos, IVA/IIBB, posible encuadre como PSP si se custodian fondos. |
| **Volatilidad del peso** | Precios en ARS y USD. |
| **Login con Pixiv** | No tiene OAuth público abierto que yo sepa (verificar). Con 16% de interés, usar X/Google/Discord. |

---

## 7. Hoja de ruta

| Fase | Objetivo | Contenido |
|---|---|---|
| **0: Validar (2–4 sem, en paralelo)** | Demanda y acceso a pagos | Encuesta de compradores + seguimiento a artistas, landing con lista de espera, registro en AstroPay sandbox. |
| **1: MVP** | Visibilidad + comisiones con cobro | Perfil/portfolio, galería con tags, hoja de comisiones, solicitud de pedido, estado del pedido, **cobro en ARS por Mercado Pago (split)**, pago por etapas, login X/Google/Discord, SEO, ES/EN. |
| **2: USD y confianza** | Diferencial | **Cobro en USD con AstroPay**, reseñas, verificación, Plan Pro. |
| **3: Stands/merch** | Guardado | Productos físicos, eventos de feria virtual. |
| **4: Escala** | LatAm | Otros países, logística. |

---

## 8. Tus respuestas y lo que queda abierto

**Ya definido:** sos solo, cero plata y todo el tiempo, sin comunidad ni socios, plataforma para todo el arte argentino con foco inicial en anime/fandom, tienda = perfil, comisiones primero.

**Pendiente:**
1. **Lanzar la encuesta de compradores** y la de seguimiento a artistas.
2. **Registrarte en AstroPay (sandbox)** y ver qué piden.
3. **Seguir las reglas de "sin custodia"** de la sección 1.1 del documento de pagos y redactar los Términos (sin abogado, adaptando los públicos de VGen/BOOTH/Cafecito). Si algún día surge una revisión puntual, mejor.
4. **¿Armamos el plan técnico del MVP?** Stack, modelo de datos, pantallas y orden de construcción pensado para alguien solo y sin presupuesto.


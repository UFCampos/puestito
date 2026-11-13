# Guía de moderación

Todo se hace desde `/admin`. Cada acción queda registrada en **Auditoría**.

## Alta del equipo
Agregá el email a `ADMIN_EMAILS` y redeployá. La cuenta pasa a ADMIN cuando tiene el email verificado (al arrancar la API o al ingresar). Quitar el email de la lista **no** le saca el rol: eso se hace a mano en la base (`UPDATE users SET role='BUYER' WHERE ...`).

## Denuncias
1. **Contenido ilegal o sexualización de menores (URGENTE):** eliminá la obra (borra también el archivo), suspendé la cuenta y evaluá la denuncia ante las autoridades. No descargues ni reenvíes el material.
2. **IA / arte robado:** pedile al artista el proceso (bocetos, capas). Si no lo justifica, ocultá u eliminá la obra y quitá la insignia "100% Humano".
3. **Clasificación +18 incorrecta:** ocultá la obra y pedile que la vuelva a subir bien clasificada.
4. **Estafa, acoso, spam:** revisá los pedidos y el hilo; suspendé si corresponde.
Cerrá la denuncia como *resuelta* (tomaste una medida) o *desestimada*, con una nota.

## Reclamos
Un reclamo pone el pedido en pausa. Antes de decidir, leé el hilo (podés escribir en él como equipo) y dales tiempo a las partes para acordar: el artista puede reembolsar o proponer un reembolso parcial que el comprador acepta.
- **El pedido continúa:** vuelve donde estaba (por ejemplo, el artista respondió y va a entregar).
- **Cancelar:** cierra el pedido. **La plataforma no mueve dinero**: si corresponde un reembolso, lo emite el artista desde la sala o lo decide Mercado Pago en su propio reclamo. Dejalo explicado en la nota.
- **Dar por completado:** libera el original. Solo con entrega final y 100% pago.
Los reclamos que abre el sistema (contracargo, reclamo en Mercado Pago, cuenta suspendida) siempre los resuelve el equipo.

## Suspensiones
Una cuenta suspendida queda en solo lectura y su puestito sale de la vidriera. Sus pedidos sin pagar se cancelan y los que tienen pagos pasan a reclamo: resolvelos uno por uno. Reactivar no reabre los cancelados.

## Soporte
- **Botón de arrepentimiento:** la constancia con el código se envía sola. Hay que contactar a la persona dentro de las 24 hs, analizar el pedido (excepción del art. 1116 CCyC para obras a medida según la etapa) y responder por escrito.
- **Consultas:** respondé desde el link de email (ya lleva el código en el asunto) y cerrá la gestión con una nota.
- **Datos personales:** las personas pueden exportar y eliminar su cuenta solas desde `/cuenta`; si lo piden por email, guialas ahí o hacelo por ellas en un plazo de 10 días.

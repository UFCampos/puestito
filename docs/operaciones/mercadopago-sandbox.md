# Prueba de Mercado Pago en sandbox

Los tests automáticos usan el simulador (`PAYMENTS_MODE=mock`). Antes de lanzar hay que recorrer el flujo real con credenciales de prueba.

## Preparación
1. En developers.mercadopago.com creá dos **usuarios de prueba**: uno vendedor (artista) y uno comprador.
2. Usá las credenciales de prueba de tu app Marketplace en `MP_CLIENT_ID` / `MP_CLIENT_SECRET`, `PAYMENTS_MODE=live`.
3. Exponé la API con HTTPS (el VPS de staging o un túnel) y configurá el webhook del evento *Pagos* con su `MP_WEBHOOK_SECRET`.

## Recorrido (qué verificar en cada paso)
| Paso | Qué verificar |
|---|---|
| Vincular MP desde el panel del artista (con el usuario vendedor) | Vuelve a `/dashboard?mp=connected`; en la base, `payment_accounts.live_mode` es `false` |
| Pedido 50/50 → aceptar → pagar seña con el comprador de prueba y una [tarjeta de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards) | Al volver con `payment_id`, el pedido pasa solo a "Boceto en proceso"; llega el webhook firmado (sin 401 en los logs) |
| Cuenta del vendedor | El cobro aparece con el **descuento del 5%** (`marketplace_fee`) |
| Pagar con tarjeta rechazada | El pedido no avanza y el pago queda "Rechazado" |
| Completar el pedido | El original se descarga solo con el 100% acreditado |
| Reembolso desde la sala ("Cancelar y reembolsar todo") | Mercado Pago devuelve el dinero; el webhook marca el pago como reembolsado y el pedido cancelado |
| Reclamo/contracargo desde el comprador en MP | El pedido pasa a "En reclamo" y aparece en `/admin` → Reclamos; aviso en Discord |
| Token del artista | Forzar `token_expires_at` a una fecha cercana y crear un checkout: el token se refresca solo |

Revisá el canal de Discord y `/admin` → Auditoría después de cada paso.

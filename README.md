# Landing de motivación de ventas

Pantalla con el total de ventas del programa **APRENDE INGLÉS CON SPEAK EASY G2** en tiempo real. Cada compra nueva sube el contador, lanza una lluvia de billetes en 3D y suena una caja registradora.

**Stack:** Next.js 16 (App Router) · Three.js + cannon-es · Howler.js · PostgreSQL (`pg`) · Tailwind CSS 4 · Vitest

## De dónde salen las ventas

La landing **no recibe webhooks ni tiene base de datos propia**. Las ventas ya las registra **inventario-speakeasy** en su módulo Administrativo → Cartera, por cuatro caminos:

- webhook de Hotmart;
- webhook de Stripe (Payment Links);
- altas manuales, por ejemplo Zelle;
- importación desde Excel.

La landing lee en **solo lectura** la tabla `cartera_compras` filtrada por el programa (`CARTERA_PRODUCTO_ID`). Cuenta una venta por compra (comprador), no por cuota.

```
Hotmart / Stripe / admin ──► inventario-speakeasy ──► cartera_compras (Postgres)
                                                            ▲
                          pantalla ──(cada 2 s)──► /api/sales/count (esta app)
```

### Por qué polling y no WebSocket

- **Capta los 4 caminos sin modificar inventario.** Un push obligaría a instrumentar cada punto donde se crean compras.
- **Encaja con Vercel.** Un `LISTEN/NOTIFY` de Postgres necesitaría un proceso siempre encendido, y Vercel no lo ofrece.
- **La latencia no se nota.** 2 s es menos de lo que Hotmart tarda en enviar su propio webhook.
- **Es barato.** Cada consulta sin novedades es una sola query indexada. Solo cuando llega una compra se hace una segunda para saber cuántas son.

Para tener *push* real en el futuro, basta con reemplazar `app/hooks/useSalesFeed.ts`; el resto no cambia.

## Configuración

1. **Variables de entorno.** Copia [`.env.example`](.env.example) como `.env.local` y complétalo; en Vercel, define las mismas variables:

   | Variable | Uso |
   | --- | --- |
   | `DATABASE_URL` | La misma de inventario-speakeasy. La landing solo hace `SELECT` en transacciones de solo lectura, así que no puede modificar nada. |
   | `CARTERA_PRODUCTO_ID` | Id del programa en la cartera (`79e47346-0188-4aa8-b706-818b68442866` para G2). |
   | `NEXT_PUBLIC_SALES_POLL_MS` | Opcional: intervalo de consulta en ms (por defecto 2000). |

2. `npm install && npm run dev` y abre http://localhost:3000.

**Opcional, más seguridad:** si alguien con acceso de superusuario al servidor de Postgres ejecuta [`scripts/sql/readonly-role.sql`](scripts/sql/readonly-role.sql), la landing puede usar un usuario propio que solo lee las columnas necesarias. Así, si su clave se filtrara desde Vercel, no daría acceso al resto de la base de inventario.

> El sonido va al volumen máximo, pero el navegador lo bloquea hasta la primera interacción: al abrir la pantalla de la oficina, pulsa **Activar sonido** (o haz clic en cualquier parte). El botón desaparece en cuanto el audio queda activo.

## Cómo probar

| Qué | Cómo |
| --- | --- |
| Tests unitarios | `npm test` |
| Animación y sonido, sin crear registros | En [`app/config/modo-prueba.ts`](app/config/modo-prueba.ts) pon `activo: true`: simula una venta cada `cadaSegundos` y muestra la etiqueta "MODO PRUEBA". Déjalo en `false` antes de desplegar. |
| Una venta simulada al instante | En `npm run dev`, pulsa la tecla <kbd>V</kbd>. |
| Flujo completo en local | Usa una Postgres local, por ejemplo `npx prisma dev`, que imprime la URL `postgres://…` de la línea **TCP**. Ponla en `DATABASE_URL`, ejecuta `npm run local:setup` y luego `npm run local:compra` (admite `--count 3`, `--metodo ZELLE`, `--monto 180`). Con la landing abierta, cada compra se celebra. El script se niega a escribir en bases que no sean `localhost`. |
| En producción | Registra una venta de prueba en la cartera de G2 desde inventario y bórrala después. El contador sube con celebración y luego baja sin celebrar. |

## Comportamiento

- **Pantalla:** solo el número del total, centrado, y el botón "Activar sonido" hasta que se pulse.
- **Primera venta del programa (0 → 1):** se celebra igual que las demás.
- **Compra nueva:** +1 con lluvia de billetes de 100 dólares y sonido de caja registradora.
- **Varias compras juntas (hasta 5):** se celebran una a una, cada 650 ms.
- **Más de 5 en una consulta:** se trata como importación masiva o reconexión. El número se actualiza sin celebrar.
- **Compras borradas:** el número baja sin celebrar.
- **Sin conexión:** el número se queda en el último valor y la pantalla reintenta en segundo plano (hasta cada 30 s).

## API

`GET /api/sales/count[?after=<cursor>]` devuelve:

```json
{ "count": 132, "cursor": "2026-09-30T20:17:33.662104Z|<uuid>", "sales": [], "serverTime": "…" }
```

- **`count`:** total de compras del programa.
- **`cursor`:** posición de la compra más reciente (`created_at` con microsegundos + id). Se envía como `after` en la siguiente consulta.
- **`sales`:** compras posteriores al `after` recibido, como máximo las 20 más recientes, en orden cronológico.

## Estructura

```
app/
  config/modo-prueba.ts interruptor del modo prueba (ventas simuladas)
  api/sales/count/      endpoint que consulta la cartera
  components/           SalesLanding (orquesta), Counter, BilletsScene
  hooks/                useSalesFeed (polling con cursor), useCashSound (Howler)
  lib/
    bills/              engine.ts (Three.js + cannon-es), aerodynamics.ts (física del papel)
    db.ts sales.ts      pool de Postgres y consultas de la cartera
    sales-cursor.ts     formato del cursor
    http.ts rate-limit.ts logger.ts
public/textures/bill.svg  billete de 100 dólares: frente arriba y reverso abajo (regenerable con `npm run texture:generate`)
public/sounds/cash.wav    sonido (regenerable con `npm run sound:generate`)
scripts/
  sql/readonly-role.sql         opcional: usuario de acceso mínimo
  sql/local-cartera-schema.sql  réplica mínima de las tablas para desarrollo
  local-cartera.mjs             crea tablas y simula compras en local
  generate-bill-texture.mjs     genera la textura del billete
  generate-cash-sound.mjs       genera el sonido
tests/                    Vitest
```

## Límites conocidos

- **Pantalla pública.** La landing y `GET /api/sales/count` no tienen autenticación: cualquiera con la URL ve el total de ventas de G2. Si es sensible, usa Vercel Password Protection o un `proxy.ts` con Basic Auth.
- **Rate limiting en memoria.** El límite es por instancia serverless, no global.
"# landing-motivacion-ventas" 

import "server-only";

import { withReadOnlyTransaction } from "./db";
import { parseCursor, type SalesCursor } from "./sales-cursor";
import type { SaleEvent, SalesSnapshot } from "./sales-types";

/** Máximo de compras nuevas devueltas por consulta. */
export const MAX_FEED_SALES = 20;

/** created_at en UTC con microsegundos, el formato que usa el cursor (ver sales-cursor.ts). */
const CREATED_AT_TEXT = `to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

type NewSaleRow = { id: string; created_at: string };

/**
 * Total de compras del programa y, si se indica `after`, las compras creadas
 * después de ese cursor.
 *
 * Coste por consulta: una query indexada (producto_id) cuando no hay novedades
 * —el caso normal— y una segunda solo cuando llegó alguna compra. Ambas corren
 * en una transacción de solo lectura (ver withReadOnlyTransaction).
 */
export function getSalesSnapshot(productId: string, after: SalesCursor | null): Promise<SalesSnapshot> {
  return withReadOnlyTransaction(async (db) => {
    const { rows } = await db.query<{ total: number; cursor: string | null }>(
      `SELECT
         (SELECT count(*)::int FROM cartera_compras WHERE producto_id = $1) AS total,
         (SELECT ${CREATED_AT_TEXT} || '|' || c.id
            FROM cartera_compras c
           WHERE c.producto_id = $1
           ORDER BY c.created_at DESC, c.id DESC
           LIMIT 1) AS cursor`,
      [productId],
    );
    const { total, cursor } = rows[0] ?? { total: 0, cursor: null };

    let sales: SaleEvent[] = [];
    const latest = cursor ? parseCursor(cursor) : null;
    const hasNewer = latest !== null && (latest.createdAt !== after?.createdAt || latest.id !== after?.id);

    if (after !== null && hasNewer) {
      // Las más recientes primero (para quedarnos con las últimas si hay muchas)
      // y luego se invierten para celebrarlas en orden cronológico.
      const result = await db.query<NewSaleRow>(
        `SELECT c.id, ${CREATED_AT_TEXT} AS created_at
           FROM cartera_compras c
          WHERE c.producto_id = $1
            AND (c.created_at, c.id) > ($2::timestamptz, $3::uuid)
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT ${MAX_FEED_SALES}`,
        [productId, after.createdAt, after.id],
      );
      sales = result.rows.reverse().map((row) => ({ id: row.id, createdAt: row.created_at }));
    }

    return { count: total, cursor, sales, serverTime: new Date().toISOString() };
  });
}

import "server-only";

import { Pool, type PoolClient } from "pg";

/**
 * Pool de conexiones a la base de inventario-speakeasy (solo lectura).
 *
 * La landing no tiene base propia: las ventas las registra inventario (Hotmart,
 * Stripe, altas manuales e importaciones) y aquí solo se consultan, siempre
 * dentro de transacciones READ ONLY. Puede usar la misma DATABASE_URL de
 * inventario u, opcionalmente, un usuario mínimo (scripts/sql/readonly-role.sql).
 *
 * - Perezoso: importar este módulo durante `next build` no abre conexiones.
 * - En `globalThis` para reutilizarlo entre invocaciones de una misma
 *   instancia serverless y entre recargas en desarrollo.
 */
const globalForDb = globalThis as unknown as { salesDbPool?: Pool };

export function getDb(): Pool {
  if (!globalForDb.salesDbPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL no está definida.");

    const pool = new Pool({
      connectionString,
      // Pocas conexiones: cada instancia atiende pocas consultas a la vez y la
      // base es compartida con inventario.
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      // Corta consultas colgadas para no acumular polls pendientes.
      statement_timeout: 5_000,
      application_name: "landing-motivacion-ventas",
    });
    // Un error en una conexión inactiva no debe tumbar el proceso.
    pool.on("error", (error) => console.error("[db] Error en conexión inactiva", error));
    globalForDb.salesDbPool = pool;
  }
  return globalForDb.salesDbPool;
}

/**
 * Ejecuta `work` dentro de una transacción READ ONLY. Postgres rechaza
 * cualquier escritura dentro de ella, así que la landing no puede modificar la
 * base de inventario aunque DATABASE_URL use un usuario con permisos de
 * escritura. REPEATABLE READ hace que todas las consultas vean la misma foto.
 */
export async function withReadOnlyTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  let broken = false;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // Si ni el ROLLBACK funciona, la conexión está rota: se descarta del pool.
    await client.query("ROLLBACK").catch(() => {
      broken = true;
    });
    throw error;
  } finally {
    client.release(broken);
  }
}

#!/usr/bin/env node
/**
 * Herramientas para probar la landing contra una base LOCAL (nunca producción).
 *
 *   npm run local:setup                          # crea las tablas mínimas y el programa
 *   npm run local:compra                         # simula 1 compra nueva
 *   npm run local:compra -- --count 3            # 3 compras seguidas
 *   npm run local:compra -- --metodo ZELLE --monto 180
 *
 * Usa DATABASE_URL y CARTERA_PRODUCTO_ID de .env.local. Se niega a ejecutarse
 * si DATABASE_URL no apunta a localhost.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    count: { type: "string", default: "1" },
    metodo: { type: "string" },
    monto: { type: "string" },
  },
});

const url = process.env.DATABASE_URL;
const productId = process.env.CARTERA_PRODUCTO_ID;
if (!url || !productId) {
  console.error("Faltan DATABASE_URL o CARTERA_PRODUCTO_ID en .env.local");
  process.exit(1);
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
  console.error(`Por seguridad este script solo escribe en bases locales (DATABASE_URL apunta a ${host}).`);
  process.exit(1);
}

const METODOS = ["HOTMART", "HOTMART", "HOTMART", "STRIPE", "ZELLE"];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const command = positionals[0];
  if (command === "setup") {
    const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "sql", "local-cartera-schema.sql"), "utf8");
    await client.query(schema);
    await client.query(
      `INSERT INTO cartera_productos (id, nombre) VALUES ($1, 'APRENDE INGLÉS CON SPEAK EASY G2') ON CONFLICT (id) DO NOTHING`,
      [productId],
    );
    console.log(`Tablas listas y programa ${productId} creado.`);
  } else if (command === "compra") {
    const total = Math.max(1, Number.parseInt(values.count, 10) || 1);
    for (let i = 0; i < total; i++) {
      const metodo = (values.metodo ?? pick(METODOS)).toUpperCase();
      const monto = values.monto ? Number(values.monto) : Math.round((99 + Math.random() * 250) * 100) / 100;
      // Mismo orden que el webhook de inventario: método → compra → pago.
      const { rows: [metodoRow] } = await client.query(
        `INSERT INTO cartera_metodos_pago (producto_id, nombre) VALUES ($1, $2)
         ON CONFLICT (producto_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
        [productId, metodo],
      );
      const { rows: [compra] } = await client.query(
        `INSERT INTO cartera_compras (producto_id, nombre_completo, metodo_pago_id) VALUES ($1, 'Compra simulada', $2) RETURNING id`,
        [productId, metodoRow.id],
      );
      await client.query(`INSERT INTO cartera_compras_pagos (compra_id, ingresado_usd) VALUES ($1, $2)`, [compra.id, monto]);
      console.log(`[${i + 1}/${total}] compra ${compra.id} · ${metodo} · US$ ${monto}`);
    }
  } else {
    console.error("Uso: node scripts/local-cartera.mjs <setup|compra> [--count N] [--metodo HOTMART] [--monto 229.62]");
    process.exitCode = 1;
  }
} finally {
  await client.end();
}

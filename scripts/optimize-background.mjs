#!/usr/bin/env node
/**
 * Genera public/landing/fondo.webp a partir de public/landing/fondo.png.
 *
 *   npm run fondo:optimize
 *
 * Por qué no se deja al optimizador de Next.js: comprime a WebP calidad 75, y
 * las líneas topográficas del fondo (finas y de bajo contraste sobre un
 * degradado oscuro) se rompen en bloques. Servir el PNG original tampoco sirve:
 * pesa ~12 MB y ocupa ~150 MB de memoria gráfica al decodificarse.
 *
 * Solución: una sola versión de 3840 px (nítida hasta en 4K y retina) en WebP
 * calidad 90, que en las pruebas quedó visualmente igual al original (~130 KB).
 * Ejecuta este script cada vez que cambie fondo.png.
 */
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "landing");
const INPUT = join(DIR, "fondo.png");
const OUTPUT = join(DIR, "fondo.webp");
const MAX_WIDTH = 3840;
const QUALITY = 90;

const info = await sharp(INPUT)
  .resize({ width: MAX_WIDTH, withoutEnlargement: true })
  // El fondo es opaco: sin canal alfa el archivo es más liviano.
  .removeAlpha()
  .webp({ quality: QUALITY, smartSubsample: true })
  .toFile(OUTPUT);

const original = (await stat(INPUT)).size;
console.log(
  `Fondo optimizado: ${OUTPUT}\n` +
    `  ${info.width}×${info.height}, ${(info.size / 1024).toFixed(0)} KB ` +
    `(original ${(original / 1024 / 1024).toFixed(1)} MB)`,
);

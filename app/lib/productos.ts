import "server-only";

import config from "@/app/config/productos.json";

/**
 * Productos (programas de la cartera) que puede mostrar la pantalla.
 *
 * Se configuran en app/config/productos.json: para cambiar de producto basta
 * con poner su clave en `productoActivo`. Este módulo es solo de servidor para
 * que los ids de la cartera no viajen al navegador.
 */
export type Producto = {
  /** Clave del producto dentro de productos.json (p. ej. "gen2-2026"). */
  clave: string;
  /** Nombre del programa en la cartera; solo informativo. */
  nombre: string;
  /** Id del programa en la cartera (cartera_compras.producto_id). */
  id: string;
  /** Ruta de la imagen del personaje dentro de public/ (p. ej. "/productos/personaje.png"). */
  imagen: string;
  /** Texto a la izquierda de la línea, una entrada por renglón. */
  encabezado: string[];
  /** Texto del logo, a la derecha de la línea, una entrada por renglón. */
  textoLogo: string[];
};

export type ConfigProductos = {
  productoActivo: string;
  productos: Record<string, Producto>;
};

const ARCHIVO = "app/config/productos.json";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(message: string): never {
  throw new Error(`${ARCHIVO}: ${message}`);
}

/** Un texto en renglones: acepta una cadena (un renglón) o una lista de cadenas. */
function readLines(value: unknown, field: string): string[] {
  const lines = typeof value === "string" ? [value] : value;
  if (!Array.isArray(lines) || lines.length === 0 || !lines.every((line) => typeof line === "string" && line.trim())) {
    fail(`"${field}" debe ser un texto o una lista de renglones, sin renglones vacíos.`);
  }
  return lines.map((line: string) => line.trim());
}

function readProducto(clave: string, value: unknown): Producto {
  const at = `productos["${clave}"]`;
  if (!isObject(value)) fail(`${at} debe ser un objeto.`);

  const { nombre, id, imagen } = value;
  if (typeof id !== "string" || !UUID_PATTERN.test(id.trim())) {
    fail(`${at}.id debe ser el id (UUID) del programa en la cartera.`);
  }
  if (typeof imagen !== "string" || !imagen.trim()) {
    fail(`${at}.imagen debe ser la ruta de la imagen dentro de public/, p. ej. "/productos/personaje.png".`);
  }
  if (nombre !== undefined && typeof nombre !== "string") fail(`${at}.nombre debe ser un texto.`);

  const ruta = imagen.trim();
  return {
    clave,
    nombre: (typeof nombre === "string" && nombre.trim()) || clave,
    id: id.trim().toLowerCase(),
    // "productos/x.png" y "/productos/x.png" son la misma imagen de public/.
    imagen: ruta.startsWith("/") ? ruta : `/${ruta}`,
    encabezado: readLines(value.encabezado, `${at}.encabezado`),
    textoLogo: readLines(value.textoLogo, `${at}.textoLogo`),
  };
}

/** Valida el contenido de productos.json. Lanza un error que dice qué campo corregir. */
export function parseConfigProductos(raw: unknown): ConfigProductos {
  if (!isObject(raw) || !isObject(raw.productos)) fail(`falta el objeto "productos".`);

  const productos: Record<string, Producto> = {};
  for (const [clave, value] of Object.entries(raw.productos)) productos[clave] = readProducto(clave, value);

  const { productoActivo } = raw;
  if (typeof productoActivo !== "string" || !(productoActivo in productos)) {
    const claves = Object.keys(productos).join(", ") || "(ninguno)";
    fail(`"productoActivo" debe ser la clave de un producto de la lista. Disponibles: ${claves}.`);
  }
  return { productoActivo, productos };
}

let activo: Producto | undefined;

/** Producto que muestra la pantalla (`productoActivo` en productos.json). */
export function getProductoActivo(): Producto {
  if (!activo) {
    const { productoActivo, productos } = parseConfigProductos(config);
    activo = productos[productoActivo];
  }
  return activo;
}

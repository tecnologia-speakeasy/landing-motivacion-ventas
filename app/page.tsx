import path from "node:path";

import sharp from "sharp";

import SalesLanding, { type ImagenProducto } from "./components/SalesLanding";
import { getProductoActivo, type Producto } from "./lib/productos";

/**
 * Tamaño real de la imagen del personaje (next/image lo necesita para reservar
 * su espacio). La página se genera al compilar, así que una ruta mal escrita
 * en productos.json hace fallar `npm run build` en vez de dejar la imagen rota.
 */
async function medirImagen({ clave, imagen }: Producto): Promise<ImagenProducto> {
  const archivo = path.join(process.cwd(), "public", imagen);
  try {
    const { width, height } = await sharp(archivo).metadata();
    if (width && height) return { src: imagen, width, height };
  } catch {
    // Se informa abajo con un mensaje que dice qué corregir.
  }
  throw new Error(
    `app/config/productos.json: la imagen "${imagen}" del producto "${clave}" no existe o no es una imagen válida (se buscó en public${imagen}).`,
  );
}

export default async function Home() {
  const producto = getProductoActivo();
  return (
    <SalesLanding
      imagen={await medirImagen(producto)}
      encabezado={producto.encabezado}
      textoLogo={producto.textoLogo}
    />
  );
}

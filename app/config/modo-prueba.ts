/**
 * MODO PRUEBA: simula una venta cada `cadaSegundos` para ver la animación y el
 * sonido sin crear registros en la cartera. No toca la base de datos: las
 * ventas simuladas solo existen en la pantalla y desaparecen al recargar: se
 * suman al total real y, al recargar, el contador vuelve al número de la base.
 *
 * Mientras está activo, la pantalla muestra la etiqueta "MODO PRUEBA".
 * ⚠ Déjalo en `false` antes de desplegar a producción.
 */
export const MODO_PRUEBA = {
  activo: false,
  cadaSegundos: 2,
};

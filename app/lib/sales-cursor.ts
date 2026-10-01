/**
 * El cursor identifica la última compra vista: "<created_at con microsegundos>|<id>".
 *
 * Se usa el par (created_at, id) porque varias compras pueden compartir
 * timestamp, y el texto con microsegundos porque Date de JS solo guarda
 * milisegundos: con él perderíamos precisión y repetiríamos compras.
 */
const CURSOR_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export type SalesCursor = { createdAt: string; id: string };

export function parseCursor(value: string): SalesCursor | null {
  const match = CURSOR_PATTERN.exec(value);
  return match ? { createdAt: match[1]!, id: match[2]! } : null;
}

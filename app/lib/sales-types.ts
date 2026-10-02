/** Tipos compartidos entre API y cliente (sin dependencias de servidor). */

/** Una compra nueva del programa. Sin datos del comprador. */
export type SaleEvent = {
  id: string;
  createdAt: string;
};

/** Respuesta de `GET /api/sales/count`. */
export type SalesSnapshot = {
  /** Total de compras del programa. */
  count: number;
  /** Posición de la compra más reciente (o el cursor inicial si no hay); se envía como `after` en la siguiente consulta. */
  cursor: string;
  /** Compras posteriores al `after` recibido (las más recientes, en orden cronológico). */
  sales: SaleEvent[];
  serverTime: string;
};

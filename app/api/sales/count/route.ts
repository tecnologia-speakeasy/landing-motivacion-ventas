import type { NextRequest } from "next/server";

import { createRouteRateLimit, errorResponse, HttpError, jsonError } from "@/app/lib/http";
import { getProductoActivo } from "@/app/lib/productos";
import { getSalesSnapshot } from "@/app/lib/sales";
import { parseCursor } from "@/app/lib/sales-cursor";

// Holgado: cada pantalla consulta cada ~2 s (≈30/min).
const rateLimit = createRouteRateLimit("sales-count", { limit: 120, windowMs: 60_000 });

/** Id en la cartera del producto activo. Un productos.json inválido es un error de configuración. */
function productoActivoId(): string {
  try {
    return getProductoActivo().id;
  } catch (error) {
    throw new HttpError(500, "server_misconfigured", error instanceof Error ? error.message : String(error));
  }
}

/**
 * GET /api/sales/count[?after=<cursor>]
 *
 * Total de compras del producto activo de app/config/productos.json. Con
 * `after` (el cursor de la respuesta anterior) incluye las compras nuevas
 * para que la landing celebre cada una.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(request);
  if (limited) return limited;

  const afterParam = request.nextUrl.searchParams.get("after");
  const after = afterParam ? parseCursor(afterParam) : null;
  if (afterParam && !after) {
    return jsonError(400, "invalid_after", "`after` debe ser un cursor devuelto por esta API.");
  }

  try {
    const snapshot = await getSalesSnapshot(productoActivoId(), after);
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, { route: "GET /api/sales/count" });
  }
}

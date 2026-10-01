import type { NextRequest } from "next/server";

import { createRouteRateLimit, errorResponse, HttpError, jsonError, requireEnv } from "@/app/lib/http";
import { getSalesSnapshot } from "@/app/lib/sales";
import { parseCursor } from "@/app/lib/sales-cursor";

// Holgado: cada pantalla consulta cada ~2 s (≈30/min).
const rateLimit = createRouteRateLimit("sales-count", { limit: 120, windowMs: 60_000 });

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/sales/count[?after=<cursor>]
 *
 * Total de compras del programa configurado en CARTERA_PRODUCTO_ID. Con
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
    const productId = requireEnv("CARTERA_PRODUCTO_ID");
    if (!UUID_PATTERN.test(productId)) {
      throw new HttpError(500, "server_misconfigured", "CARTERA_PRODUCTO_ID no es un UUID válido.");
    }
    const snapshot = await getSalesSnapshot(productId, after);
    return Response.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, { route: "GET /api/sales/count" });
  }
}

import "server-only";

import { logger } from "./logger";
import { createRateLimiter, type RateLimiterOptions } from "./rate-limit";

/** Error con código HTTP asociado, para cortar el flujo de un handler con una respuesta limpia. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

/**
 * IP del cliente. En Vercel `x-forwarded-for` lo fija la plataforma; detrás de
 * otro proxy asegúrate de que sea de confianza antes de usarlo para limitar.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Crea un limitador por ruta. Devuelve `null` si la petición puede continuar
 * o una respuesta 429 lista para devolver.
 */
export function createRouteRateLimit(name: string, options: RateLimiterOptions) {
  const check = createRateLimiter(options);

  return function limit(request: Request): Response | null {
    const result = check(`${name}:${getClientIp(request)}`);
    if (result.ok) return null;

    const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    return jsonError(429, "rate_limited", "Demasiadas peticiones. Intenta de nuevo en unos segundos.", {
      "Retry-After": String(retryAfter),
      "RateLimit-Limit": String(result.limit),
      "RateLimit-Remaining": "0",
      "RateLimit-Reset": String(retryAfter),
    });
  };
}

/**
 * Convierte cualquier error en una respuesta JSON. Los 5xx se registran.
 * Los mensajes de HttpError están pensados para el usuario y se devuelven tal
 * cual, salvo los de configuración (nombran variables de entorno) y los
 * errores inesperados (p. ej. de la base de datos), que se reemplazan por un
 * mensaje genérico.
 */
export function errorResponse(error: unknown, context: Record<string, unknown>): Response {
  if (!(error instanceof HttpError)) {
    logger.error("route.error", { ...context, code: "internal_error", error });
    return jsonError(500, "internal_error", "Error interno del servidor.");
  }

  if (error.status >= 500) logger.error("route.error", { ...context, code: error.code, error });
  const message =
    error.code === "server_misconfigured" ? "El servidor no está configurado correctamente." : error.message;
  return jsonError(error.status, error.code, message);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new HttpError(500, "server_misconfigured", `Falta la variable de entorno ${name}.`);
  }
  return value;
}

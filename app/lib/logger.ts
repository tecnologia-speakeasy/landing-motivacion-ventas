/**
 * Logger estructurado mínimo: una línea JSON por evento.
 * Vercel (y la mayoría de plataformas) indexan estas líneas y permiten filtrar
 * por campos como `msg`, `provider` o `status`.
 *
 * Nunca registres datos personales (emails, nombres de compradores, tarjetas).
 */
type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

const isProduction = process.env.NODE_ENV === "production";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // El stack solo aporta en desarrollo; en producción ensucia los logs.
      ...(isProduction ? {} : { stack: error.stack }),
    };
  }
  return { message: String(error) };
}

function write(level: Level, msg: string, context: Context = {}) {
  if (level === "debug" && isProduction) return;

  const { error, ...rest } = context;
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...rest,
    ...(error !== undefined ? { error: serializeError(error) } : {}),
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, context?: Context) => write("debug", msg, context),
  info: (msg: string, context?: Context) => write("info", msg, context),
  warn: (msg: string, context?: Context) => write("warn", msg, context),
  error: (msg: string, context?: Context) => write("error", msg, context),
};

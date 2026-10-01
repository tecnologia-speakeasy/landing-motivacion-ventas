/**
 * Rate limiter en memoria (ventana fija por clave).
 *
 * Limitación importante: en serverless cada instancia tiene su propia memoria,
 * así que el límite es "por instancia", no global. Sirve como primera barrera
 * contra abusos simples. Si necesitas un límite global estricto, reemplaza
 * `createRateLimiter` por una implementación sobre Redis (p. ej. Upstash)
 * manteniendo la misma interfaz.
 */
export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Epoch en ms en que se reinicia la ventana. */
  resetAt: number;
};

type Bucket = { count: number; resetAt: number };

export type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  /** Máximo de claves en memoria antes de purgar las expiradas. */
  maxKeys?: number;
  /** Inyectable para tests. */
  now?: () => number;
};

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
  now = Date.now,
}: RateLimiterOptions) {
  const buckets = new Map<string, Bucket>();

  function purgeExpired(current: number) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= current) buckets.delete(key);
    }
  }

  return function check(key: string): RateLimitResult {
    const current = now();
    if (buckets.size >= maxKeys) purgeExpired(current);

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    return {
      ok: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  };
}

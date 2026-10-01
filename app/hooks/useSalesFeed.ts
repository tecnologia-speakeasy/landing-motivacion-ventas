"use client";

import { useEffect, useEffectEvent, useRef } from "react";

import type { SaleEvent, SalesSnapshot } from "@/app/lib/sales-types";

export type FeedUpdate = {
  total: number;
  /** Total conocido antes de esta consulta (null en la primera). */
  previous: number | null;
  /** Compras nuevas desde la consulta anterior, en orden cronológico. */
  sales: SaleEvent[];
};

const MAX_BACKOFF_MS = 30_000;

/**
 * Mantiene el contador sincronizado con la cartera mediante polling.
 *
 * Por qué polling y no WebSocket: las compras las crea inventario-speakeasy
 * por cuatro caminos (webhooks de Hotmart y Stripe, alta manual e
 * importación). Consultar la tabla los capta todos sin tocar inventario, y un
 * push exigiría un proceso persistente que Vercel no ofrece. Con un intervalo
 * de ~2 s la latencia es menor que la del propio webhook de Hotmart.
 *
 * - Envía el cursor de la última compra vista y recibe solo las nuevas.
 * - Reintentos con backoff exponencial si falla la red o la API.
 * - Se pausa con la pestaña oculta y consulta al volver.
 */
export function useSalesFeed({
  intervalMs,
  onUpdate,
}: {
  intervalMs: number;
  onUpdate: (update: FeedUpdate) => void;
}) {
  const lastTotalRef = useRef<number | null>(null);
  const cursorRef = useRef<string | null>(null);
  const emitUpdate = useEffectEvent(onUpdate);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let requestId = 0;
    let failures = 0;
    let stopped = false;

    const schedule = () => {
      if (stopped || document.hidden) return;
      const delay = failures === 0 ? intervalMs : Math.min(MAX_BACKOFF_MS, intervalMs * 2 ** failures);
      timer = setTimeout(poll, delay);
    };

    async function poll() {
      // Solo la consulta más reciente reprograma el siguiente ciclo; así la
      // consulta al volver a la pestaña no duplica el polling.
      const id = ++requestId;
      clearTimeout(timer);
      controller?.abort();
      const current = (controller = new AbortController());

      const previous = lastTotalRef.current;
      const cursor = cursorRef.current;
      const url = cursor ? `/api/sales/count?after=${encodeURIComponent(cursor)}` : "/api/sales/count";

      try {
        const response = await fetch(url, { cache: "no-store", signal: current.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const snapshot = (await response.json()) as SalesSnapshot;

        failures = 0;
        lastTotalRef.current = snapshot.count;
        cursorRef.current = snapshot.cursor;
        if (previous === null || snapshot.count !== previous || snapshot.sales.length > 0) {
          emitUpdate({ total: snapshot.count, previous, sales: snapshot.sales });
        }
      } catch (error) {
        if (current.signal.aborted) return;
        failures += 1;
        console.warn("[ventas] Error consultando el contador", error);
      } finally {
        if (id === requestId) schedule();
      }
    }

    const onVisibilityChange = () => {
      if (document.hidden) clearTimeout(timer);
      else void poll();
    };

    void poll();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);
}

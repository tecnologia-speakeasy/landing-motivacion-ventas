"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MODO_PRUEBA } from "@/app/config/modo-prueba";
import { useCashSound } from "@/app/hooks/useCashSound";
import { useSalesFeed, type FeedUpdate } from "@/app/hooks/useSalesFeed";

import BilletsScene, { type BilletsSceneHandle } from "./BilletsScene";
import Counter from "./Counter";

const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.NEXT_PUBLIC_SALES_POLL_MS) || 2000);
/** Pausa entre celebraciones cuando llegan varias ventas juntas. */
const CELEBRATION_GAP_MS = 650;
/**
 * Más compras que esto en una sola consulta = importación masiva desde Excel
 * (o la pantalla estuvo mucho tiempo sin conexión): se actualiza el número sin
 * celebrar. Ventas reales no llegan de a 6 en 2 segundos.
 */
const BULK_THRESHOLD = 5;

export default function SalesLanding() {
  const sceneRef = useRef<BilletsSceneHandle>(null);
  /** Valores del contador pendientes de celebrar, uno por venta. */
  const queueRef = useRef<number[]>([]);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [displayCount, setDisplayCount] = useState<number | null>(null);
  const [bumpKey, setBumpKey] = useState(0);
  const displayCountRef = useRef<number | null>(null);

  useEffect(() => {
    displayCountRef.current = displayCount;
  }, [displayCount]);

  const { play: playSound } = useCashSound();

  const celebrate = useCallback(
    (count: number) => {
      setDisplayCount(count);
      setBumpKey((key) => key + 1);
      sceneRef.current?.burst();
      playSound();
    },
    [playSound],
  );

  /** Procesa la cola: una venta cada CELEBRATION_GAP_MS para que cada una se note. */
  const drainQueue = useCallback(() => {
    if (drainTimerRef.current !== null) return;
    const next = () => {
      const count = queueRef.current.shift();
      if (count === undefined) {
        drainTimerRef.current = null;
        return;
      }
      celebrate(count);
      drainTimerRef.current = setTimeout(next, CELEBRATION_GAP_MS);
    };
    next();
  }, [celebrate]);

  useEffect(
    () => () => {
      if (drainTimerRef.current !== null) clearTimeout(drainTimerRef.current);
    },
    [],
  );

  const handleUpdate = useCallback(
    ({ total, previous, sales }: FeedUpdate) => {
      // Primera carga, compras borradas o importación masiva: se actualiza el
      // número sin celebrar.
      if (previous === null || sales.length === 0 || sales.length > BULK_THRESHOLD) {
        queueRef.current = [];
        setDisplayCount(total);
        return;
      }

      // Una celebración por compra nueva; la última deja el contador en el total exacto.
      sales.forEach((_, index) => queueRef.current.push(total - (sales.length - 1 - index)));
      drainQueue();
    },
    [drainQueue],
  );

  useSalesFeed({ intervalMs: POLL_INTERVAL_MS, onUpdate: handleUpdate });

  /** Encola una venta simulada: +1 sobre el número que se está mostrando. */
  const simulateSale = useCallback(() => {
    const base = queueRef.current.at(-1) ?? displayCountRef.current ?? 0;
    queueRef.current.push(base + 1);
    drainQueue();
  }, [drainQueue]);

  // Modo prueba (app/config/modo-prueba.ts): una venta simulada cada N segundos.
  useEffect(() => {
    if (!MODO_PRUEBA.activo) return;
    const timer = setInterval(simulateSale, Math.max(1, MODO_PRUEBA.cadaSegundos) * 1000);
    return () => clearInterval(timer);
  }, [simulateSale]);

  // Solo en desarrollo: la tecla "v" simula una venta al instante.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "v") simulateSale();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [simulateSale]);

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20 bg-[radial-gradient(ellipse_at_50%_-10%,#6a44a8_0%,#41276b_38%,#170d29_85%)]"
      />
      <BilletsScene ref={sceneRef} className="-z-10" />

      {MODO_PRUEBA.activo && (
        <p className="absolute right-4 top-4 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-black sm:right-8 sm:top-6">
          Modo prueba
        </p>
      )}

      <h1 className="sr-only">Ventas totales</h1>
      <Counter value={displayCount} bumpKey={bumpKey} />
    </main>
  );
}

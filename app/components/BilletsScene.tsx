"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

import type { BillsEngine } from "@/app/lib/bills/engine";

export type BilletsSceneHandle = {
  /** Lanza una ráfaga de billetes (por defecto según el tamaño de pantalla). */
  burst: (count?: number) => void;
};

type BilletsSceneProps = {
  ref?: Ref<BilletsSceneHandle>;
  className?: string;
};

/**
 * Canvas a pantalla completa con la lluvia de billetes.
 *
 * Three.js y cannon-es se cargan con import() dinámico: no forman parte del
 * bundle inicial, así el contador aparece de inmediato y la animación se
 * habilita unos instantes después. Las ráfagas pedidas antes de que el motor
 * esté listo se encolan.
 */
export default function BilletsScene({ ref, className = "" }: BilletsSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BillsEngine | null>(null);
  const pendingBurstsRef = useRef<Array<number | undefined>>([]);

  useImperativeHandle(
    ref,
    () => ({
      burst(count) {
        if (engineRef.current) engineRef.current.burst(count);
        else if (pendingBurstsRef.current.length < 5) pendingBurstsRef.current.push(count);
      },
    }),
    [],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let engine: BillsEngine | null = null;
    let cancelled = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const compact = container.clientWidth < 640;

    import("@/app/lib/bills/engine")
      .then(({ BillsEngine }) => {
        if (cancelled) return;
        try {
          engine = new BillsEngine(container, {
            // Menos billetes en móvil (pantalla pequeña, GPU modesta) y con movimiento reducido.
            billsPerBurst: reducedMotion ? 5 : compact ? 16 : 28,
            maxBills: compact ? 90 : 160,
          });
        } catch (error) {
          // Sin WebGL: la landing sigue funcionando sin animación.
          console.warn("[billetes] WebGL no disponible", error);
          pendingBurstsRef.current = [];
          return;
        }
        engineRef.current = engine;
        for (const count of pendingBurstsRef.current.splice(0)) engine.burst(count);
      })
      .catch((error: unknown) => console.error("[billetes] No se pudo cargar el motor", error));

    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  return <div ref={containerRef} aria-hidden="true" className={`pointer-events-none fixed inset-0 ${className}`} />;
}

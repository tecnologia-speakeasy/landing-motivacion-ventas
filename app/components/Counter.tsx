"use client";

import { useEffect, useRef, useState } from "react";

const numberFormat = new Intl.NumberFormat("es-CO");
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

type CounterProps = {
  /** Total a mostrar; null mientras carga. */
  value: number | null;
  /** Cambia en cada venta celebrada para relanzar la animación de "salto". */
  bumpKey: number;
};

/**
 * Número grande del total de ventas. Interpola (tween) desde el valor
 * mostrado hasta el nuevo con requestAnimationFrame; si llega otro cambio a
 * mitad de animación, continúa desde donde iba.
 */
export default function Counter({ value, bumpKey }: CounterProps) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);

  useEffect(() => {
    if (value === null) return;
    const from = displayRef.current;
    const to = value;
    if (from === to) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Saltos grandes (p. ej. la carga inicial 0 → 1.250) duran algo más.
    const duration = reducedMotion ? 0 : Math.min(1800, 500 + Math.abs(to - from) * 6);
    const start = performance.now();

    let frame = requestAnimationFrame(function step(now) {
      const progress = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const current = Math.round(from + (to - from) * easeOutCubic(progress));
      displayRef.current = current;
      setDisplay(current);
      if (progress < 1) frame = requestAnimationFrame(step);
    });

    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <div className="relative">
      <p
        key={bumpKey}
        aria-hidden="true"
        className={`counter-glow font-extrabold leading-none tabular-nums tracking-tight text-white text-[clamp(5rem,24vw,17rem)] ${
          bumpKey > 0 ? "counter-bump" : ""
        }`}
      >
        {value === null ? "—" : numberFormat.format(display)}
      </p>
      {/* El lector de pantalla recibe solo el valor final, no cada paso del tween. */}
      <p className="sr-only" aria-live="polite">
        {value === null ? "Cargando ventas" : `${numberFormat.format(value)} ventas`}
      </p>
    </div>
  );
}

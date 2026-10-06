"use client";

import { useEffect, useRef, useState } from "react";

const numberFormat = new Intl.NumberFormat("es-CO");
/** Como en el diseño: siempre al menos 4 dígitos ("0001"). */
const formatDigits = (n: number) => String(n).padStart(4, "0");
/** Retraso entre columnas: con acarreo (0009 → 0010) el dígito de la izquierda sube justo después. */
const ROLL_STAGGER_MS = 70;

/**
 * Un dígito estilo odómetro / reloj digital: al cambiar, el anterior sube y
 * sale de su ventana mientras el nuevo entra desde abajo.
 */
function RollingDigit({ digit, delayMs }: { digit: string; delayMs: number }) {
  const [shown, setShown] = useState(digit);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [roll, setRoll] = useState(0);

  // Patrón de React para reaccionar a una prop que cambia: el dígito que se
  // mostraba pasa a ser el saliente y se relanza la animación (nuevo `roll`).
  if (digit !== shown) {
    setLeaving(shown);
    setShown(digit);
    setRoll((value) => value + 1);
  }

  const delay = { animationDelay: `${delayMs}ms` };
  return (
    <span className="digit-slot">
      {leaving !== null && (
        <span key={`out-${roll}`} className="digit digit-out" style={delay} onAnimationEnd={() => setLeaving(null)}>
          {leaving}
        </span>
      )}
      <span key={`in-${roll}`} className={roll > 0 ? "digit digit-in" : "digit"} style={roll > 0 ? delay : undefined}>
        {shown}
      </span>
    </span>
  );
}

type CounterProps = {
  /** Total a mostrar; null mientras carga. */
  value: number | null;
  /** Cambia en cada venta celebrada para relanzar la animación de "salto". */
  bumpKey: number;
  /** Clases extra del número (tamaño de letra según el layout). */
  className?: string;
};

/**
 * Número grande del total de ventas, con dígitos que ruedan como un reloj
 * digital. Solo se mueven las columnas que cambian.
 */
export default function Counter({ value, bumpKey, className = "" }: CounterProps) {
  const numberRef = useRef<HTMLParagraphElement>(null);

  // "Salto" en cada venta. Con la Web Animations API y no remontando el
  // elemento: remontarlo borraría el dígito anterior y no habría nada que hacer rodar.
  useEffect(() => {
    const element = numberRef.current;
    if (bumpKey === 0 || !element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    element.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.06)", offset: 0.3 }, { transform: "scale(1)" }],
      { duration: 700, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [bumpKey]);

  // Mientras carga, "0000" atenuado: conserva el tamaño del recuadro.
  const digits = formatDigits(value ?? 0).split("");

  return (
    <div className="relative">
      <p
        ref={numberRef}
        aria-hidden="true"
        className={`counter-number transition-opacity duration-500 ${value === null ? "opacity-30" : ""} ${className}`}
      >
        {digits.map((digit, index) => {
          // La clave es la posición desde la derecha (unidades, decenas…): así
          // cada columna conserva su estado aunque el número gane dígitos.
          const fromRight = digits.length - 1 - index;
          return <RollingDigit key={fromRight} digit={digit} delayMs={fromRight * ROLL_STAGGER_MS} />;
        })}
      </p>
      {/* El lector de pantalla recibe solo el valor final. */}
      <p className="sr-only" aria-live="polite">
        {value === null ? "Cargando ventas" : `${numberFormat.format(value)} ventas`}
      </p>
    </div>
  );
}

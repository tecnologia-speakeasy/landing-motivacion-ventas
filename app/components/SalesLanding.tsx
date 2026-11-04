"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { MODO_PRUEBA } from "@/app/config/modo-prueba";
import { useCashSound } from "@/app/hooks/useCashSound";
import { useSalesFeed, type FeedUpdate } from "@/app/hooks/useSalesFeed";
// Versión optimizada de fondo.png (npm run fondo:optimize).
import fondo from "@/public/landing/fondo.webp";

import BilletsScene, { type BilletsSceneHandle } from "./BilletsScene";
import Counter from "./Counter";
import SoundButton from "./SoundButton";

/** Imagen del personaje del producto, con su tamaño real en píxeles. */
export type ImagenProducto = { src: string; width: number; height: number };

/** Lo que cambia de un producto a otro (app/config/productos.json). */
type SalesLandingProps = {
  imagen: ImagenProducto;
  /** Texto a la izquierda de la línea, un elemento por renglón ("Estudiantes", "Gen 2 - 2026"). */
  encabezado: string[];
  /** Texto del logo, a la derecha de la línea, un elemento por renglón. */
  textoLogo: string[];
  /** Color de lo que va entre asteriscos en los textos ("*INGLÉS* DESDE 0"). */
  colorDestacado: string;
};

/** Marcas registradas: ®, ™ y © se muestran pequeños y en alto, como en el logo. */
const SIMBOLOS_MARCA = /([®™©])/;

function ConSimbolos({ texto }: { texto: string }) {
  return texto.split(SIMBOLOS_MARCA).map((parte, i) =>
    i % 2 === 1 ? (
      <span key={i} className="simbolo-marca">
        {parte}
      </span>
    ) : (
      <Fragment key={i}>{parte}</Fragment>
    ),
  );
}

/** Un renglón por elemento. Lo que va entre asteriscos ("*INGLÉS*") sale en el color destacado. */
function Renglones({ lineas }: { lineas: string[] }) {
  return lineas.map((linea, index) => (
    <span key={index} className="block whitespace-nowrap">
      {linea.split("*").map((tramo, i) =>
        i % 2 === 1 ? (
          <span key={i} className="texto-destacado">
            <ConSimbolos texto={tramo} />
          </span>
        ) : (
          <ConSimbolos key={i} texto={tramo} />
        ),
      )}
    </span>
  ));
}

const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.NEXT_PUBLIC_SALES_POLL_MS) || 2000);
/** Pausa entre celebraciones cuando llegan varias ventas juntas. */
const CELEBRATION_GAP_MS = 650;
/**
 * Más compras que esto en una sola consulta = importación masiva desde Excel
 * (o la pantalla estuvo mucho tiempo sin conexión): se actualiza el número sin
 * celebrar. Ventas reales no llegan de a 6 en 2 segundos.
 */
const BULK_THRESHOLD = 5;

export default function SalesLanding({ imagen, encabezado, textoLogo, colorDestacado }: SalesLandingProps) {
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

  const { play: playSound, enable: enableSound, unlocked: soundUnlocked } = useCashSound();

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

  // Capas, de atrás hacia delante: fondo → billetes → personaje → contenido.
  // Horizontal (TV/computador): personaje a la izquierda, contador a la derecha.
  // Vertical (móvil): encabezado y contador arriba, personaje abajo.
  return (
    <main className="relative isolate h-dvh w-full overflow-hidden">
      <Image
        src={fondo}
        alt=""
        fill
        // Se sirve tal cual: el optimizador de Next lo recomprime a calidad 75 y
        // rompe en bloques las líneas topográficas (ver scripts/optimize-background.mjs).
        unoptimized
        loading="eager"
        fetchPriority="high"
        className="-z-30 object-cover object-top"
      />
      <BilletsScene ref={sceneRef} className="-z-20" />
      <Image
        src={imagen.src}
        width={imagen.width}
        height={imagen.height}
        alt=""
        sizes="(orientation: portrait) 120vw, 70vw"
        loading="eager"
        fetchPriority="high"
        className="pointer-events-none absolute bottom-0 -z-10 max-w-none select-none portrait:-left-[10vw] portrait:h-auto portrait:w-[120vw] landscape:left-0 landscape:h-[min(100dvh,56vw)] landscape:w-auto"
      />

      {MODO_PRUEBA.activo && (
        <p className="absolute right-4 top-4 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-black sm:right-8 sm:top-6">
          Modo prueba
        </p>
      )}

      <section className="flex flex-col items-center portrait:mx-auto portrait:w-[84vw] portrait:gap-[8vw] portrait:pt-[10dvh] landscape:absolute landscape:right-[8.5vw] landscape:top-1/2 landscape:w-[33.6vw] landscape:-translate-y-1/2 landscape:gap-[5.7vw]">
        <h1
          className="flex items-center portrait:gap-[2.6vw] landscape:gap-[0.95vw]"
          style={{ "--color-destacado": colorDestacado } as CSSProperties}
        >
          <span className="text-right font-extrabold uppercase leading-[1.08] tracking-[-0.01em] portrait:text-[5.6vw] landscape:text-[2.3vw]">
            <Renglones lineas={encabezado} />
          </span>
          <span aria-hidden="true" className="w-[2px] self-stretch bg-white/90" />
          <span className="text-left font-black uppercase leading-[0.96] tracking-[-0.01em] portrait:text-[5.05vw] landscape:text-[1.88vw]">
            <Renglones lineas={textoLogo} />
          </span>
        </h1>

        <div className="relative flex w-full items-center justify-center border-white portrait:rounded-[4vw] portrait:border-[3px] portrait:py-[5vw] landscape:rounded-[1.4vw] landscape:border-[max(3px,0.25vw)] landscape:py-[2.4vw]">
          <Counter value={displayCount} bumpKey={bumpKey} className="portrait:text-[30vw] landscape:text-[12.3vw]" />

          {!soundUnlocked && (
            <SoundButton
              onClick={() => void enableSound()}
              className="absolute left-1/2 top-full mt-[max(1.5rem,2.5vw)] -translate-x-1/2"
            />
          )}
        </div>
      </section>
    </main>
  );
}

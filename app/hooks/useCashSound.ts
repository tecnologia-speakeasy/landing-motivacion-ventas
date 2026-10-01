"use client";

import type { Howl, HowlerGlobal } from "howler";
import { useCallback, useEffect, useRef } from "react";

/** Howler usa el primer formato soportado. Añade aquí un .mp3/.webm si reemplazas el sonido. */
export const CASH_SOUND_SRC = ["/sounds/cash.wav"];

const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchend"] as const;

function isAudioRunning(howler: HowlerGlobal | null): boolean {
  // Sin Web Audio (fallback HTML5) no hay contexto que desbloquear.
  return !!howler && (!howler.usingWebAudio || howler.ctx?.state === "running");
}

/**
 * Sonido de "venta" con Howler.js, siempre activo y al volumen máximo.
 *
 * Howler se importa de forma diferida (cuando el navegador está ocioso) para
 * no pesar en la carga inicial. Usa Web Audio con el buffer ya decodificado,
 * así que `play()` suena sin retardo perceptible.
 *
 * Los navegadores bloquean el audio hasta la primera interacción con la
 * página: basta un clic (o una tecla) en cualquier parte una vez al abrirla.
 */
export function useCashSound() {
  const howlRef = useRef<Howl | null>(null);
  const howlerRef = useRef<HowlerGlobal | null>(null);
  const loadRef = useRef<Promise<void> | null>(null);

  const load = useCallback((): Promise<void> => {
    loadRef.current ??= import("howler")
      .then(({ Howl, Howler }) => {
        howlerRef.current = Howler;
        Howler.volume(1);
        howlRef.current = new Howl({
          src: CASH_SOUND_SRC,
          preload: true,
          pool: 8, // varias ventas seguidas pueden solaparse
          onloaderror: (_id, error) => console.warn("[sonido] No se pudo cargar el sonido", error),
        });
      })
      .catch((error: unknown) => console.warn("[sonido] No se pudo cargar Howler", error));
    return loadRef.current;
  }, []);

  useEffect(() => {
    // Carga diferida: cuando el navegador quede libre tras el primer render.
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => void load(), { timeout: 3000 })
        : window.setTimeout(() => void load(), 1500);

    // Desbloqueo en la primera interacción. Howler también lo intenta por su
    // cuenta, pero solo si ya estaba cargado cuando ocurrió el clic.
    const unlock = () => {
      for (const event of UNLOCK_EVENTS) window.removeEventListener(event, unlock);
      void load().then(() => {
        const howler = howlerRef.current;
        if (howler?.usingWebAudio && howler.ctx?.state !== "running") {
          howler.ctx.resume().catch(() => undefined);
        }
      });
    };
    for (const event of UNLOCK_EVENTS) window.addEventListener(event, unlock);

    return () => {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      for (const event of UNLOCK_EVENTS) window.removeEventListener(event, unlock);
    };
  }, [load]);

  /** Reproduce el sonido de venta. Si el audio sigue bloqueado no hace nada (no acumula sonidos viejos). */
  const play = useCallback(() => {
    const howl = howlRef.current;
    if (!howl || !isAudioRunning(howlerRef.current)) return;
    const id = howl.play();
    // Ligera variación de tono para que ventas seguidas no suenen idénticas.
    howl.rate(0.94 + Math.random() * 0.12, id);
  }, []);

  return { play };
}

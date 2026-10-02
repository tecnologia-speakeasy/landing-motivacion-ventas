"use client";

import type { Howl, HowlerGlobal } from "howler";
import { useCallback, useEffect, useRef, useState } from "react";

/** Howler usa el primer formato soportado. Añade aquí un .mp3/.webm si reemplazas el sonido. */
export const CASH_SOUND_SRC = ["/sounds/ring.mp3"];

const UNLOCK_EVENTS = ["pointerdown", "keydown", "touchend"] as const;

function isAudioRunning(howler: HowlerGlobal | null): boolean {
  // Sin Web Audio (fallback HTML5) no hay contexto que desbloquear.
  return !!howler && (!howler.usingWebAudio || howler.ctx?.state === "running");
}

/**
 * Sonido de "venta" con Howler.js, al volumen máximo.
 *
 * Howler se importa de forma diferida (cuando el navegador está ocioso) para
 * no pesar en la carga inicial. Usa Web Audio con el buffer ya decodificado,
 * así que `play()` suena sin retardo perceptible.
 *
 * Los navegadores bloquean el audio hasta la primera interacción con la
 * página. `unlocked` indica si ya se puede sonar: la landing muestra el botón
 * "Activar sonido" mientras sea false. Cualquier clic o tecla también lo
 * desbloquea.
 */
export function useCashSound() {
  const [unlocked, setUnlocked] = useState(false);
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
          // Howler desbloquea por su cuenta en el primer clic si ya estaba cargado.
          onunlock: () => setUnlocked(true),
        });
        // Navegadores que permiten autoplay: ya está listo, sin botón.
        if (isAudioRunning(Howler)) setUnlocked(true);
      })
      .catch((error: unknown) => console.warn("[sonido] No se pudo cargar Howler", error));
    return loadRef.current;
  }, []);

  /** Carga Howler (si hace falta) y reanuda el audio. Debe llamarse desde un gesto del usuario. */
  const unlock = useCallback(async (): Promise<boolean> => {
    await load();
    const howler = howlerRef.current;
    if (howler?.usingWebAudio && howler.ctx?.state !== "running") {
      await howler.ctx.resume().catch(() => undefined);
    }
    const running = isAudioRunning(howler);
    if (running) setUnlocked(true);
    return running;
  }, [load]);

  useEffect(() => {
    // Carga diferida: cuando el navegador quede libre tras el primer render.
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => void load(), { timeout: 3000 })
        : window.setTimeout(() => void load(), 1500);

    // Cualquier interacción con la página también desbloquea el audio.
    const removeListeners = () => {
      for (const event of UNLOCK_EVENTS) window.removeEventListener(event, onInteraction);
    };
    const onInteraction = () => {
      void unlock().then((running) => {
        if (running) removeListeners();
      });
    };
    for (const event of UNLOCK_EVENTS) window.addEventListener(event, onInteraction);

    return () => {
      if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
      removeListeners();
    };
  }, [load, unlock]);

  /** Botón "Activar sonido": desbloquea y suena una vez como confirmación. */
  const enable = useCallback(async () => {
    if (await unlock()) howlRef.current?.play();
  }, [unlock]);

  /** Reproduce el sonido de venta. Si el audio sigue bloqueado no hace nada (no acumula sonidos viejos). */
  const play = useCallback(() => {
    const howl = howlRef.current;
    if (!howl || !isAudioRunning(howlerRef.current)) return;
    const id = howl.play();
    // Ligera variación de tono para que ventas seguidas no suenen idénticas.
    howl.rate(0.94 + Math.random() * 0.12, id);
  }, []);

  return { play, enable, unlocked };
}

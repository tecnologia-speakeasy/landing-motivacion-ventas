"use client";

import type { Howl, HowlerGlobal } from "howler";
import { useCallback, useEffect, useRef, useState } from "react";

/** Howler usa el primer formato soportado. Añade aquí un .mp3/.webm si reemplazas el sonido. */
export const CASH_SOUND_SRC = ["/sounds/ring.mp3"];

/** Veces que suena el audio por cada venta (una tras otra). */
const CASH_SOUND_REPEATS = 1;

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
  // Copia en ref de `unlocked` para leerla dentro de play() sin recrearlo.
  const unlockedRef = useRef(false);
  const howlRef = useRef<Howl | null>(null);
  const howlerRef = useRef<HowlerGlobal | null>(null);
  const loadRef = useRef<Promise<void> | null>(null);

  const markUnlocked = useCallback(() => {
    unlockedRef.current = true;
    setUnlocked(true);
  }, []);

  const load = useCallback((): Promise<void> => {
    loadRef.current ??= import("howler")
      .then(({ Howl, Howler }) => {
        howlerRef.current = Howler;
        // Por defecto Howler suspende el audio 30 s después del último sonido
        // para ahorrar energía. En una pantalla donde las ventas llegan cada
        // varios minutos eso dejaba mudas las siguientes: se mantiene activo.
        Howler.autoSuspend = false;
        Howler.volume(1);
        howlRef.current = new Howl({
          src: CASH_SOUND_SRC,
          preload: true,
          pool: 8, // varias ventas seguidas pueden solaparse
          onloaderror: (_id, error) => console.warn("[sonido] No se pudo cargar el sonido", error),
          // Howler desbloquea por su cuenta en el primer clic si ya estaba cargado.
          onunlock: markUnlocked,
        });
        // Navegadores que permiten autoplay: ya está listo, sin botón.
        if (isAudioRunning(Howler)) markUnlocked();
      })
      .catch((error: unknown) => console.warn("[sonido] No se pudo cargar Howler", error));
    return loadRef.current;
  }, [markUnlocked]);

  /** Carga Howler (si hace falta) y reanuda el audio. Debe llamarse desde un gesto del usuario. */
  const unlock = useCallback(async (): Promise<boolean> => {
    await load();
    const howler = howlerRef.current;
    if (howler?.usingWebAudio && howler.ctx?.state !== "running") {
      await howler.ctx.resume().catch(() => undefined);
    }
    const running = isAudioRunning(howler);
    if (running) markUnlocked();
    return running;
  }, [load, markUnlocked]);

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

  /**
   * Reproduce el sonido de venta CASH_SOUND_REPEATS veces seguidas.
   * Antes del primer clic no hace nada (no acumula sonidos viejos para cuando
   * el navegador lo permita). Después suena siempre, también con la pestaña
   * en segundo plano.
   */
  const play = useCallback(() => {
    const howl = howlRef.current;
    const howler = howlerRef.current;
    if (!howl || !howler || !unlockedRef.current) return;
    // Si el navegador suspendió el audio (p. ej. al cambiar el dispositivo de
    // salida), se reanuda: ya hubo interacción, así que lo permite sin otro clic.
    if (howler.usingWebAudio && howler.ctx?.state !== "running") {
      howler.ctx.resume().catch(() => undefined);
    }
    // Ligera variación de tono para que ventas seguidas no suenen idénticas.
    const rate = 0.94 + Math.random() * 0.12;
    const playTimes = (remaining: number) => {
      const id = howl.play();
      howl.rate(rate, id);
      // Encadena la siguiente repetición cuando termina esta.
      if (remaining > 1) howl.once("end", () => playTimes(remaining - 1), id);
    };
    playTimes(CASH_SOUND_REPEATS);
  }, []);

  return { play, enable, unlocked };
}

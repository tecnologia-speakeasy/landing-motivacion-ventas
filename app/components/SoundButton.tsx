"use client";

/**
 * Botón "Activar sonido". Los navegadores no dejan sonar audio hasta que el
 * usuario interactúa con la página; la landing lo oculta en cuanto el audio
 * queda desbloqueado (por este botón o por cualquier otro clic).
 */
export default function SoundButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-400/35 bg-emerald-400/10 px-5 py-2.5 text-sm font-semibold text-emerald-50 backdrop-blur transition hover:border-emerald-400/60 hover:bg-emerald-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 sm:bottom-8"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" strokeLinejoin="round" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
      </svg>
      Activar sonido
    </button>
  );
}

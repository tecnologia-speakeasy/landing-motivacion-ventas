"use client";

/**
 * Botón "Activar sonido". Los navegadores no dejan sonar audio hasta que el
 * usuario interactúa con la página; la landing lo oculta en cuanto el audio
 * queda desbloqueado (por este botón o por cualquier otro clic).
 */
export default function SoundButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 whitespace-nowrap rounded-full border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" strokeLinejoin="round" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
      </svg>
      Activar sonido
    </button>
  );
}

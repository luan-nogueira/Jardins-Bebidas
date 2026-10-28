"use client";

import type { CSSProperties } from "react";
import { Caneco } from "@/components/Logo";

// Gotas de espuma que espirram no "tim-tim": [deslocamento x, y, raio].
const RESPINGOS: [number, number, number][] = [
  [-34, -30, 3.5], [-20, -44, 2.5], [-6, -52, 3], [8, -50, 2.5],
  [22, -42, 3.5], [36, -26, 2.5], [-42, -12, 2], [44, -10, 2],
];

/** Os dois canecos brindando, pequeno — vai no aviso de venda finalizada. */
export function MiniBrinde({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="-70 -45 140 75" className={className} aria-hidden>
      <g className="brinde-esq">
        <Caneco x={-30} angulo={-14} />
      </g>
      <g className="brinde-dir">
        <Caneco x={30} angulo={14} espelhar />
      </g>
    </svg>
  );
}

/**
 * Tela cheia mostrada quando o login dá certo: os dois canecos da logo
 * entram de lados opostos, brindam no meio e a espuma espirra.
 */
export function Brinde() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-aparecer fixed inset-0 z-50 flex flex-col items-center justify-center bg-barra px-6 text-barra-texto"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-respirar absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-acento/25 blur-3xl" />
      </div>

      <svg viewBox="-110 -80 220 125" className="relative h-44 w-auto sm:h-56" aria-hidden>
        {/* Clarão no ponto do brinde. */}
        <circle
          cx="0"
          cy="-34"
          r="26"
          fill="none"
          stroke="#FFF8EC"
          strokeWidth="3"
          className="brinde-clarao"
        />
        <g className="brinde-esq">
          <Caneco x={-30} angulo={-14} />
        </g>
        <g className="brinde-dir">
          <Caneco x={30} angulo={14} espelhar />
        </g>
        {RESPINGOS.map(([dx, dy, r], i) => (
          <circle
            key={i}
            cx="0"
            cy="-36"
            r={r}
            fill="#FFF8EC"
            stroke="#4A230F"
            strokeWidth="1.2"
            className="brinde-respingo"
            style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as CSSProperties}
          />
        ))}
      </svg>

      <p
        className="animate-entrar relative mt-4 text-3xl font-black tracking-tight text-espuma sm:text-4xl"
        style={{ animationDelay: "650ms" }}
      >
        Tim-tim!
      </p>
      <p
        className="animate-entrar relative mt-2 flex items-center gap-2 text-sm text-barra-texto/70"
        style={{ animationDelay: "800ms" }}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-acento-claro" />
        Login aprovado, entrando no sistema…
      </p>
    </div>
  );
}

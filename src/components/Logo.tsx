"use client";

import { useEffect, useState } from "react";

const MARROM = "#4A230F";
const LARANJA = "#F26A1B";
const CHOPE = "#F6A623";
const ESPUMA = "#FFF8EC";

/**
 * Logo da Jardins Bebidas. Usa /logo.png quando o arquivo existir em
 * public/; enquanto não existir, desenha a versão em SVG (dois canecos
 * brindando + "JARDINS" + "BEBIDAS").
 */
export function Logo({ className = "" }: { className?: string }) {
  // Começa pelo desenho e só troca se o arquivo carregar: com o <img> direto,
  // o erro do arquivo inexistente chegava antes da página ficar pronta e a
  // troca não acontecia (aparecia a imagem quebrada).
  const [temArquivo, setTemArquivo] = useState(false);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setTemArquivo(true);
    img.src = "/logo.png";
  }, []);
  if (!temArquivo) return <LogoSVG className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="Jardins Bebidas" className={`object-contain ${className}`} />
  );
}

function LogoSVG({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 220 150" className={className} role="img" aria-label="Jardins Bebidas">
      <g transform="translate(110 46)">
        <Caneco x={-30} angulo={-14} />
        <Caneco x={30} angulo={14} espelhar />
      </g>
      <text
        x="110"
        y="118"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="900"
        fontSize="40"
        fill={LARANJA}
        stroke={MARROM}
        strokeWidth="6"
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        JARDINS
      </text>
      <text
        x="110"
        y="142"
        textAnchor="middle"
        fontFamily="Inter, Segoe UI, Arial, sans-serif"
        fontWeight="800"
        fontSize="14"
        letterSpacing="5"
        fill="#FDEBD3"
      >
        BEBIDAS
      </text>
    </svg>
  );
}

export function Caneco({ x, angulo, espelhar = false }: { x: number; angulo: number; espelhar?: boolean }) {
  return (
    <g transform={`translate(${x} 0) rotate(${angulo}) ${espelhar ? "scale(-1 1)" : ""}`}>
      {/* alça */}
      <path
        d="M 16,-12 q 14,0 14,14 q 0,14 -14,14"
        fill="none"
        stroke={MARROM}
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* corpo */}
      <rect x="-18" y="-20" width="34" height="44" rx="5" fill={CHOPE} stroke={MARROM} strokeWidth="4" />
      <path d="M -9,-12 L -9,16" stroke="#FFD27A" strokeWidth="3" strokeLinecap="round" />
      <path d="M 2,-12 L 2,16" stroke="#E08A12" strokeWidth="3" strokeLinecap="round" />
      {/* espuma */}
      <path
        d="M -21,-18 q -3,-12 9,-13 q 4,-9 14,-5 q 9,-6 15,3 q 9,1 6,15 Z"
        fill={ESPUMA}
        stroke={MARROM}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Versão compacta pra barra de navegação. */
export function LogoMarca({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 leading-none ${className}`}>
      <span className="font-serif font-black tracking-tight text-ouro-400">Jardins</span>
      <span className="text-[0.55em] font-extrabold tracking-[0.25em] text-barra-texto/80 uppercase">
        Bebidas
      </span>
    </span>
  );
}

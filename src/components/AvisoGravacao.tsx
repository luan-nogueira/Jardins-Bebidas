"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, WifiOff } from "lucide-react";
import { EVENTO_AVISO_GRAVACAO } from "@/lib/store";

const TEXTO = {
  erro: "Não salvou. Confere a internet e tenta de novo.",
  lento: "Internet lenta, ainda salvando. Não feche o app.",
} as const;

/** Mostra embaixo da tela quando uma gravação falha ou demora (ver comAviso no store). */
export function AvisoGravacao() {
  const [aviso, setAviso] = useState<keyof typeof TEXTO | null>(null);

  useEffect(() => {
    let sumir: ReturnType<typeof setTimeout> | undefined;
    function aoAvisar(e: Event) {
      const tipo = (e as CustomEvent<keyof typeof TEXTO>).detail;
      // Erro tem prioridade: não deixa um "lento" de outra gravação esconder.
      setAviso((atual) => (atual === "erro" && tipo === "lento" ? atual : tipo));
      clearTimeout(sumir);
      sumir = setTimeout(() => setAviso(null), 6000);
    }
    window.addEventListener(EVENTO_AVISO_GRAVACAO, aoAvisar);
    return () => {
      window.removeEventListener(EVENTO_AVISO_GRAVACAO, aoAvisar);
      clearTimeout(sumir);
    };
  }, []);

  if (!aviso) return null;

  const Icone = aviso === "erro" ? AlertTriangle : WifiOff;
  return (
    <div
      role="alert"
      className="nao-imprimir pointer-events-none fixed inset-x-0 bottom-0 z-[150] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+5rem)] md:pb-6"
    >
      <div
        className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold shadow-2xl ${
          aviso === "erro" ? "bg-red-600 text-white" : "bg-barra text-barra-texto"
        }`}
        onClick={() => setAviso(null)}
      >
        <Icone className="h-5 w-5 shrink-0" />
        {TEXTO[aviso]}
      </div>
    </div>
  );
}

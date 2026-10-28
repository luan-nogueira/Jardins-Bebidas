"use client";

import { useEffect } from "react";

const PADRAO_ERRO_CHUNK =
  /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i;

/**
 * Depois de um deploy, quem já tinha o site aberto (celular do Luifer, por
 * exemplo) pode clicar num link/botão que precisa buscar um arquivo da
 * versão antiga — que não existe mais no servidor. Sem isso, a navegação
 * falha em silêncio ("clico e não acontece nada"). Aqui a gente detecta
 * esse erro específico e recarrega a página sozinho.
 */
export function RecuperarErroDeChunk() {
  useEffect(() => {
    function tentarRecarregar(mensagem: string) {
      if (PADRAO_ERRO_CHUNK.test(mensagem)) {
        window.location.reload();
      }
    }

    function aoErro(e: ErrorEvent) {
      tentarRecarregar(e.message || "");
    }
    function aoRejeitar(e: PromiseRejectionEvent) {
      const motivo = e.reason;
      const mensagem =
        typeof motivo === "string" ? motivo : motivo?.message || "";
      tentarRecarregar(mensagem);
    }

    window.addEventListener("error", aoErro);
    window.addEventListener("unhandledrejection", aoRejeitar);
    return () => {
      window.removeEventListener("error", aoErro);
      window.removeEventListener("unhandledrejection", aoRejeitar);
    };
  }, []);

  return null;
}

"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Logo } from "./Logo";

const INTERVALO_MS = 5 * 60 * 1000;
/** Sem digitar nada há esse tempo, considera que não tem nada pela metade. */
const SOSSEGO_MS = 60 * 1000;
/**
 * Quanto a tela "Atualizando" fica antes de recarregar — dá pra ler e ainda
 * sobra folga pro salvamento automático do pedido (700ms) terminar.
 */
const ESPERA_RECARGA_MS = 2000;
/** Versão pra qual já recarregamos sozinhos nesta sessão (evita recarregar em loop). */
const CHAVE_RECARGA = "versao-recarregada";

/**
 * Dá pra recarregar sem perder nada? Tudo que se digita no admin está numa
 * folha (Modal) ou é salvo sozinho (pedido), então basta não ter folha
 * aberta, nenhum campo em foco e ninguém digitando há pouco.
 */
function podeRecarregarSozinho(ultimaDigitacao: number): boolean {
  if (document.querySelector('[role="dialog"]')) return false;
  const foco = document.activeElement;
  if (foco instanceof HTMLElement) {
    if (foco.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName)) return false;
  }
  return Date.now() - ultimaDigitacao > SOSSEGO_MS;
}

function jaRecarregouPara(versao: string): boolean {
  try {
    return sessionStorage.getItem(CHAVE_RECARGA) === versao;
  } catch {
    return false;
  }
}

/**
 * App instalado na tela inicial (iPhone principalmente) fica aberto em
 * segundo plano por dias e nunca recarrega — o Luifer continuava vendo a
 * versão antiga depois de um deploy. Ao voltar pro app (e a cada 5 min com
 * ele aberto), compara a versão carregada (data-dpl-id, que o Next põe no
 * <html> a partir do deploymentId) com a que está no ar.
 *
 * Voltando pro app sem nada pela metade, atualiza sozinho. Com o app em uso
 * (folha aberta, digitando, ou no meio da navegação) só mostra o aviso com
 * o botão, pra não perder o que está sendo feito. Só vale no admin: na
 * página pública o cliente perderia o pedido que está montando.
 */
export function AvisoNovaVersao() {
  const [estado, setEstado] = useState<"em-dia" | "aviso" | "atualizando">("em-dia");

  useEffect(() => {
    const carregada = document.documentElement.dataset.dplId;
    // Sem deploymentId (rodando local) não há o que comparar.
    if (!carregada) return;

    let ultimaDigitacao = 0;
    let recarga: ReturnType<typeof setTimeout> | undefined;
    const aoDigitar = () => {
      ultimaDigitacao = Date.now();
    };

    async function verificar(voltando: boolean) {
      if (document.visibilityState !== "visible") return;
      if (!window.location.pathname.startsWith("/admin")) return;
      if (recarga) return;
      try {
        const resp = await fetch("/api/versao", { cache: "no-store" });
        if (!resp.ok) return;
        const { versao } = (await resp.json()) as { versao: string };
        if (!versao || versao === carregada) return;

        if (voltando && !jaRecarregouPara(versao) && podeRecarregarSozinho(ultimaDigitacao)) {
          try {
            sessionStorage.setItem(CHAVE_RECARGA, versao);
          } catch {
            // Sem sessionStorage não dá pra garantir que não vira loop.
            setEstado("aviso");
            return;
          }
          setEstado("atualizando");
          recarga = setTimeout(() => window.location.reload(), ESPERA_RECARGA_MS);
        } else {
          setEstado("aviso");
        }
      } catch {
        // Sem internet: tenta de novo na próxima.
      }
    }

    const aoVoltar = () => verificar(true);
    verificar(true);
    const intervalo = setInterval(() => verificar(false), INTERVALO_MS);
    document.addEventListener("visibilitychange", aoVoltar);
    document.addEventListener("input", aoDigitar, true);
    return () => {
      clearInterval(intervalo);
      clearTimeout(recarga);
      document.removeEventListener("visibilitychange", aoVoltar);
      document.removeEventListener("input", aoDigitar, true);
    };
  }, []);

  if (estado === "em-dia") return null;

  if (estado === "atualizando") {
    return (
      <div className="nao-imprimir fixed inset-0 z-[200] grid place-items-center bg-barra px-6 text-barra-texto">
        <div className="flex flex-col items-center gap-5 text-center">
          <Logo className="h-24 w-auto" />
          <div className="flex items-center gap-2 text-sm font-semibold">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Atualizando o sistema
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nao-imprimir pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-borda bg-superficie p-3 shadow-2xl">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-acento/15 text-acento">
          <RefreshCw className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Versão nova do sistema</p>
          <p className="text-xs text-texto-suave">Termine o que está fazendo e atualize.</p>
        </div>
        <button
          className="btn-primario shrink-0 px-3 py-2"
          onClick={() => window.location.reload()}
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}

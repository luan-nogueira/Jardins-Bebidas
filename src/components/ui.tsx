"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Cabecalho({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex animate-entrar flex-wrap items-end justify-between gap-3 px-4 pt-6 pb-5 md:px-6 md:pt-9">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight md:text-[32px]">
          {titulo}
        </h1>
        {subtitulo && (
          <p className="mt-1 text-sm text-texto-suave">{subtitulo}</p>
        )}
      </div>
      {acao}
    </div>
  );
}

export function Vazio({
  Icone,
  titulo,
  descricao,
  acao,
}: {
  Icone: React.ComponentType<{ className?: string }>;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="card mx-4 flex animate-entrar flex-col items-center gap-4 px-6 py-14 text-center md:mx-6">
      <div className="relative grid h-16 w-16 place-items-center rounded-2xl bg-linear-to-br from-acento/15 to-acento/5 text-acento ring-1 ring-acento/20">
        <div className="absolute inset-0 -z-10 rounded-2xl bg-acento/20 blur-xl" aria-hidden />
        <Icone className="h-7 w-7" />
      </div>
      <div>
        <p className="text-base font-bold">{titulo}</p>
        {descricao && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-texto-suave">
            {descricao}
          </p>
        )}
      </div>
      {acao}
    </div>
  );
}

/** Folhas (Modal) abertas agora — ver a trava do fundo no Modal. */
let modaisAbertos = 0;

/**
 * No celular sobe de baixo como uma folha; no desktop centraliza.
 * É o mesmo componente pros dois — só muda o posicionamento.
 * Renderiza em um React Portal para fugir de contextos de empilhamento (z-index)
 * de barras de navegação com position: sticky.
 */
export function Modal({
  aberto,
  aoFechar,
  titulo,
  children,
  rodape,
  largura = "max-w-lg",
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, aoFechar]);

  // Trava o fundo pra não rolar atrás da folha. Conta as folhas abertas em
  // vez de guardar o overflow anterior: com uma folha dentro da outra
  // (histórico + editar compra), salvar refazia o efeito das duas juntas,
  // cada uma guardava o "hidden" da outra e o fundo ficava travado depois
  // de fechar tudo — só voltava reabrindo o app.
  useEffect(() => {
    if (!aberto) return;
    modaisAbertos++;
    document.body.style.overflow = "hidden";
    return () => {
      modaisAbertos--;
      if (modaisAbertos === 0) document.body.style.overflow = "";
    };
  }, [aberto]);

  if (!aberto || !montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:p-6">
      <div
        className="absolute inset-0 animate-aparecer bg-veu backdrop-blur-sm"
        onClick={aoFechar}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative flex max-h-[92dvh] w-full ${largura} animate-folha flex-col
                    rounded-t-3xl border border-borda bg-superficie shadow-alta
                    md:animate-surgir md:rounded-2xl`}
      >
        {/* Puxador da folha — só no celular */}
        <div className="flex justify-center pt-2.5 md:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-borda-forte" />
        </div>
        <div className="flex items-center gap-3 border-b border-borda px-5 py-3.5 md:py-4">
          <h2 className="text-lg font-bold tracking-tight">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            className="ml-auto grid h-9 w-9 place-items-center rounded-full text-texto-suave transition hover:rotate-90 hover:bg-superficie-2 hover:text-texto"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {rodape && (
          <div className="flex items-center justify-end gap-2 rounded-b-2xl border-t border-borda bg-superficie-2/50 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {rodape}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** Bloco de número grande usado nos resumos. */
export function Metrica({
  rotulo,
  valor,
  detalhe,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  detalhe?: ReactNode;
  destaque?: boolean;
}) {
  return (
    <div
      className={`card elevar relative overflow-hidden px-4 py-3.5 ${
        destaque ? "border-acento/35 bg-linear-to-br from-acento/10 via-superficie to-superficie" : ""
      }`}
    >
      {destaque && (
        <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-linear-to-b from-acento-claro to-acento" aria-hidden />
      )}
      <p className="text-[11px] font-bold tracking-[0.06em] text-texto-suave uppercase">
        {rotulo}
      </p>
      <p
        className={`mt-1.5 text-xl font-extrabold tracking-tight tabular-nums md:text-2xl ${
          destaque ? "texto-degrade" : ""
        }`}
      >
        {valor}
      </p>
      {detalhe && (
        <p className="mt-0.5 text-xs text-texto-suave">{detalhe}</p>
      )}
    </div>
  );
}

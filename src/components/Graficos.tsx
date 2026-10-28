"use client";

import { brl } from "@/lib/format";
import type { Barra } from "@/lib/relatorios";

/*
 * Gráficos de uma série só, em uma cor (o laranja do acento): o título do
 * cartão diz o que é, então não precisa de legenda. Rótulo direto em cima de
 * cada barra e a dica nativa (title) ao passar o dedo/mouse.
 */

export function CartaoGrafico({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-borda px-4 py-3">
        <h2 className="text-sm font-bold">{titulo}</h2>
        {subtitulo && <p className="text-xs text-texto-suave">{subtitulo}</p>}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

export function SemDados({ texto = "Sem vendas no período." }: { texto?: string }) {
  return <p className="py-8 text-center text-sm text-texto-suave">{texto}</p>;
}

/** Colunas com o valor em cima. Rola de lado quando há muitas barras. */
export function BarrasVerticais({
  barras,
  altura = 160,
  formatar = brl,
}: {
  barras: Barra[];
  altura?: number;
  formatar?: (v: number) => string;
}) {
  if (barras.length === 0 || barras.every((b) => b.valor === 0)) return <SemDados />;
  const max = Math.max(...barras.map((b) => b.valor));
  return (
    <div className="-mx-1 overflow-x-auto">
      <div className="flex min-w-full items-end gap-1.5 px-1" style={{ height: altura + 72 }}>
        {barras.map((b) => {
          const h = max > 0 ? Math.max(2, (b.valor / max) * altura) : 2;
          return (
            <div
              key={b.chave}
              className="group flex min-w-[46px] flex-1 flex-col items-center justify-end"
              title={`${b.rotulo}: ${formatar(b.valor)}${b.detalhe ? ` (${b.detalhe} vs anterior)` : ""}`}
            >
              <span className="mb-1 text-[10px] font-semibold whitespace-nowrap text-texto-suave tabular-nums">
                {formatar(b.valor)}
              </span>
              <div
                className="w-full max-w-12 rounded-t-[4px] bg-acento/85 transition group-hover:bg-acento"
                style={{ height: h }}
              />
              <span className="mt-1.5 text-[11px] font-semibold whitespace-nowrap">{b.rotulo}</span>
              {b.detalhe !== undefined && (
                <span
                  className={`text-[10px] font-bold tabular-nums ${
                    b.detalhe.startsWith("-") ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {b.detalhe}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Ranking: nome, barra proporcional, valor e % do total. */
export function BarrasHorizontais({
  barras,
  formatar = brl,
  limite,
}: {
  barras: Barra[];
  formatar?: (v: number) => string;
  limite?: number;
}) {
  if (barras.length === 0) return <SemDados />;
  const total = barras.reduce((s, b) => s + b.valor, 0);
  const max = Math.max(...barras.map((b) => b.valor));
  const visiveis = limite ? barras.slice(0, limite) : barras;
  return (
    <ul className="space-y-3">
      {visiveis.map((b) => {
        const pct = total > 0 ? (b.valor / total) * 100 : 0;
        return (
          <li key={b.chave} title={`${b.rotulo}: ${formatar(b.valor)} (${pct.toFixed(1)}%)`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-semibold">{b.rotulo}</span>
              <span className="shrink-0 tabular-nums">
                <strong>{formatar(b.valor)}</strong>
                <span className="ml-1.5 text-xs text-texto-suave">{pct.toFixed(1).replace(".", ",")}%</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-superficie-2">
              <div
                className="h-full rounded-full bg-acento/85"
                style={{ width: `${max > 0 ? (b.valor / max) * 100 : 0}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

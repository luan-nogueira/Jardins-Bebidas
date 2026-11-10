"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Printer, Search, Square } from "lucide-react";
import { useDados } from "@/lib/store";
import { brl, hojeISO, horaBR } from "@/lib/format";
import { ROTULO_FORMA, diaDaVenda, numeroVenda, totalVenda, vendaConta } from "@/lib/vendas";
import { nomeComanda } from "@/lib/pedidos";
import { useImprimirVenda } from "@/components/CupomVenda";
import type { Venda } from "@/lib/types";

/*
 * Histórico do caixa (aba ao lado de "Retirada" em Vender): vendas fechadas
 * do dia escolhido. Marca várias e imprime de uma vez, imprime uma só pela
 * impressorinha da linha, ou toca na venda pra ver o detalhe.
 */

function formas(v: Venda) {
  const nomes = [...new Set(v.pagamentos.map((p) => ROTULO_FORMA[p.forma]))];
  return nomes.length ? nomes.join(" + ") : "A prazo";
}

export function HistoricoVendas({ aoVer }: { aoVer: (v: Venda) => void }) {
  const { vendas } = useDados();
  const { imprimir, area } = useImprimirVenda();
  const [dia, setDia] = useState(hojeISO());
  const [busca, setBusca] = useState("");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase().replace(/^#/, "");
    return vendas
      .filter((v) => vendaConta(v) && diaDaVenda(v) === dia)
      .filter(
        (v) =>
          !termo ||
          String(v.numero).includes(termo.replace(/^0+/, "")) ||
          nomeComanda(v).toLowerCase().includes(termo),
      )
      .sort((a, b) => (b.finalizadaEm ?? "").localeCompare(a.finalizadaEm ?? ""));
  }, [vendas, dia, busca]);

  const selecionadas = lista.filter((v) => marcadas.has(v.id));
  const todas = lista.length > 0 && selecionadas.length === lista.length;
  const totalDia = lista.reduce((s, v) => s + totalVenda(v), 0);

  function alternar(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function imprimirSelecionadas() {
    // Mais antigas primeiro: saem da impressora na ordem em que aconteceram.
    imprimir([...selecionadas].reverse());
    setMarcadas(new Set());
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <input
          type="date"
          className="campo w-auto"
          value={dia}
          max={hojeISO()}
          onChange={(e) => {
            setDia(e.target.value || hojeISO());
            setMarcadas(new Set());
          }}
          aria-label="Dia"
        />
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-texto-suave" />
          <input
            className="campo pl-9"
            placeholder="Nº da venda ou cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      <div className="card mb-2 flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-semibold"
          disabled={lista.length === 0}
          onClick={() => setMarcadas(todas ? new Set() : new Set(lista.map((v) => v.id)))}
        >
          {todas ? <CheckSquare className="h-5 w-5 text-acento" /> : <Square className="h-5 w-5 text-texto-suave" />}
          {todas ? "Desmarcar todas" : "Marcar todas"}
        </button>
        <span className="text-xs text-texto-suave">
          {lista.length} venda(s) · {brl(totalDia)}
        </span>
        <button
          type="button"
          className="btn-primario ml-auto px-3 py-1.5 text-sm"
          disabled={selecionadas.length === 0}
          onClick={imprimirSelecionadas}
        >
          <Printer className="h-4 w-4" />
          Imprimir selecionadas{selecionadas.length > 0 && ` (${selecionadas.length})`}
        </button>
      </div>

      {lista.length === 0 ? (
        <p className="card px-4 py-8 text-center text-sm text-texto-suave">Nenhuma venda nesse dia.</p>
      ) : (
        <ul className="card divide-y divide-borda overflow-hidden">
          {lista.map((v) => {
            const marcada = marcadas.has(v.id);
            return (
              <li key={v.id} className={`flex items-center gap-1 pr-2 ${marcada ? "bg-acento/5" : ""}`}>
                <button
                  type="button"
                  className="grid h-12 w-11 shrink-0 place-items-center"
                  onClick={() => alternar(v.id)}
                  aria-label={marcada ? "Desmarcar" : "Marcar pra imprimir"}
                  aria-pressed={marcada}
                >
                  {marcada ? (
                    <CheckSquare className="h-5 w-5 text-acento" />
                  ) : (
                    <Square className="h-5 w-5 text-texto-suave" />
                  )}
                </button>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
                  onClick={() => aoVer(v)}
                >
                  <span className="w-12 shrink-0 text-xs text-texto-suave tabular-nums">
                    {horaBR(v.finalizadaEm ?? v.abertaEm)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {numeroVenda(v.numero)} · {v.mesa || v.clienteNome ? nomeComanda(v) : "Consumidor final"}
                    </span>
                    <span className="block truncate text-xs text-texto-suave">
                      {v.tipo === "COMANDA" ? "Comanda" : "Balcão"} · {formas(v)}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular-nums">{brl(totalVenda(v))}</span>
                </button>
                <button
                  type="button"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-texto-suave hover:bg-superficie-2 hover:text-acento"
                  onClick={() => imprimir(v)}
                  aria-label={`Imprimir cupom da venda ${numeroVenda(v.numero)}`}
                  title="Imprimir cupom"
                >
                  <Printer className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {area}
    </div>
  );
}

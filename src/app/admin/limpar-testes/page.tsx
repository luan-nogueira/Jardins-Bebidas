"use client";

import { useMemo, useState } from "react";
import { CheckSquare, Square, Trash2 } from "lucide-react";
import { Cabecalho } from "@/components/ui";
import { SomenteAdmin } from "@/components/Protegido";
import { useDados } from "@/lib/store";
import { colecao } from "@/lib/db";
import { brl, hojeISO, horaBR } from "@/lib/format";
import { diaLocal, estornarEstoqueVenda, numeroVenda, totalVenda } from "@/lib/vendas";
import { nomeComanda } from "@/lib/pedidos";
import { numeroCaixa, useCaixas } from "@/lib/caixa";
import type { Venda } from "@/lib/types";

/*
 * Apaga os testes de UM dia (vendas, comandas, pedidos da cozinha e caixas),
 * devolvendo ao estoque o que as vendas tinham baixado. Mostra tudo antes e
 * deixa desmarcar o que for de verdade. Os fechamentos importados da
 * planilha nunca entram aqui.
 */

export default function LimparTestesPage() {
  return (
    <SomenteAdmin>
      <LimparTestes />
    </SomenteAdmin>
  );
}

const doDia = (iso: string | undefined, dia: string) => !!iso && diaLocal(iso) === dia;

function LimparTestes() {
  const d = useDados();
  const { vendas, pedidos, removerVenda, removerPedido, removerContaPagar } = d;
  const { caixas } = useCaixas();
  const [dia, setDia] = useState(hojeISO());
  const [desmarcadas, setDesmarcadas] = useState<Set<string>>(new Set());
  const [confirmacao, setConfirmacao] = useState("");
  const [progresso, setProgresso] = useState("");

  const vendasDia = useMemo(
    () =>
      vendas
        .filter((v) => !v.id.startsWith("fechamento-"))
        .filter((v) => doDia(v.abertaEm, dia) || doDia(v.finalizadaEm, dia) || doDia(v.canceladaEm, dia))
        .sort((a, b) => a.numero - b.numero),
    [vendas, dia],
  );
  const caixasDia = useMemo(() => caixas.filter((c) => doDia(c.abertoEm, dia)), [caixas, dia]);

  const marcadas = vendasDia.filter((v) => !desmarcadas.has(v.id));
  const caixasMarcados = caixasDia.filter((c) => !desmarcadas.has(c.id));
  const idsVendas = new Set(marcadas.map((v) => v.id));
  const pedidosApagar = pedidos.filter(
    (p) => idsVendas.has(p.vendaId) || (doDia(p.criadoEm, dia) && !vendas.some((v) => v.id === p.vendaId)),
  );
  const total = marcadas.length + caixasMarcados.length + pedidosApagar.length;

  function alternar(id: string) {
    setDesmarcadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function apagar() {
    if (confirmacao !== "APAGAR" || total === 0) return;
    let n = 0;
    for (const v of marcadas) {
      setProgresso(`Apagando ${numeroVenda(v.numero)} (${++n}/${marcadas.length})…`);
      // Venda finalizada tinha baixado o estoque: devolve antes de apagar.
      if (v.status === "FINALIZADA") await estornarEstoqueVenda(v, d);
      await removerVenda(v.id);
    }
    setProgresso("Apagando pedidos da cozinha…");
    for (const p of pedidosApagar) await removerPedido(p.id);
    setProgresso("Apagando caixas…");
    for (const c of caixasMarcados) {
      for (const m of c.movimentos) if (m.gastoId) await removerContaPagar(m.gastoId).catch(() => {});
      await colecao("caixas").remover(c.id);
    }
    setProgresso(
      `Pronto! Apagadas ${marcadas.length} venda(s)/comanda(s), ${pedidosApagar.length} pedido(s) da cozinha e ${caixasMarcados.length} caixa(s). O estoque foi devolvido.`,
    );
    setConfirmacao("");
    setDesmarcadas(new Set());
  }

  const Caixinha = ({ marcada }: { marcada: boolean }) =>
    marcada ? <CheckSquare className="h-5 w-5 shrink-0 text-acento" /> : <Square className="h-5 w-5 shrink-0 text-texto-suave" />;

  const rotuloVenda = (v: Venda) =>
    `${numeroVenda(v.numero)} · ${v.tipo === "COMANDA" ? "Comanda" : "Balcão"} · ${
      v.mesa || v.clienteNome ? nomeComanda(v) : "Consumidor final"
    }`;

  return (
    <>
      <Cabecalho titulo="Apagar testes" subtitulo="Remove o que foi feito de teste num dia, devolvendo o estoque" />
      <div className="max-w-2xl space-y-4 px-4 pb-10 md:px-6">
        <div className="flex items-center gap-2">
          <label className="rotulo mb-0" htmlFor="dia">
            Dia
          </label>
          <input
            id="dia"
            type="date"
            className="campo w-auto"
            value={dia}
            max={hojeISO()}
            onChange={(e) => {
              setDia(e.target.value || hojeISO());
              setDesmarcadas(new Set());
              setProgresso("");
            }}
          />
        </div>

        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Tudo marcado abaixo será apagado de vez. <strong>Desmarque</strong> o que foi venda de verdade. Os fechamentos
          importados da planilha não aparecem aqui e não são tocados.
        </p>

        <section className="card overflow-hidden">
          <h2 className="border-b border-borda px-4 py-3 font-bold">Vendas e comandas ({vendasDia.length})</h2>
          {vendasDia.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-texto-suave">Nada nesse dia.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {vendasDia.map((v) => (
                <li key={v.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left" onClick={() => alternar(v.id)}>
                    <Caixinha marcada={!desmarcadas.has(v.id)} />
                    <span className="w-12 shrink-0 text-xs text-texto-suave tabular-nums">{horaBR(v.abertaEm)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{rotuloVenda(v)}</span>
                      <span className="block text-xs text-texto-suave">
                        {v.status === "ABERTA" ? "Aberta" : v.status === "FINALIZADA" ? "Finalizada" : "Cancelada"}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">{brl(totalVenda(v))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {caixasDia.length > 0 && (
          <section className="card overflow-hidden">
            <h2 className="border-b border-borda px-4 py-3 font-bold">Caixas abertos nesse dia ({caixasDia.length})</h2>
            <ul className="divide-y divide-borda">
              {caixasDia.map((c) => (
                <li key={c.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-4 py-2.5 text-left" onClick={() => alternar(c.id)}>
                    <Caixinha marcada={!desmarcadas.has(c.id)} />
                    <span className="min-w-0 flex-1 text-sm font-semibold">
                      {numeroCaixa(c.numero)} · {c.status === "ABERTO" ? "aberto" : "fechado"} · {c.movimentos.length}{" "}
                      sangria(s)/reforço(s)
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-sm text-texto-suave">
          Junto vão {pedidosApagar.length} pedido(s) da cozinha dessas comandas.
        </p>

        <div className="card space-y-3 p-4">
          <label className="rotulo" htmlFor="conf">
            Pra confirmar, digite APAGAR
          </label>
          <input
            id="conf"
            className="campo"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value.toUpperCase())}
            placeholder="APAGAR"
          />
          <button className="btn-perigo w-full" disabled={confirmacao !== "APAGAR" || total === 0 || !!progresso && !progresso.startsWith("Pronto")} onClick={apagar}>
            <Trash2 className="h-4 w-4" />
            Apagar {marcadas.length} venda(s), {pedidosApagar.length} pedido(s) e {caixasMarcados.length} caixa(s)
          </button>
          {progresso && <p className="text-sm font-semibold">{progresso}</p>}
        </div>
      </div>
    </>
  );
}

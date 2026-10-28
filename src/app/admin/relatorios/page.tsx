"use client";

import { useMemo, useState } from "react";
import { Printer, Search } from "lucide-react";
import { Cabecalho } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { BarrasHorizontais, CartaoGrafico } from "@/components/Graficos";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { brl, dataBR, hojeISO, normalizar, num, somarDias } from "@/lib/format";
import { EMPRESA } from "@/lib/empresa";
import {
  noPeriodo,
  entradasESaidas,
  porCategoria,
  porCliente,
  porForma,
  produtosVendidos,
  resumir,
  sintetico,
  type Agrupamento,
} from "@/lib/relatorios";

function atalhos() {
  const hoje = hojeISO();
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const iso = (x: Date) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  return [
    { rotulo: "Hoje", de: hoje, ate: hoje, agrupar: "DIA" as Agrupamento },
    { rotulo: "7 dias", de: somarDias(hoje, -6), ate: hoje, agrupar: "DIA" as Agrupamento },
    { rotulo: "Este mês", de: hoje.slice(0, 8) + "01", ate: hoje, agrupar: "DIA" as Agrupamento },
    {
      rotulo: "Mês passado",
      de: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
      ate: iso(new Date(d.getFullYear(), d.getMonth(), 0)),
      agrupar: "SEMANA" as Agrupamento,
    },
    { rotulo: "Este ano", de: `${d.getFullYear()}-01-01`, ate: hoje, agrupar: "MES" as Agrupamento },
  ];
}

export default function RelatoriosPage() {
  return (
    <Protegido chave="relatorios">
      <Relatorios />
    </Protegido>
  );
}

function Relatorios() {
  const { vendas, movimentos } = useDados();
  const { permissoes } = useAuth();
  const custo = permissoes.verCusto;
  const [de, setDe] = useState(() => hojeISO().slice(0, 8) + "01");
  const [ate, setAte] = useState(hojeISO);
  const [agrupar, setAgrupar] = useState<Agrupamento>("DIA");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");

  const doPeriodo = useMemo(() => noPeriodo(vendas, de, ate), [vendas, de, ate]);
  const geral = useMemo(() => resumir(doPeriodo), [doPeriodo]);
  const linhas = useMemo(() => sintetico(doPeriodo, agrupar), [doPeriodo, agrupar]);
  const produtos = useMemo(() => produtosVendidos(doPeriodo), [doPeriodo]);
  const formas = useMemo(() => porForma(doPeriodo), [doPeriodo]);
  const categorias = useMemo(() => porCategoria(doPeriodo), [doPeriodo]);
  const clientes = useMemo(() => porCliente(doPeriodo), [doPeriodo]);
  const estoqueMov = useMemo(() => entradasESaidas(movimentos, de, ate), [movimentos, de, ate]);
  const totEstoque = estoqueMov.reduce(
    (t, m) => ({
      entrou: t.entrou + m.entrou,
      vendeu: t.vendeu + m.vendeu,
      perdas: t.perdas + m.perdas,
      ajustes: t.ajustes + m.ajustes,
      valorComprado: t.valorComprado + m.valorComprado,
    }),
    { entrou: 0, vendeu: 0, perdas: 0, ajustes: 0, valorComprado: 0 },
  );

  const produtosVisiveis = produtos.filter(
    (p) =>
      (!categoria || p.categoria === categoria) &&
      (!busca || normalizar(p.nome).includes(normalizar(busca))),
  );

  return (
    <>
      <div className="nao-imprimir">
        <Cabecalho
          titulo="Relatórios de vendas"
          subtitulo="Sintético por dia, semana ou mês e os produtos mais vendidos"
          acao={
            <button className="btn-secundario" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Imprimir / PDF
            </button>
          }
        />
      </div>

      <div className="space-y-5 px-4 pb-8 md:px-6">
        {/* Cabeçalho que só aparece no papel */}
        <div className="hidden print:block">
          <h1 className="text-xl font-black">{EMPRESA.nome} — Relatório de vendas</h1>
          <p className="text-sm">
            Período: {dataBR(de)} a {dataBR(ate)}
          </p>
        </div>

        <div className="nao-imprimir space-y-3">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            {atalhos().map((a) => (
              <button
                key={a.rotulo}
                onClick={() => {
                  setDe(a.de);
                  setAte(a.ate);
                  setAgrupar(a.agrupar);
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  a.de === de && a.ate === ate
                    ? "bg-acento text-acento-texto"
                    : "border border-borda bg-superficie text-texto-suave hover:bg-superficie-2"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 md:max-w-xl md:grid-cols-3">
            <div className="min-w-0">
              <label className="rotulo" htmlFor="r-de">De</label>
              <input id="r-de" type="date" className="campo" value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div className="min-w-0">
              <label className="rotulo" htmlFor="r-ate">Até</label>
              <input id="r-ate" type="date" className="campo" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
            <div className="col-span-2 min-w-0 md:col-span-1">
              <label className="rotulo">Agrupar por</label>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-superficie-2 p-1">
                {(
                  [
                    ["DIA", "Dia"],
                    ["SEMANA", "Semana"],
                    ["MES", "Mês"],
                  ] as [Agrupamento, string][]
                ).map(([k, r]) => (
                  <button
                    key={k}
                    onClick={() => setAgrupar(k)}
                    className={`rounded-lg py-1.5 text-xs font-bold ${
                      agrupar === k ? "bg-superficie shadow-sm" : "text-texto-suave"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sintético */}
        <section className="card overflow-hidden">
          <div className="border-b border-borda px-4 py-3">
            <h2 className="text-sm font-bold">Vendas sintético</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-superficie-2 text-[11px] tracking-wide text-texto-suave uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Período</th>
                  <th className="px-3 py-2 text-right">Vendas</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Ticket</th>
                  <th className="px-3 py-2 text-right">Desc.</th>
                  {custo && <th className="px-3 py-2 text-right">Custo</th>}
                  {custo && <th className="px-3 py-2 text-right">Lucro</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-texto-suave">
                      Sem vendas no período.
                    </td>
                  </tr>
                )}
                {linhas.map((l) => (
                  <tr key={l.chave}>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{l.rotulo}</td>
                    <td className="px-3 py-2 text-right">{l.vendas}</td>
                    <td className="px-3 py-2 text-right font-bold whitespace-nowrap">{brl(l.total)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(l.ticketMedio)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(l.descontos)}</td>
                    {custo && <td className="px-3 py-2 text-right whitespace-nowrap">{brl(l.custo)}</td>}
                    {custo && <td className="px-3 py-2 text-right whitespace-nowrap">{brl(l.lucro)}</td>}
                  </tr>
                ))}
              </tbody>
              {linhas.length > 0 && (
                <tfoot className="border-t-2 border-borda-forte bg-acento/5 font-black">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{geral.vendas}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap text-acento">{brl(geral.total)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(geral.ticketMedio)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(geral.descontos)}</td>
                    {custo && <td className="px-3 py-2 text-right whitespace-nowrap">{brl(geral.custo)}</td>}
                    {custo && <td className="px-3 py-2 text-right whitespace-nowrap">{brl(geral.lucro)}</td>}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {(geral.qtdCancelados > 0 || geral.aReceber > 0) && (
            <p className="border-t border-borda px-4 py-2 text-xs text-texto-suave">
              {geral.qtdCancelados > 0 && `${geral.qtdCancelados} venda(s) cancelada(s) somando ${brl(geral.cancelados)} (fora do total). `}
              {geral.aReceber > 0 && `${brl(geral.aReceber)} do total ficou a prazo (fiado).`}
            </p>
          )}
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <CartaoGrafico titulo="Por forma de pagamento">
            <BarrasHorizontais barras={formas} />
          </CartaoGrafico>
          <CartaoGrafico titulo="Por categoria">
            <BarrasHorizontais barras={categorias} />
          </CartaoGrafico>
        </div>

        {/* Entradas e saídas de estoque */}
        <section className="card overflow-hidden">
          <div className="border-b border-borda px-4 py-3">
            <h2 className="text-sm font-bold">Entradas e saídas de estoque</h2>
            <p className="text-xs text-texto-suave">
              O que entrou por compra e o que saiu (venda, perda, contagem) de cada produto no período
              {custo && totEstoque.valorComprado > 0 && ` · comprado: ${brl(totEstoque.valorComprado)}`}
            </p>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="sticky top-0 bg-superficie-2 text-[11px] tracking-wide text-texto-suave uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Produto</th>
                  <th className="px-3 py-2 text-right">Entrou</th>
                  <th className="px-3 py-2 text-right">Vendeu</th>
                  <th className="px-3 py-2 text-right">Perdas</th>
                  <th className="px-3 py-2 text-right">Contagem</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {estoqueMov.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-texto-suave">
                      Nenhuma movimentação de estoque no período.
                    </td>
                  </tr>
                )}
                {estoqueMov.map((m) => {
                  const saldo = m.entrou - m.vendeu - m.perdas + m.ajustes;
                  return (
                    <tr key={m.produtoId}>
                      <td className="px-3 py-2 font-semibold">{m.nome}</td>
                      <td className={`px-3 py-2 text-right ${m.entrou ? "text-emerald-700 dark:text-emerald-400" : "text-texto-suave"}`}>{m.entrou ? `+${num(m.entrou)}` : "—"}</td>
                      <td className={`px-3 py-2 text-right ${m.vendeu ? "" : "text-texto-suave"}`}>{m.vendeu ? num(m.vendeu) : "—"}</td>
                      <td className={`px-3 py-2 text-right ${m.perdas ? "text-red-600 dark:text-red-400" : "text-texto-suave"}`}>{m.perdas ? num(m.perdas) : "—"}</td>
                      <td className="px-3 py-2 text-right text-texto-suave">
                        {m.ajustes ? `${m.ajustes > 0 ? "+" : ""}${num(m.ajustes)}` : "—"}
                      </td>
                      <td className={`px-3 py-2 text-right font-bold ${saldo < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                        {saldo > 0 ? "+" : ""}
                        {num(saldo)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {estoqueMov.length > 0 && (
                <tfoot className="sticky bottom-0 border-t-2 border-borda-forte bg-superficie font-black">
                  <tr>
                    <td className="px-3 py-2">Total ({estoqueMov.length} produtos)</td>
                    <td className="px-3 py-2 text-right">+{num(totEstoque.entrou)}</td>
                    <td className="px-3 py-2 text-right">{num(totEstoque.vendeu)}</td>
                    <td className="px-3 py-2 text-right">{num(totEstoque.perdas)}</td>
                    <td className="px-3 py-2 text-right">{num(totEstoque.ajustes)}</td>
                    <td className="px-3 py-2 text-right">
                      {num(totEstoque.entrou - totEstoque.vendeu - totEstoque.perdas + totEstoque.ajustes)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {/* Vendas por cliente */}
        <section className="card overflow-hidden">
          <div className="border-b border-borda px-4 py-3">
            <h2 className="text-sm font-bold">Vendas por cliente</h2>
            <p className="text-xs text-texto-suave">Quem mais comprou no período e quanto ainda deve dessas compras</p>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="sticky top-0 bg-superficie-2 text-[11px] tracking-wide text-texto-suave uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Cliente</th>
                  <th className="px-3 py-2 text-right">Compras</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Em aberto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {clientes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-texto-suave">Sem vendas no período.</td>
                  </tr>
                )}
                {clientes.map((c) => (
                  <tr key={c.chave}>
                    <td className={`px-3 py-2 font-semibold ${c.chave === "__consumidor__" ? "text-texto-suave" : ""}`}>{c.nome}</td>
                    <td className="px-3 py-2 text-right">{c.compras}</td>
                    <td className="px-3 py-2 text-right font-bold whitespace-nowrap">{brl(c.total)}</td>
                    <td className={`px-3 py-2 text-right whitespace-nowrap ${c.emAberto > 0.005 ? "font-bold text-red-600 dark:text-red-400" : "text-texto-suave"}`}>
                      {c.emAberto > 0.005 ? brl(c.emAberto) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Ranking completo de produtos */}
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-3">
            <h2 className="mr-auto text-sm font-bold">Produtos vendidos ({produtos.length})</h2>
            <div className="nao-imprimir relative w-full sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-texto-suave" />
              <input
                className="campo h-9 py-1 pl-9 text-sm"
                placeholder="Buscar produto…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <select
              className="campo nao-imprimir h-9 w-full py-1 text-sm sm:w-44"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              aria-label="Categoria"
            >
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c.chave} value={c.chave}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-superficie-2 text-[11px] tracking-wide text-texto-suave uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Produto</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Vendido</th>
                  {custo && <th className="px-3 py-2 text-right">Lucro</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {produtosVisiveis.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-texto-suave">
                      Nenhum produto vendido no período.
                    </td>
                  </tr>
                )}
                {produtosVisiveis.map((p, i) => (
                  <tr key={p.produtoId}>
                    <td className="px-3 py-2 text-texto-suave">{i + 1}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{p.nome}</span>
                      <span className="block text-[11px] text-texto-suave">{p.categoria}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-bold">{num(p.qtd)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{brl(p.valor)}</td>
                    {custo && <td className="px-3 py-2 text-right whitespace-nowrap">{brl(p.valor - p.custo)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

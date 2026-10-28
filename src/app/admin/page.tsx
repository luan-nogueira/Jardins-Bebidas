"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  PackageX,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Cabecalho, Metrica } from "@/components/ui";
import { PrimeirosPassos, TarefasDoDia, saudacao } from "@/components/Inicio";
import { BarrasHorizontais, BarrasVerticais, CartaoGrafico } from "@/components/Graficos";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { brl, caixasEUnidades, hojeISO, num, somarDias } from "@/lib/format";
import { estoqueBaixo, estoqueNegativo, nivelEstoque } from "@/lib/calc";
import { COR_NIVEL, visualCategoria } from "@/lib/categoriaVisual";
import { saldoVenda, totalVenda, vendaEmAberto, vendaVencida } from "@/lib/vendas";
import {
  noPeriodo,
  porCategoria,
  porForma,
  porHora,
  produtosVendidos,
  resumir,
  ultimosMeses,
} from "@/lib/relatorios";

function atalhos() {
  const hoje = hojeISO();
  return [
    { rotulo: "Hoje", de: hoje, ate: hoje },
    { rotulo: "Ontem", de: somarDias(hoje, -1), ate: somarDias(hoje, -1) },
    { rotulo: "7 dias", de: somarDias(hoje, -6), ate: hoje },
    { rotulo: "Este mês", de: hoje.slice(0, 8) + "01", ate: hoje },
  ];
}

export default function Painel() {
  const { vendas, produtos, contasPagar, movimentos, carregando } = useDados();
  const { permissoes } = useAuth();
  const [de, setDe] = useState(hojeISO);
  const [ate, setAte] = useState(hojeISO);

  const doPeriodo = useMemo(() => noPeriodo(vendas, de, ate), [vendas, de, ate]);
  const r = useMemo(() => resumir(doPeriodo), [doPeriodo]);
  const horas = useMemo(() => porHora(doPeriodo), [doPeriodo]);
  const formas = useMemo(() => porForma(doPeriodo), [doPeriodo]);
  const categorias = useMemo(() => porCategoria(doPeriodo), [doPeriodo]);
  const top = useMemo(() => produtosVendidos(doPeriodo).slice(0, 10), [doPeriodo]);
  const meses = useMemo(() => ultimosMeses(vendas, 4), [vendas]);

  const hoje = hojeISO();
  const abertas = vendas.filter((v) => v.status === "ABERTA");
  const aReceber = vendas.filter(vendaEmAberto);
  const vencidas = vendas.filter((v) => vendaVencida(v, hoje));
  const contasVencendo = contasPagar.filter((c) => !c.pago && c.vencimento <= somarDias(hoje, 7));
  const repor = produtos.filter((p) => p.ativo && (estoqueBaixo(p) || estoqueNegativo(p)));
  const lotesVencendo = movimentos.filter(
    (m) => m.origem === "COMPRA" && m.validade && m.validade <= somarDias(hoje, 30),
  );

  const multiDia = de !== ate;

  // Um dia só: compara com o mesmo dia da semana passada (sábado com sábado),
  // que num depósito diz mais que comparar com ontem.
  const comparacao = useMemo(() => {
    if (de !== ate) return null;
    const antes = somarDias(de, -7);
    const anterior = resumir(noPeriodo(vendas, antes, antes)).total;
    const data = new Date(`${antes}T12:00:00`);
    const nome = data.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    // Sábado e domingo são "o"; os outros dias, "a".
    const fimDeSemana = data.getDay() === 0 || data.getDay() === 6;
    const dia = fimDeSemana ? `no ${nome} passado` : `na ${nome} passada`;
    if (anterior <= 0) return r.total > 0 ? { texto: `sem vendas ${dia}`, sobe: true, pct: null } : null;
    const pct = ((r.total - anterior) / anterior) * 100;
    return { texto: `vs ${brl(anterior)} ${dia}`, sobe: pct >= 0, pct };
  }, [vendas, de, ate, r.total]);

  // Os que mais precisam de compra primeiro: zerados, depois os mais abaixo do mínimo.
  const paraRepor = useMemo(
    () =>
      [...repor]
        .sort(
          (a, b) =>
            Number(b.estoqueUn <= 0) - Number(a.estoqueUn <= 0) ||
            a.estoqueUn / (a.estoqueMinimo || 1) - b.estoqueUn / (b.estoqueMinimo || 1),
        )
        .slice(0, 6),
    [repor],
  );

  return (
    <>
      <Cabecalho
        titulo="Painel"
        subtitulo={
          carregando ? "Carregando…" : <span suppressHydrationWarning>{saudacao()}</span>
        }
      />

      <div className="space-y-5 px-4 pb-6 md:px-6">
        <TarefasDoDia />
        <PrimeirosPassos />

        {/* Filtro de período */}
        <div className="space-y-3 pt-2">
          <h2 className="text-sm font-bold">Como foram as vendas</h2>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            {atalhos().map((a) => (
              <button
                key={a.rotulo}
                onClick={() => {
                  setDe(a.de);
                  setAte(a.ate);
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
          <div className="grid max-w-md grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="rotulo" htmlFor="p-de">Data inicial</label>
              <input id="p-de" type="date" className="campo" value={de} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div className="min-w-0">
              <label className="rotulo" htmlFor="p-ate">Data final</label>
              <input id="p-ate" type="date" className="campo" value={ate} onChange={(e) => setAte(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Números do período */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Metrica
            rotulo="Venda"
            valor={brl(r.total)}
            destaque
            detalhe={
              comparacao && (
                <span className="flex flex-wrap items-center gap-x-1.5">
                  {comparacao.pct !== null && (
                    <span
                      className={`inline-flex items-center gap-0.5 font-bold ${
                        comparacao.sobe ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {comparacao.sobe ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {Math.abs(comparacao.pct).toFixed(0)}%
                    </span>
                  )}
                  <span>{comparacao.texto}</span>
                </span>
              )
            }
          />
          <Metrica rotulo="Ticket médio" valor={brl(r.ticketMedio)} />
          <Metrica rotulo="Fluxo de vendas" valor={num(r.vendas)} detalhe={`${num(r.unidades)} itens`} />
          <Metrica rotulo="Descontos" valor={brl(r.descontos)} />
          <Metrica
            rotulo="Cancelados"
            valor={brl(r.cancelados)}
            detalhe={r.qtdCancelados ? `${r.qtdCancelados} venda(s)` : undefined}
          />
          <Metrica rotulo="Ficou a receber" valor={brl(r.aReceber)} detalhe="vendido fiado" />
          {permissoes.verCusto && (
            <>
              <Metrica rotulo="Custo" valor={brl(r.custo)} />
              <Metrica
                rotulo="Lucro"
                valor={brl(r.lucro)}
                detalhe={`margem ${r.margem.toFixed(1).replace(".", ",")}%`}
              />
            </>
          )}
        </div>

        {/* Avisos do que precisa de atenção */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {abertas.length > 0 && (
            <Aviso
              href="/admin/comandas"
              Icone={ClipboardList}
              titulo={`${abertas.length} comanda(s) aberta(s)`}
              texto={`${brl(abertas.reduce((s, v) => s + totalVenda(v), 0))} ainda sem fechar`}
            />
          )}
          {aReceber.length > 0 && permissoes.financeiro && (
            <Aviso
              href="/admin/comandas?aba=receber"
              Icone={Wallet}
              titulo={`${brl(aReceber.reduce((s, v) => s + saldoVenda(v), 0))} a receber`}
              texto={vencidas.length ? `${vencidas.length} vencida(s)!` : `${aReceber.length} comanda(s) fiado`}
              alerta={vencidas.length > 0}
            />
          )}
          {contasVencendo.length > 0 && permissoes.financeiro && (
            <Aviso
              href="/admin/financeiro"
              Icone={CalendarClock}
              titulo={`${contasVencendo.length} conta(s) a pagar`}
              texto={`${brl(contasVencendo.reduce((s, c) => s + c.valor, 0))} vencendo em até 7 dias`}
              alerta={contasVencendo.some((c) => c.vencimento < hoje)}
            />
          )}
          {repor.length > 0 && permissoes.estoque && (
            <Aviso
              href="/admin/estoque?repor=1"
              Icone={PackageX}
              titulo={`${repor.length} produto(s) pra repor`}
              texto={repor.slice(0, 3).map((p) => p.nome).join(", ")}
            />
          )}
          {lotesVencendo.length > 0 && permissoes.estoque && (
            <Aviso
              href="/admin/estoque?validade=1"
              Icone={AlertTriangle}
              titulo={`${lotesVencendo.length} lote(s) perto da validade`}
              texto="Vencem em até 30 dias"
              alerta
            />
          )}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          {paraRepor.length > 0 && permissoes.estoque && (
            <CartaoGrafico titulo="Pra repor" subtitulo="Zerados ou abaixo do estoque mínimo">
              <ul className="space-y-2.5">
                {paraRepor.map((p) => {
                  const nivel = COR_NIVEL[nivelEstoque(p)];
                  const { Icone, selo } = visualCategoria(p.categoria, p.nome);
                  return (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selo}`}>
                        <Icone className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.nome}</span>
                      <span className={`flex shrink-0 items-center gap-1.5 text-xs font-bold tabular-nums ${nivel.texto}`}>
                        <span className={`h-2 w-2 rounded-full ${nivel.ponto}`} />
                        {caixasEUnidades(p.estoqueUn, p.unPorCaixa)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {repor.length > paraRepor.length && (
                <Link
                  href="/admin/estoque?repor=1"
                  className="mt-3 block text-center text-xs font-bold text-acento hover:underline"
                >
                  Ver todos os {repor.length}
                </Link>
              )}
            </CartaoGrafico>
          )}

          <CartaoGrafico titulo="Mais vendidos" subtitulo="Por quantidade no período">
            {top.length === 0 ? (
              <BarrasHorizontais barras={[]} />
            ) : (
              <ol className="space-y-2">
                {top.map((p, i) => (
                  <li key={p.produtoId} className="flex items-center gap-3 text-sm">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-acento/15 text-[11px] font-black text-acento">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{p.nome}</span>
                    <span className="shrink-0 font-bold tabular-nums">{num(p.qtd)} un</span>
                    <span className="w-24 shrink-0 text-right text-texto-suave tabular-nums">{brl(p.valor)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CartaoGrafico>

          <CartaoGrafico
            titulo={multiDia ? "Vendas por hora do dia" : "Vendas por hora"}
            subtitulo={multiDia ? "Somando todos os dias do período" : undefined}
          >
            <BarrasVerticais barras={horas} />
          </CartaoGrafico>

          <CartaoGrafico titulo="Vendas × Pagamento">
            <BarrasHorizontais barras={formas} />
          </CartaoGrafico>

          <CartaoGrafico titulo="Vendas × Categoria">
            <BarrasHorizontais barras={categorias} />
          </CartaoGrafico>

          <CartaoGrafico titulo="Comparativo mensal" subtitulo="Variação em relação ao mês anterior">
            <BarrasVerticais barras={meses} />
          </CartaoGrafico>
        </div>
      </div>
    </>
  );
}

function Aviso({
  href,
  Icone,
  titulo,
  texto,
  alerta = false,
}: {
  href: string;
  Icone: React.ComponentType<{ className?: string }>;
  titulo: string;
  texto: string;
  alerta?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`card flex items-center gap-3 px-4 py-3 transition hover:bg-superficie-2 ${
        alerta ? "border-red-300 dark:border-red-900" : ""
      }`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          alerta ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-acento/15 text-acento"
        }`}
      >
        <Icone className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{titulo}</span>
        <span className="block truncate text-xs text-texto-suave">{texto}</span>
      </span>
    </Link>
  );
}

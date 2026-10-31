"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  QrCode,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Cabecalho } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { BarrasHorizontais, CartaoGrafico, SemDados } from "@/components/Graficos";
import { useDados } from "@/lib/store";
import { brl, dataBR, hojeISO } from "@/lib/format";
import { FORMAS, ROTULO_FORMA } from "@/lib/vendas";
import { CAIXA_DA_LOJA, entradasDoMes, grupoSaida, nomeMes, saidasDoMes } from "@/lib/gastos";
import type { FormaPagamento } from "@/lib/types";

/*
 * Fluxo de caixa do mês: o que entrou (vendas recebidas, por forma de
 * pagamento) e o que saiu (gastos, contas pagas e compras à vista), com o
 * saldo dia a dia. Usa as mesmas contas da tela Gastos, então os números
 * batem com ela.
 */

export default function FluxoPage() {
  return (
    <Protegido chave="financeiro">
      <Fluxo />
    </Protegido>
  );
}

const ICONE_FORMA: Record<FormaPagamento, LucideIcon> = {
  DINHEIRO: Banknote,
  PIX: QrCode,
  DEBITO: CreditCard,
  CREDITO: CreditCard,
};

function somarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "+12%" / "−8%" contra o mês anterior; nada se não tinha base. */
function variacao(atual: number, anterior: number) {
  if (anterior <= 0) return undefined;
  const p = ((atual - anterior) / anterior) * 100;
  return `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(0)}%`;
}

const pct = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toFixed(1).replace(".", ",")}%` : "0%");

interface Dia {
  dia: string;
  porForma: Record<FormaPagamento, number>;
  entrou: number;
  saiu: number;
  acumulado: number;
}

function resumoDoMes(
  mes: string,
  dados: Pick<ReturnType<typeof useDados>, "vendas" | "contasPagar" | "movimentos">,
) {
  const entradas = entradasDoMes(mes, dados.vendas);
  const saidas = saidasDoMes(mes, dados.contasPagar, dados.movimentos);
  const entrou = entradas.reduce((s, e) => s + e.valor, 0);
  const saiu = saidas.reduce((s, x) => s + x.valor, 0);
  return { entradas, saidas, entrou, saiu };
}

function Fluxo() {
  const { vendas, contasPagar, movimentos } = useDados();
  const mesAtual = hojeISO().slice(0, 7);
  const [mes, setMes] = useState(mesAtual);

  const atual = useMemo(
    () => resumoDoMes(mes, { vendas, contasPagar, movimentos }),
    [mes, vendas, contasPagar, movimentos],
  );
  const anterior = useMemo(
    () => resumoDoMes(somarMes(mes, -1), { vendas, contasPagar, movimentos }),
    [mes, vendas, contasPagar, movimentos],
  );
  const { entradas, saidas, entrou, saiu } = atual;
  const saldo = entrou - saiu;

  const porForma = useMemo(() => {
    const r = Object.fromEntries(FORMAS.map((f) => [f, { valor: 0, qtd: 0 }])) as Record<
      FormaPagamento,
      { valor: number; qtd: number }
    >;
    for (const e of entradas) {
      r[e.forma].valor += e.valor;
      r[e.forma].qtd++;
    }
    return r;
  }, [entradas]);

  // Dinheiro vivo: entrou em dinheiro menos o que o caixa pagou em dinheiro.
  const dinheiroSaiu = saidas
    .filter((s) => s.forma === ROTULO_FORMA.DINHEIRO && s.pagoPor === CAIXA_DA_LOJA)
    .reduce((s, x) => s + x.valor, 0);
  const dinheiroNoCaixa = porForma.DINHEIRO.valor - dinheiroSaiu;

  /** Todos os dias do mês até hoje (dia sem movimento também aparece). */
  const dias = useMemo<Dia[]>(() => {
    const [a, m] = mes.split("-").map(Number);
    const ultimo = mes === mesAtual ? Number(hojeISO().slice(8, 10)) : new Date(a, m, 0).getDate();
    const mapa = new Map<string, Dia>();
    for (let d = 1; d <= ultimo; d++) {
      const dia = `${mes}-${String(d).padStart(2, "0")}`;
      mapa.set(dia, {
        dia,
        porForma: { DINHEIRO: 0, PIX: 0, DEBITO: 0, CREDITO: 0 },
        entrou: 0,
        saiu: 0,
        acumulado: 0,
      });
    }
    for (const e of entradas) {
      const d = mapa.get(e.dia);
      if (!d) continue;
      d.porForma[e.forma] += e.valor;
      d.entrou += e.valor;
    }
    for (const s of saidas) {
      const d = mapa.get(s.dia);
      if (d) d.saiu += s.valor;
    }
    let acc = 0;
    const lista = [...mapa.values()];
    for (const d of lista) {
      acc += d.entrou - d.saiu;
      d.acumulado = acc;
    }
    return lista;
  }, [mes, mesAtual, entradas, saidas]);

  const comMovimento = dias.filter((d) => d.entrou || d.saiu);
  const melhorDia = comMovimento.reduce<Dia | null>((m, d) => (!m || d.entrou > m.entrou ? d : m), null);
  const diasComVenda = dias.filter((d) => d.entrou).length;
  const mediaDia = diasComVenda ? entrou / diasComVenda : 0;

  const barrasEntrada = FORMAS.filter((f) => porForma[f].valor > 0)
    .map((f) => ({ chave: f, rotulo: ROTULO_FORMA[f], valor: porForma[f].valor }))
    .sort((a, b) => b.valor - a.valor);
  const agrupar = (chave: (s: (typeof saidas)[number]) => string) => {
    const mapa = new Map<string, number>();
    for (const s of saidas) mapa.set(chave(s), (mapa.get(chave(s)) ?? 0) + s.valor);
    return [...mapa.entries()].map(([k, valor]) => ({ chave: k, rotulo: k, valor })).sort((a, b) => b.valor - a.valor);
  };
  const barrasSaidaForma = agrupar((s) => s.forma || "Não informado");
  const barrasSaidaCategoria = agrupar(grupoSaida);

  return (
    <>
      <Cabecalho titulo="Fluxo de caixa" subtitulo="Tudo que entrou e saiu do caixa, por forma de pagamento" />

      <div className="space-y-4 px-4 pb-8 md:px-6">
        <div className="flex items-center gap-2 md:max-w-md">
          <button onClick={() => setMes((m) => somarMes(m, -1))} className="btn-secundario h-10 w-10 px-0" aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="min-w-0 flex-1 text-center text-lg font-black">{nomeMes(mes)}</h2>
          <button
            onClick={() => setMes((m) => somarMes(m, 1))}
            disabled={mes >= mesAtual}
            className="btn-secundario h-10 w-10 px-0"
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Saldo em destaque + entrou/saiu */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.3fr_1fr_1fr]">
          <div className="card elevar relative col-span-2 lg:col-span-1 overflow-hidden border-acento/35 bg-linear-to-br from-acento/10 via-superficie to-superficie px-5 py-4">
            <span className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-linear-to-b from-acento-claro to-acento" aria-hidden />
            <p className="text-[11px] font-bold tracking-[0.06em] text-texto-suave uppercase">Saldo do mês</p>
            <p
              className={`mt-1 text-3xl font-black tracking-tight tabular-nums md:text-4xl ${
                saldo < 0 ? "text-red-600 dark:text-red-400" : "texto-degrade"
              }`}
            >
              {brl(saldo)}
            </p>
            <p className="mt-1 text-xs text-texto-suave">
              {saldo >= 0 ? "Entrou mais do que saiu" : "Saiu mais do que entrou"}
              {anterior.entrou + anterior.saiu > 0 && ` · mês anterior: ${brl(anterior.entrou - anterior.saiu)}`}
            </p>
          </div>
          <CartaoTotal
            rotulo="Entrou"
            valor={entrou}
            Icone={ArrowDownLeft}
            cor="var(--entrou)"
            detalhe={`${entradas.length} recebimento(s)`}
            vs={variacao(entrou, anterior.entrou)}
          />
          <CartaoTotal
            rotulo="Saiu"
            valor={saiu}
            Icone={ArrowUpRight}
            cor="var(--saiu)"
            detalhe={`${saidas.length} lançamento(s)`}
            vs={variacao(saiu, anterior.saiu)}
          />
        </div>

        {/* Uma caixinha por forma de recebimento */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {FORMAS.map((f) => {
            const Icone = ICONE_FORMA[f];
            const { valor, qtd } = porForma[f];
            return (
              <div key={f} className="card elevar px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold tracking-[0.06em] text-texto-suave uppercase">{ROTULO_FORMA[f]}</p>
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-acento/10 text-acento">
                    <Icone className="h-4 w-4" />
                  </span>
                </div>
                <p className="mt-1 text-xl font-extrabold tracking-tight tabular-nums md:text-2xl">{brl(valor)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-superficie-2">
                  <div className="h-full rounded-full bg-[var(--entrou)]" style={{ width: pct(valor, entrou).replace(",", ".") }} />
                </div>
                <p className="mt-1 text-xs text-texto-suave">
                  {pct(valor, entrou)} do que entrou · {qtd}x
                </p>
              </div>
            );
          })}
        </div>

        {/* Números rápidos */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Mini
            rotulo="Dinheiro no caixa"
            valor={brl(dinheiroNoCaixa)}
            detalhe="entrou − pago em dinheiro"
            Icone={Wallet}
          />
          <Mini rotulo="Média por dia" valor={brl(mediaDia)} detalhe="nos dias com venda" />
          <Mini
            rotulo="Melhor dia"
            valor={melhorDia && melhorDia.entrou > 0 ? brl(melhorDia.entrou) : "—"}
            detalhe={melhorDia && melhorDia.entrou > 0 ? dataBR(melhorDia.dia) : "sem vendas"}
          />
          <Mini
            rotulo="Maior saída"
            valor={barrasSaidaCategoria[0] ? brl(barrasSaidaCategoria[0].valor) : "—"}
            detalhe={barrasSaidaCategoria[0]?.rotulo ?? "nada saiu"}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <CartaoGrafico titulo="Entrou x saiu por dia" subtitulo="Passe o dedo ou o mouse numa coluna pra ver os valores">
            <EntrouSaiu dias={dias} />
          </CartaoGrafico>
          <CartaoGrafico titulo="Saldo acumulado" subtitulo="Quanto sobrou no mês até cada dia">
            <SaldoAcumulado dias={dias} />
          </CartaoGrafico>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <CartaoGrafico titulo="Entradas por forma">
            <BarrasHorizontais barras={barrasEntrada} cor="var(--entrou)" />
          </CartaoGrafico>
          <CartaoGrafico titulo="Saídas por forma">
            {barrasSaidaForma.length ? <BarrasHorizontais barras={barrasSaidaForma} cor="var(--saiu)" /> : <SemDados texto="Nada saiu neste mês." />}
          </CartaoGrafico>
          <CartaoGrafico titulo="Pra onde foi o dinheiro" subtitulo="Saídas por categoria">
            {barrasSaidaCategoria.length ? (
              <>
                <BarrasHorizontais barras={barrasSaidaCategoria} limite={6} cor="var(--saiu)" />
                <Link href="/admin/gastos" className="mt-3 inline-block text-xs font-semibold text-acento hover:underline">
                  Ver o detalhe em Gastos →
                </Link>
              </>
            ) : (
              <SemDados texto="Nada saiu neste mês." />
            )}
          </CartaoGrafico>
        </div>

        {/* Dia a dia */}
        <section className="card overflow-hidden">
          <div className="border-b border-borda px-4 py-3">
            <h2 className="text-sm font-bold">Dia a dia</h2>
            <p className="text-xs text-texto-suave">Só os dias com movimento, do mais recente pro mais antigo</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap tabular-nums">
              <thead className="bg-superficie-2 text-[11px] tracking-wide text-texto-suave uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Dia</th>
                  {FORMAS.map((f) => (
                    <th key={f} className="px-3 py-2 text-right">
                      {ROTULO_FORMA[f].replace("Cartão ", "")}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">Entrou</th>
                  <th className="px-3 py-2 text-right">Saiu</th>
                  <th className="px-3 py-2 text-right">Saldo do dia</th>
                  <th className="px-3 py-2 text-right">Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {comMovimento.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-texto-suave">
                      Nenhum movimento neste mês.
                    </td>
                  </tr>
                )}
                {[...comMovimento].reverse().map((d) => (
                  <tr key={d.dia}>
                    <td className="px-3 py-2 font-semibold">{dataBR(d.dia).slice(0, 5)}</td>
                    {FORMAS.map((f) => (
                      <td key={f} className={`px-3 py-2 text-right ${d.porForma[f] ? "" : "text-texto-suave"}`}>
                        {d.porForma[f] ? brl(d.porForma[f]) : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-bold">{d.entrou ? brl(d.entrou) : "—"}</td>
                    <td className="px-3 py-2 text-right">{d.saiu ? brl(d.saiu) : "—"}</td>
                    <td className={`px-3 py-2 text-right font-bold ${d.entrou - d.saiu < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                      {brl(d.entrou - d.saiu)}
                    </td>
                    <td className={`px-3 py-2 text-right ${d.acumulado < 0 ? "text-red-600 dark:text-red-400" : "text-texto-suave"}`}>
                      {brl(d.acumulado)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {comMovimento.length > 0 && (
                <tfoot className="border-t-2 border-borda-forte bg-superficie font-black">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    {FORMAS.map((f) => (
                      <td key={f} className="px-3 py-2 text-right">
                        {brl(porForma[f].valor)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">{brl(entrou)}</td>
                    <td className="px-3 py-2 text-right">{brl(saiu)}</td>
                    <td className="px-3 py-2 text-right">{brl(saldo)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function CartaoTotal({
  rotulo,
  valor,
  Icone,
  cor,
  detalhe,
  vs,
}: {
  rotulo: string;
  valor: number;
  Icone: LucideIcon;
  cor: string;
  detalhe: string;
  vs?: string;
}) {
  return (
    <div className="card elevar px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg text-white" style={{ background: cor }}>
          <Icone className="h-4 w-4" />
        </span>
        <p className="text-[11px] font-bold tracking-[0.06em] text-texto-suave uppercase">{rotulo}</p>
      </div>
      <p className="mt-1.5 text-xl font-extrabold tracking-tight tabular-nums md:text-2xl">{brl(valor)}</p>
      <p className="mt-0.5 text-xs text-texto-suave">
        {detalhe}
        {vs && ` · ${vs} vs mês anterior`}
      </p>
    </div>
  );
}

function Mini({ rotulo, valor, detalhe, Icone }: { rotulo: string; valor: string; detalhe: string; Icone?: LucideIcon }) {
  return (
    <div className="card px-4 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.06em] text-texto-suave uppercase">
        {Icone && <Icone className="h-3.5 w-3.5" />}
        {rotulo}
      </p>
      <p className="mt-1 text-lg font-extrabold tabular-nums">{valor}</p>
      <p className="truncate text-xs text-texto-suave" title={detalhe}>
        {detalhe}
      </p>
    </div>
  );
}

function Legenda() {
  return (
    <div className="mb-3 flex gap-4 text-xs font-semibold text-texto-suave">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-[var(--entrou)]" /> Entrou
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-[var(--saiu)]" /> Saiu
      </span>
    </div>
  );
}

/** Duas colunas por dia (entrou e saiu), mesma escala. Rola de lado no celular. */
function EntrouSaiu({ dias }: { dias: Dia[] }) {
  const max = Math.max(0, ...dias.map((d) => Math.max(d.entrou, d.saiu)));
  if (max === 0) return <SemDados texto="Nenhum movimento neste mês." />;
  const altura = 170;
  return (
    <>
      <Legenda />
      <div className="-mx-1 overflow-x-auto">
        <div className="flex min-w-full items-end gap-1 border-b border-borda px-1" style={{ height: altura + 8 }}>
          {dias.map((d) => (
            <div
              key={d.dia}
              className="group flex h-full min-w-[22px] flex-1 items-end justify-center gap-[2px] rounded-t-md hover:bg-superficie-2"
              title={`${dataBR(d.dia)}\nEntrou: ${brl(d.entrou)}\nSaiu: ${brl(d.saiu)}\nSaldo: ${brl(d.entrou - d.saiu)}`}
            >
              {[d.entrou, d.saiu].map((v, i) => (
                <div
                  key={i}
                  className="w-full max-w-3 rounded-t-[4px]"
                  style={{
                    height: v > 0 ? Math.max(2, (v / max) * altura) : 0,
                    background: i === 0 ? "var(--entrou)" : "var(--saiu)",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex min-w-full gap-1 px-1 pt-1">
          {dias.map((d, i) => (
            <span key={d.dia} className="min-w-[22px] flex-1 text-center text-[10px] text-texto-suave tabular-nums">
              {i % 5 === 0 || i === dias.length - 1 ? Number(d.dia.slice(8)) : ""}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

/** Linha do saldo acumulado com a área clarinha e a linha do zero. */
function SaldoAcumulado({ dias }: { dias: Dia[] }) {
  if (!dias.some((d) => d.entrou || d.saiu)) return <SemDados texto="Nenhum movimento neste mês." />;
  const L = 600;
  const A = 180;
  const valores = dias.map((d) => d.acumulado);
  const topo = Math.max(0, ...valores);
  const base = Math.min(0, ...valores);
  const faixa = topo - base || 1;
  const x = (i: number) => (dias.length === 1 ? L / 2 : (i / (dias.length - 1)) * L);
  const y = (v: number) => A - ((v - base) / faixa) * A;
  const linha = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${linha} L${x(valores.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const ultimo = valores[valores.length - 1];
  const cor = ultimo < 0 ? "var(--saiu)" : "var(--entrou)";

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-xs text-texto-suave">
        <span>Hoje / fim do mês</span>
        <strong className={`text-base tabular-nums ${ultimo < 0 ? "text-red-600 dark:text-red-400" : "text-texto"}`}>
          {brl(ultimo)}
        </strong>
      </div>
      <div className="relative" style={{ height: A }}>
        <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <line x1={0} x2={L} y1={y(0)} y2={y(0)} stroke="var(--borda-forte)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={area} fill={cor} opacity={0.1} />
          <path
            d={linha}
            fill="none"
            stroke={cor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Ponto no último dia, com anel da cor do fundo */}
        <span
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[var(--superficie)]"
          style={{ left: `${(x(valores.length - 1) / L) * 100}%`, top: `${(y(ultimo) / A) * 100}%`, background: cor }}
        />
        {/* Faixas invisíveis por dia, só pra dica ao passar o dedo/mouse */}
        <div className="absolute inset-0 flex">
          {dias.map((d) => (
            <div
              key={d.dia}
              className="h-full flex-1 hover:bg-texto/5"
              title={`${dataBR(d.dia)}\nAcumulado: ${brl(d.acumulado)}\nNo dia: ${brl(d.entrou - d.saiu)}`}
            />
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-texto-suave tabular-nums">
        <span>{dataBR(dias[0].dia).slice(0, 5)}</span>
        <span>{dataBR(dias[dias.length - 1].dia).slice(0, 5)}</span>
      </div>
    </div>
  );
}

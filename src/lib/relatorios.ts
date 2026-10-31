import {
  ROTULO_FORMA,
  custoVenda,
  diaDaVenda,
  pagoVenda,
  subtotalItens,
  totalVenda,
  vendaConta,
} from "./vendas";
import type { EstoqueMovimento, Produto, Venda } from "./types";

export interface Resumo {
  vendas: number;
  /** Total vendido (já sem desconto). */
  total: number;
  ticketMedio: number;
  descontos: number;
  /** Valor das vendas canceladas no período. */
  cancelados: number;
  qtdCancelados: number;
  custo: number;
  lucro: number;
  margem: number;
  unidades: number;
  /** Ficou a prazo (fiado) — vendido mas ainda não recebido. */
  aReceber: number;
}

export function noPeriodo(vendas: Venda[], de: string, ate: string): Venda[] {
  return vendas.filter((v) => {
    const d = diaDaVenda(v);
    return (!de || d >= de) && (!ate || d <= ate);
  });
}

export function resumir(vendasPeriodo: Venda[]): Resumo {
  const validas = vendasPeriodo.filter(vendaConta);
  const canceladas = vendasPeriodo.filter((v) => v.status === "CANCELADA" && v.finalizadaEm);
  const total = validas.reduce((s, v) => s + totalVenda(v), 0);
  const custo = validas.reduce((s, v) => s + custoVenda(v), 0);
  const lucro = total - custo;
  return {
    vendas: validas.length,
    total,
    ticketMedio: validas.length ? total / validas.length : 0,
    descontos: validas.reduce((s, v) => s + (v.desconto || 0), 0),
    cancelados: canceladas.reduce((s, v) => s + totalVenda(v), 0),
    qtdCancelados: canceladas.length,
    custo,
    lucro,
    margem: total > 0 ? (lucro / total) * 100 : 0,
    unidades: validas.reduce((s, v) => s + v.itens.reduce((t, i) => t + i.qtd, 0), 0),
    aReceber: validas.reduce((s, v) => s + Math.max(0, totalVenda(v) - pagoVenda(v)), 0),
  };
}

export interface Barra {
  chave: string;
  rotulo: string;
  valor: number;
  detalhe?: string;
}

/** Vendido por hora do dia (só horas com venda). */
export function porHora(vendasPeriodo: Venda[]): Barra[] {
  const mapa = new Map<number, number>();
  for (const v of vendasPeriodo.filter(vendaConta)) {
    const h = new Date(v.finalizadaEm!).getHours();
    mapa.set(h, (mapa.get(h) ?? 0) + totalVenda(v));
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a - b)
    .map(([h, valor]) => ({ chave: String(h), rotulo: `${h}h`, valor }));
}

/**
 * Como foi pago o que se vendeu no período. O que ficou sem pagar (comanda
 * a prazo) aparece como "A receber".
 */
export function porForma(vendasPeriodo: Venda[]): Barra[] {
  const mapa = new Map<string, number>();
  for (const v of vendasPeriodo.filter(vendaConta)) {
    let pago = 0;
    for (const p of v.pagamentos) {
      mapa.set(p.forma, (mapa.get(p.forma) ?? 0) + p.valor);
      pago += p.valor;
    }
    const falta = totalVenda(v) - pago;
    if (falta > 0.005) mapa.set("PRAZO", (mapa.get("PRAZO") ?? 0) + falta);
  }
  return [...mapa.entries()]
    .map(([forma, valor]) => ({
      chave: forma,
      rotulo: forma === "PRAZO" ? "A receber (fiado)" : ROTULO_FORMA[forma as keyof typeof ROTULO_FORMA],
      valor,
    }))
    .sort((a, b) => b.valor - a.valor);
}

/** Desconto rateado pelos itens, pra categoria/produto somarem o total vendido. */
function fatorDesconto(v: Venda): number {
  const sub = subtotalItens(v.itens);
  return sub > 0 ? totalVenda(v) / sub : 1;
}

export function porCategoria(vendasPeriodo: Venda[]): Barra[] {
  const mapa = new Map<string, number>();
  for (const v of vendasPeriodo.filter(vendaConta)) {
    const f = fatorDesconto(v);
    for (const i of v.itens) {
      const c = i.categoria || "Sem categoria";
      mapa.set(c, (mapa.get(c) ?? 0) + i.qtd * i.precoUn * f);
    }
  }
  return [...mapa.entries()]
    .map(([c, valor]) => ({ chave: c, rotulo: c, valor }))
    .sort((a, b) => b.valor - a.valor);
}

export interface ProdutoVendido {
  produtoId: string;
  nome: string;
  categoria: string;
  qtd: number;
  valor: number;
  custo: number;
}

export function produtosVendidos(vendasPeriodo: Venda[]): ProdutoVendido[] {
  const mapa = new Map<string, ProdutoVendido>();
  for (const v of vendasPeriodo.filter(vendaConta)) {
    const f = fatorDesconto(v);
    for (const i of v.itens) {
      const atual =
        mapa.get(i.produtoId) ??
        { produtoId: i.produtoId, nome: i.nome, categoria: i.categoria, qtd: 0, valor: 0, custo: 0 };
      atual.qtd += i.qtd;
      atual.valor += i.qtd * i.precoUn * f;
      atual.custo += i.qtd * (i.custoUn || 0);
      mapa.set(i.produtoId, atual);
    }
  }
  return [...mapa.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor);
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Total vendido nos últimos N meses (incluindo o atual), com a variação mês a mês. */
export function ultimosMeses(vendas: Venda[], n: number, hoje = new Date()): Barra[] {
  const barras: Barra[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - k, 1);
    const prefixo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const valor = vendas
      .filter((v) => vendaConta(v) && diaDaVenda(v).startsWith(prefixo))
      .reduce((s, v) => s + totalVenda(v), 0);
    barras.push({ chave: prefixo, rotulo: MESES[d.getMonth()], valor });
  }
  for (let i = 1; i < barras.length; i++) {
    const ant = barras[i - 1].valor;
    if (ant > 0) {
      const pct = ((barras[i].valor - ant) / ant) * 100;
      barras[i].detalhe = `${pct >= 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")}%`;
    }
  }
  return barras;
}

/** Período agrupado em linhas (dia, semana ou mês) — o relatório sintético. */
export type Agrupamento = "DIA" | "SEMANA" | "MES";

export interface LinhaSintetica extends Resumo {
  chave: string;
  rotulo: string;
}

function inicioSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  const dia = (dt.getDay() + 6) % 7; // segunda = 0
  dt.setDate(dt.getDate() - dia);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function sintetico(vendasPeriodo: Venda[], agrupamento: Agrupamento): LinhaSintetica[] {
  const grupos = new Map<string, Venda[]>();
  for (const v of vendasPeriodo) {
    const dia = diaDaVenda(v);
    const chave =
      agrupamento === "DIA" ? dia : agrupamento === "SEMANA" ? inicioSemana(dia) : dia.slice(0, 7);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(v);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([chave, lista]) => {
      let rotulo = chave;
      if (agrupamento === "DIA") {
        const [a, m, d] = chave.split("-").map(Number);
        rotulo = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} ${DIAS[new Date(a, m - 1, d).getDay()]}`;
      } else if (agrupamento === "SEMANA") {
        const [, m, d] = chave.split("-");
        rotulo = `Semana de ${d}/${m}`;
      } else {
        const [a, m] = chave.split("-");
        rotulo = `${MESES[Number(m) - 1]}/${a}`;
      }
      return { chave, rotulo, ...resumir(lista) };
    });
}

export interface MovimentoProduto {
  produtoId: string;
  nome: string;
  /** Entrou por compra (nota). */
  entrou: number;
  /** Saiu vendido (já descontando venda cancelada). */
  vendeu: number;
  perdas: number;
  /** Contagens: positivo = sobrou, negativo = faltou. */
  ajustes: number;
  /** Quanto gastou nas entradas do período. */
  valorComprado: number;
}

/**
 * Entradas e saídas de estoque de cada produto no período, a partir do
 * histórico. O estoque inicial da importação do sistema antigo fica de fora
 * (não é movimento da loja).
 */
export function entradasESaidas(movimentos: EstoqueMovimento[], de: string, ate: string): MovimentoProduto[] {
  const mapa = new Map<string, MovimentoProduto>();
  for (const m of movimentos) {
    const d = m.data.slice(0, 10);
    if ((de && d < de) || (ate && d > ate)) continue;
    if (m.origem === "AJUSTE" && (m.obs ?? "").startsWith("Estoque inicial")) continue;
    const linha =
      mapa.get(m.produtoId) ??
      { produtoId: m.produtoId, nome: m.produtoNome, entrou: 0, vendeu: 0, perdas: 0, ajustes: 0, valorComprado: 0 };
    const sinal = m.tipo === "SAIDA" ? -1 : 1;
    if (m.origem === "COMPRA") {
      linha.entrou += m.quantidadeUn;
      linha.valorComprado += (m.custoUn ?? 0) * m.quantidadeUn;
    } else if (m.origem === "VENDA") linha.vendeu += m.quantidadeUn;
    else if (m.origem === "ESTORNO") linha.vendeu -= m.quantidadeUn;
    else if (m.origem === "PERDA") linha.perdas += m.quantidadeUn;
    else if (m.origem === "AJUSTE") linha.ajustes += sinal * m.quantidadeUn;
    mapa.set(m.produtoId, linha);
  }
  return [...mapa.values()].sort((a, b) => b.vendeu - a.vendeu || b.entrou - a.entrou || a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface LinhaPerda {
  id: string;
  data: string;
  nome: string;
  qtd: number;
  /** Custo da perda (custo do dia, ou o custo atual nas perdas antigas). */
  custo: number;
  /** Quanto daria vendendo pelo preço atual. */
  venda: number;
  obs?: string;
}

/** Cada perda/quebra do período, com o prejuízo no custo e no preço de venda. */
export function perdasNoPeriodo(
  movimentos: EstoqueMovimento[],
  de: string,
  ate: string,
  produtoPorId: (id: string) => Produto | undefined,
): LinhaPerda[] {
  return movimentos
    .filter((m) => m.origem === "PERDA" && m.data.slice(0, 10) >= de && m.data.slice(0, 10) <= ate)
    .map((m) => {
      const p = produtoPorId(m.produtoId);
      return {
        id: m.id,
        data: m.data.slice(0, 10),
        nome: m.produtoNome,
        qtd: m.quantidadeUn,
        custo: m.quantidadeUn * (m.custoUn ?? p?.precoCusto ?? 0),
        venda: m.quantidadeUn * (p?.precoUn ?? 0),
        obs: m.obs,
      };
    })
    .sort((a, b) => b.data.localeCompare(a.data));
}

export interface LinhaCliente {
  chave: string;
  nome: string;
  compras: number;
  total: number;
  /** Ainda devendo dessas compras. */
  emAberto: number;
}

export function porCliente(vendasPeriodo: Venda[]): LinhaCliente[] {
  const mapa = new Map<string, LinhaCliente>();
  for (const v of vendasPeriodo.filter(vendaConta)) {
    const chave = v.clienteId ?? "__consumidor__";
    const linha = mapa.get(chave) ?? { chave, nome: v.clienteNome ?? "Consumidor final (balcão)", compras: 0, total: 0, emAberto: 0 };
    linha.compras++;
    linha.total += totalVenda(v);
    linha.emAberto += Math.max(0, totalVenda(v) - pagoVenda(v));
    mapa.set(chave, linha);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

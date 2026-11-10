import { CAIXA_DA_LOJA } from "./gastos";
import { normalizar, somarDias } from "./format";
import type { ContaPagar, FormaPagamento, Venda } from "./types";

/*
 * Importa a planilha "FECHAMENTO DE CAIXA" (a que a loja usava antes do
 * sistema) pro Fluxo de caixa:
 *  - aba de fechamento: cada dia vira uma entrada (venda finalizada de um
 *    item só) com o que foi apurado em crédito, débito, Pix e dinheiro;
 *  - aba de saída de dinheiro: cada linha vira um gasto pago em dinheiro
 *    pelo caixa da loja, com a categoria adivinhada pela descrição.
 * Os ids são fixos (dia / linha), então importar de novo substitui em vez
 * de duplicar.
 */

export interface DiaFechamento {
  dia: string; // YYYY-MM-DD
  sistema: number;
  formas: Record<FormaPagamento, number>;
  /** Forma zerada que dá pra completar com a diferença pro sistema (erro de fórmula). */
  sugestao?: { forma: FormaPagamento; valor: number };
}

export interface SaidaDinheiro {
  linha: number;
  dia: string;
  descricao: string;
  valor: number;
  categoria: string;
  /** A data estava em branco ou fora do período — foi corrigida. */
  diaAjustado?: boolean;
  /** O que estava digitado, quando havia data. */
  diaOriginal?: string;
}

export interface Fechamento {
  dias: DiaFechamento[];
  saidas: SaidaDinheiro[];
  /** Total da aba de saída (pra conferir com o que a planilha mostra). */
  avisos: string[];
}

export const ROTULO_FORMA_FECH: Record<FormaPagamento, string> = {
  CREDITO: "Crédito",
  DEBITO: "Débito",
  PIX: "Pix",
  DINHEIRO: "Dinheiro",
};

/* ---------------------------------------------------------------------------
   Leitura
   --------------------------------------------------------------------------- */

type CelulaBruta = unknown;

/** Valor de uma célula do exceljs: fórmula vira o resultado salvo. */
function valor(v: CelulaBruta): unknown {
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    if ("result" in o) return o.result;
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return o.text;
    return undefined;
  }
  return v;
}

function numero(v: CelulaBruta): number | null {
  const x = valor(v);
  if (typeof x === "number" && Number.isFinite(x)) return x;
  return null;
}

function texto(v: CelulaBruta): string {
  const x = valor(v);
  return typeof x === "string" ? x.trim() : typeof x === "number" ? String(x) : "";
}

/** Data do Excel (o exceljs entrega meia-noite UTC). Ano < 2000 = data digitada errada. */
function diaDe(v: CelulaBruta): string | null {
  const x = valor(v);
  if (!(x instanceof Date) || Number.isNaN(x.getTime()) || x.getUTCFullYear() < 2000) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getUTCFullYear()}-${p(x.getUTCMonth() + 1)}-${p(x.getUTCDate())}`;
}

const centavos = (n: number) => Math.round(n * 100) / 100;
const dataCurta = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const brlSimples = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

export async function lerPlanilhaFechamento(arquivo: File): Promise<Fechamento> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());

  const abaFech = wb.worksheets.find((w) => /fechamento|acerto/.test(normalizar(w.name))) ?? wb.worksheets[0];
  const abaSaida = wb.worksheets.find((w) => normalizar(w.name).includes("saida")) ?? wb.worksheets[1];
  if (!abaFech) throw new Error("Não achei a aba de fechamento de caixa.");

  const avisos: string[] = [];

  // ---- Fechamento diário: acha a linha do cabeçalho (DATA, VENDA SISTEMA, …)
  const dias: DiaFechamento[] = [];
  // Uma forma pode ter mais de uma coluna ("PIX" e "PIX CNPJ" somam no Pix).
  let colunas: Partial<Record<"sistema" | FormaPagamento, number[]>> | null = null;
  abaFech.eachRow((row) => {
    const celulas = row.values as CelulaBruta[];
    if (!colunas) {
      if (normalizar(texto(celulas[1])) !== "data") return;
      const achadas: Partial<Record<"sistema" | FormaPagamento, number[]>> = {};
      const marcar = (k: "sistema" | FormaPagamento, i: number) => (achadas[k] ??= []).push(i);
      celulas.forEach((c, i) => {
        const t = normalizar(texto(c));
        if (t.includes("sistema")) marcar("sistema", i);
        else if (t.startsWith("credito")) marcar("CREDITO", i);
        else if (t.startsWith("debito")) marcar("DEBITO", i);
        else if (t.startsWith("pix")) marcar("PIX", i);
        else if (t.startsWith("dinheiro")) marcar("DINHEIRO", i);
      });
      colunas = achadas;
      return;
    }
    const dia = diaDe(celulas[1]);
    if (!dia) return;
    const col: Partial<Record<"sistema" | FormaPagamento, number[]>> = colunas;
    const soma = (k: "sistema" | FormaPagamento) =>
      centavos((col[k] ?? []).reduce((s, i) => s + (numero(celulas[i]) ?? 0), 0));
    const formas = {
      CREDITO: soma("CREDITO"),
      DEBITO: soma("DEBITO"),
      PIX: soma("PIX"),
      DINHEIRO: soma("DINHEIRO"),
    } satisfies Record<FormaPagamento, number>;
    const sistema = soma("sistema");
    const apurado = Object.values(formas).reduce((s, v) => s + v, 0);
    const falta = centavos(sistema - apurado);
    const zeradas = (Object.keys(formas) as FormaPagamento[]).filter((f) => formas[f] === 0);
    dias.push({
      dia,
      sistema,
      formas,
      ...(falta > 50 && zeradas.length === 1 && { sugestao: { forma: zeradas[0], valor: falta } }),
    });
  });
  if (!colunas) throw new Error("Não achei o cabeçalho (DATA, VENDA SISTEMA, CRÉDITO…) na aba de fechamento.");

  // ---- Saídas de dinheiro: entre "PAGAMENTOS" e "TOTAL DE DESPESAS"
  const saidas: SaidaDinheiro[] = [];
  if (abaSaida) {
    let dentro = false;
    let ultimoDia = dias[0]?.dia ?? "";
    // Saída fora do período (± 7 dias) = data digitada errada (ex.: 19/06 no lugar de 19/09).
    const inicio = somarDias(dias[0]?.dia ?? "2000-01-01", -7);
    const fim = somarDias(dias[dias.length - 1]?.dia ?? "2100-01-01", 7);
    const noPeriodo = (d: string) => d >= inicio && d <= fim;
    /** Mesmo dia do mês, no mês da linha anterior ou no seguinte — o primeiro que fizer sentido. */
    const consertar = (errado: string) => {
      const diaMes = errado.slice(8, 10);
      const [a, m] = ultimoDia.split("-").map(Number);
      for (const mais of [0, 1]) {
        const dt = new Date(a, m - 1 + mais, 1);
        const cand = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${diaMes}`;
        const valida = new Date(`${cand}T12:00:00`).getDate() === Number(diaMes);
        if (valida && noPeriodo(cand) && cand >= ultimoDia) return cand;
      }
      return ultimoDia;
    };
    abaSaida.eachRow((row, n) => {
      const c = row.values as CelulaBruta[];
      const desc = texto(c[2]);
      const t = normalizar(desc);
      if (t.startsWith("sobra") && numero(c[3])) {
        avisos.push(`“${desc}” (${brlSimples(numero(c[3])!)}) não é importada — é dinheiro de um período anterior.`);
        return;
      }
      if (t === "pagamentos") {
        dentro = true;
        return;
      }
      if (!dentro) return;
      if (t.startsWith("total de despesas") || t === "saldo") {
        dentro = false;
        return;
      }
      const v = numero(c[3]);
      if (!desc || v === null || v <= 0) return;
      const lido = diaDe(c[1]);
      // As linhas vêm em ordem: data que volta mais de uma semana também é erro de digitação.
      const certo = lido && noPeriodo(lido) && lido >= somarDias(ultimoDia, -7) ? lido : null;
      const dia = certo ?? (lido ? consertar(lido) : ultimoDia);
      ultimoDia = dia;
      saidas.push({
        linha: n,
        dia,
        descricao: desc,
        valor: centavos(v),
        categoria: categoriaDaSaida(desc),
        ...(!certo && { diaAjustado: true, ...(lido && { diaOriginal: lido }) }),
      });
    });
  } else {
    avisos.push("A planilha não tem a aba de saída de dinheiro — só as entradas serão importadas.");
  }

  const ajustadas = saidas.filter((s) => s.diaAjustado);
  if (ajustadas.length) {
    avisos.push(
      `${ajustadas.length} saída(s) sem data ou com data fora do período foram corrigidas: ${ajustadas
        .map((s) => `“${s.descricao}” ${s.diaOriginal ? dataCurta(s.diaOriginal) : "sem data"} → ${dataCurta(s.dia)}`)
        .join("; ")}.`,
    );
  }

  return { dias, saidas, avisos };
}

/* ---------------------------------------------------------------------------
   Categoria pela descrição
   --------------------------------------------------------------------------- */

const REGRAS: [RegExp, string][] = [
  // Sangria pra depositar = dinheiro da gaveta indo pro banco, não pro sócio.
  [/sangria.*deposit|deposito/, "Depósito no banco"],
  [/sangria|retirada/, "Retirada de sócio"],
  [/investimento|cofre/, "Investimento"],
  [/material de limpeza|produto de limpeza/, "Limpeza"],
  [/carne|torresmo/, "Carnes"],
  [/gelo|gelito/, "Gelo"],
  [/carvao|bujao|\bgas\b/, "Carvão e gás"],
  [/descartav|palito/, "Descartáveis"],
  [/imposto|\bmei\b|taxa/, "Impostos e taxas"],
  [/\bnotas?\b|boleto|itaipava|unibeer|uniber|ambev|bebidas/, "Fornecedores"],
  [/parcela do carro|leitor/, "Patrimônio"],
  [/combustiv|oleo|olo motor|galao|amolac|manuten|mouse/, "Manutenção"],
  [/aluguel/, "Aluguel"],
  [
    /vale|pagamento|diaria|extra|supervis|seguranc|segiranc|limpeza|copeira|cozinha|auxiliar|atendente|uber|comanda|carroceito|feriado|kelly|fabiano|monique|raquel|suel+en|luiza|geovana|geraldo|\bmax\b|marcos|leticia|sasha|igor|lidi|alice|miguel|cristina|alenilce|wallace|ligiane/,
    "Funcionários",
  ],
  [/padaria|\bpao\b|mercado|farinha|mantimento|hortifrut|quentinha|salgado|doces|refrigerante|\bsal\b|pacocao|compra/, "Mantimentos"],
];

export function categoriaDaSaida(descricao: string): string {
  const t = normalizar(descricao);
  return REGRAS.find(([re]) => re.test(t))?.[1] ?? "Outros";
}

/* ---------------------------------------------------------------------------
   Montagem dos documentos
   --------------------------------------------------------------------------- */

const meioDia = (dia: string) => new Date(`${dia}T12:00:00`).toISOString();
const ORIGEM = "Importado da planilha de fechamento de caixa";

export function idEntrada(dia: string) {
  return `fechamento-${dia}`;
}

export function idSaida(dia: string, linha: number) {
  return `fechamento-saida-${dia}-${linha}`;
}

export function montarEntradas(
  dias: DiaFechamento[],
  usarSugestao: Set<string>,
  numeroDe: (id: string) => number,
  operador?: string,
): Venda[] {
  return dias.flatMap((d) => {
    const formas = { ...d.formas };
    if (d.sugestao && usarSugestao.has(d.dia)) formas[d.sugestao.forma] = d.sugestao.valor;
    const total = centavos(Object.values(formas).reduce((s, v) => s + v, 0));
    if (total <= 0) return [];
    const quando = meioDia(d.dia);
    const id = idEntrada(d.dia);
    const [a, m, dd] = d.dia.split("-");
    const venda: Venda = {
      id,
      numero: numeroDe(id),
      tipo: "BALCAO",
      status: "FINALIZADA",
      itens: [
        {
          produtoId: "entrada-manual",
          nome: `Fechamento de caixa ${dd}/${m}/${a}`,
          categoria: "Entrada manual",
          qtd: 1,
          precoUn: total,
          custoUn: 0,
        },
      ],
      desconto: 0,
      pagamentos: (Object.keys(formas) as FormaPagamento[])
        .filter((f) => formas[f] > 0)
        .map((f) => ({ id: `${id}-${f}`, forma: f, valor: formas[f], data: quando })),
      obs: `${ORIGEM}. Venda no sistema antigo: R$ ${d.sistema.toFixed(2).replace(".", ",")}${
        d.sugestao && usarSugestao.has(d.dia)
          ? `. ${ROTULO_FORMA_FECH[d.sugestao.forma]} completado com a diferença (estava zerado na planilha)`
          : ""
      }.`,
      operador,
      abertaEm: quando,
      finalizadaEm: quando,
      atualizadoEm: new Date().toISOString(),
    };
    return [venda];
  });
}

export function montarSaidas(saidas: SaidaDinheiro[], lancadoPor?: string): ContaPagar[] {
  const agora = new Date().toISOString();
  return saidas.map((s) => ({
    id: idSaida(s.dia, s.linha),
    descricao: s.descricao,
    valor: s.valor,
    vencimento: s.dia,
    pago: true,
    pagoEm: meioDia(s.dia),
    categoria: s.categoria,
    forma: "DINHEIRO",
    pagoPor: CAIXA_DA_LOJA,
    lancadoPor: lancadoPor ?? ORIGEM,
    obs: ORIGEM,
    criadoEm: agora,
  }));
}

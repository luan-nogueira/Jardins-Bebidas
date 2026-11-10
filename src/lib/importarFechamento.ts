import { CAIXA_DA_LOJA } from "./gastos";
import { normalizar } from "./format";
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
  /** A data estava em branco ou errada — usamos a da linha anterior. */
  diaAjustado?: boolean;
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

export async function lerPlanilhaFechamento(arquivo: File): Promise<Fechamento> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());

  const abaFech = wb.worksheets.find((w) => normalizar(w.name).includes("fechamento")) ?? wb.worksheets[0];
  const abaSaida = wb.worksheets.find((w) => normalizar(w.name).includes("saida")) ?? wb.worksheets[1];
  if (!abaFech) throw new Error("Não achei a aba de fechamento de caixa.");

  const avisos: string[] = [];

  // ---- Fechamento diário: acha a linha do cabeçalho (DATA, VENDA SISTEMA, …)
  const dias: DiaFechamento[] = [];
  let colunas: Partial<Record<"sistema" | FormaPagamento, number>> | null = null;
  abaFech.eachRow((row) => {
    const celulas = row.values as CelulaBruta[];
    if (!colunas) {
      if (normalizar(texto(celulas[1])) !== "data") return;
      colunas = {};
      celulas.forEach((c, i) => {
        const t = normalizar(texto(c));
        if (t.includes("sistema")) colunas!.sistema = i;
        else if (t.startsWith("credito")) colunas!.CREDITO = i;
        else if (t.startsWith("debito")) colunas!.DEBITO = i;
        else if (t.startsWith("pix")) colunas!.PIX = i;
        else if (t.startsWith("dinheiro")) colunas!.DINHEIRO = i;
      });
      return;
    }
    const dia = diaDe(celulas[1]);
    if (!dia) return;
    const col = colunas;
    const formas = {
      CREDITO: centavos(numero(celulas[col.CREDITO ?? -1]) ?? 0),
      DEBITO: centavos(numero(celulas[col.DEBITO ?? -1]) ?? 0),
      PIX: centavos(numero(celulas[col.PIX ?? -1]) ?? 0),
      DINHEIRO: centavos(numero(celulas[col.DINHEIRO ?? -1]) ?? 0),
    } satisfies Record<FormaPagamento, number>;
    const sistema = centavos(numero(celulas[col.sistema ?? -1]) ?? 0);
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
    abaSaida.eachRow((row, n) => {
      const c = row.values as CelulaBruta[];
      const desc = texto(c[2]);
      const t = normalizar(desc);
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
      const dia = diaDe(c[1]);
      if (dia) ultimoDia = dia;
      saidas.push({
        linha: n,
        dia: dia ?? ultimoDia,
        descricao: desc,
        valor: centavos(v),
        categoria: categoriaDaSaida(desc),
        ...(!dia && { diaAjustado: true }),
      });
    });
  } else {
    avisos.push("A planilha não tem a aba de saída de dinheiro — só as entradas serão importadas.");
  }

  const ajustadas = saidas.filter((s) => s.diaAjustado);
  if (ajustadas.length) {
    avisos.push(
      `${ajustadas.length} saída(s) sem data ou com data errada ficaram no dia da linha anterior: ${ajustadas
        .map((s) => `“${s.descricao}”`)
        .join(", ")}.`,
    );
  }

  return { dias, saidas, avisos };
}

/* ---------------------------------------------------------------------------
   Categoria pela descrição
   --------------------------------------------------------------------------- */

const REGRAS: [RegExp, string][] = [
  [/sangria|retirada/, "Retirada de sócio"],
  [/gelo|gelito/, "Gelo"],
  [/carvao|bujao|\bgas\b/, "Carvão e gás"],
  [/descartav|palito/, "Descartáveis"],
  [/imposto|\bmei\b|taxa/, "Impostos e taxas"],
  [/nota |boleto|itaipava|unibeer|ambev/, "Fornecedores"],
  [/parcela do carro/, "Patrimônio"],
  [/combustiv|oleo|olo motor|galao|amolac|manuten|mouse/, "Manutenção"],
  [/aluguel/, "Aluguel"],
  [
    /vale|pagamento|diaria|extra|supervis|seguranc|limpeza|copeira|cozinha|auxiliar|atendente|uber|comanda|carroceito|feriado|kelly|fabiano|monique|raquel|suel+en|luiza|geovana|geraldo|\bmax\b|marcos|leticia|sasha|igor|lidi|alice|miguel|cristina|alenilce/,
    "Funcionários",
  ],
  [/padaria|mercado|farinha|mantimento|hortifrut|quentinha|salgado|doces|refrigerante|\bsal\b|pacocao|compra/, "Mantimentos"],
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

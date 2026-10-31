import {
  Beef,
  Fuel,
  HandCoins,
  Home,
  Landmark,
  Lightbulb,
  Package,
  PackageOpen,
  PiggyBank,
  Receipt,
  ShoppingBasket,
  Snowflake,
  Sparkles,
  Truck,
  Users,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseConfigurado, getDb } from "./firebase";
import { FORMAS, ROTULO_FORMA, diaLocal } from "./vendas";
import type { ContaPagar, EstoqueMovimento, FormaPagamento, Venda } from "./types";

/**
 * Gastos do dia a dia — o que o sócio antes jogava no grupo do WhatsApp
 * ("1000 mantimentos", "100 de carne no pix") pra passar pro Excel no fim
 * do mês. Ficam em contasPagar já pagos, então entram sozinhos no fluxo de
 * caixa do Financeiro.
 *
 * Mercadoria pra revenda NÃO entra aqui: vai por Entradas, que dá entrada
 * no estoque. A prestação de contas soma as duas coisas.
 */
export const CATEGORIAS_GASTO: { nome: string; Icone: LucideIcon; sugestoes?: string[] }[] = [
  { nome: "Fornecedores", Icone: Truck },
  { nome: "Mantimentos", Icone: ShoppingBasket },
  { nome: "Carnes", Icone: Beef },
  { nome: "Gelo", Icone: Snowflake },
  { nome: "Carvão e gás", Icone: Fuel },
  { nome: "Descartáveis", Icone: PackageOpen },
  { nome: "Limpeza", Icone: Sparkles },
  { nome: "Funcionários", Icone: Users },
  { nome: "Aluguel", Icone: Home },
  { nome: "Luz e água", Icone: Lightbulb },
  { nome: "Internet e telefone", Icone: Wifi },
  { nome: "Manutenção", Icone: Wrench },
  { nome: "Impostos e taxas", Icone: Receipt },
  { nome: "Retirada de sócio", Icone: HandCoins },
  { nome: "Patrimônio", Icone: Landmark, sugestoes: ["Carro", "Caixas vazias", "Cobertura", "TV", "Toldo"] },
  { nome: "Investimento", Icone: PiggyBank, sugestoes: ["Consórcio"] },
  { nome: "Outros", Icone: Package },
];

export const CATEGORIA_FORNECEDOR = "Fornecedores";

/**
 * Empresas que o Nilo paga por boleto. Aparecem na escolha mesmo antes de
 * existirem no cadastro; ao lançar o primeiro gasto, viram fornecedor.
 */
export const FORNECEDORES_BOLETO = [
  "Ambev",
  "Uniber",
  "Coca Cola",
  "Nossa Senhora",
  "CDY",
  "3F Distribuidora",
  "CESCOM",
  "MIB",
  "Uniaves",
  "Império",
  "Empresa Brasileira",
  "C S Carvalho",
];

export type FormaGasto = FormaPagamento | "BOLETO";
export const FORMAS_GASTO: FormaGasto[] = [...FORMAS, "BOLETO"];
export const ROTULO_FORMA_GASTO: Record<FormaGasto, string> = { ...ROTULO_FORMA, BOLETO: "Boleto" };

export const CAIXA_DA_LOJA = "Caixa da loja";

/** Pago do bolso e o caixa ainda não devolveu (todos os meses). */
export function aAcertar(contas: ContaPagar[]): ContaPagar[] {
  return contas
    .filter((c) => c.pago && c.pagoPor && c.pagoPor !== CAIXA_DA_LOJA && !c.acertadoEm)
    .sort((a, b) => diaSaida(b).localeCompare(diaSaida(a)));
}

/** Barra do gráfico/Excel: cada fornecedor separado, o resto pela categoria. */
export function grupoSaida(s: Pick<Saida, "categoria" | "fornecedor">): string {
  return s.fornecedor ?? s.categoria;
}

/** Categoria das compras de mercadoria à vista (Entradas) na prestação de contas. */
export const CATEGORIA_MERCADORIA = "Mercadoria (Entradas)";

export function iconeGasto(categoria: string): LucideIcon {
  return CATEGORIAS_GASTO.find((c) => c.nome === categoria)?.Icone ?? Package;
}

/** Lançamento feito pela tela Gastos (e não uma conta a pagar de fornecedor). */
export function ehGasto(c: ContaPagar): boolean {
  return !!c.categoria;
}

/** Dia em que o dinheiro saiu. */
export function diaSaida(c: ContaPagar): string {
  return c.pagoEm ? diaLocal(c.pagoEm) : c.vencimento;
}

export interface Saida {
  id: string;
  dia: string;
  descricao: string;
  categoria: string;
  /** Só em gasto da categoria Fornecedores. */
  fornecedor?: string;
  valor: number;
  forma: string;
  pagoPor: string;
  lancadoPor: string;
  /** Gasto lançado aqui (dá pra editar) ou vindo de outra tela. */
  origem: "GASTO" | "CONTA" | "COMPRA";
  conta?: ContaPagar;
}

/**
 * Tudo que saiu no mês: gastos, contas a pagar quitadas e compras de
 * mercadoria pagas à vista (que não viram conta a pagar).
 */
export function saidasDoMes(
  mes: string,
  contas: ContaPagar[],
  movimentos: EstoqueMovimento[],
): Saida[] {
  const doMes = (dia: string) => dia.startsWith(mes);
  const saidas: Saida[] = [];

  for (const c of contas) {
    if (!c.pago) continue;
    const dia = diaSaida(c);
    if (!doMes(dia)) continue;
    saidas.push({
      id: c.id,
      dia,
      descricao: c.descricao,
      categoria: c.categoria ?? (c.compraId ? CATEGORIA_MERCADORIA : "Contas a pagar"),
      fornecedor: c.categoria === CATEGORIA_FORNECEDOR ? c.fornecedorNome : undefined,
      valor: c.valor,
      forma: c.forma ? ROTULO_FORMA_GASTO[c.forma] : "",
      pagoPor: c.pagoPor ?? CAIXA_DA_LOJA,
      lancadoPor: c.lancadoPor ?? "",
      origem: ehGasto(c) ? "GASTO" : "CONTA",
      conta: c,
    });
  }

  // Compras à vista: um lançamento por nota (referenciaId), somando os itens.
  const notas = new Map<string, Saida>();
  for (const m of movimentos) {
    // A prazo já está nas contas (quando paga); lançamentos antigos a prazo
    // não tinham `pagamento`, só a conta ligada.
    const aPrazo = m.pagamento === "PRAZO" || !!m.contaPagarId || !!m.contaPagarIds?.length;
    if (m.origem !== "COMPRA" || aPrazo || !doMes(m.data)) continue;
    const valor = m.quantidadeUn * (m.custoUn ?? 0);
    if (valor <= 0) continue;
    const chave = m.referenciaId ?? m.id;
    const atual = notas.get(chave);
    if (atual) {
      atual.valor += valor;
      continue;
    }
    notas.set(chave, {
      id: `compra-${chave}`,
      dia: m.data,
      descricao: m.nota ? `Nota ${m.nota}` : `Compra: ${m.produtoNome}`,
      categoria: CATEGORIA_MERCADORIA,
      valor,
      forma: "À vista",
      pagoPor: CAIXA_DA_LOJA,
      lancadoPor: "",
      origem: "COMPRA",
    });
  }
  saidas.push(...notas.values());

  return saidas.sort((a, b) => b.dia.localeCompare(a.dia) || b.valor - a.valor);
}

/** Tudo que entrou no caixa no mês (pagamentos de vendas não canceladas). */
export function entradasDoMes(mes: string, vendas: Venda[]) {
  return vendas
    .filter((v) => v.status !== "CANCELADA")
    .flatMap((v) => v.pagamentos.map((p) => ({ ...p, dia: diaLocal(p.data) })))
    .filter((p) => p.dia.startsWith(mes));
}

/**
 * Reduz a foto da nota (câmera do celular = 3–5 MB) pra ~1000px em JPEG,
 * uns 100 KB — cabe no documento do Firestore (limite de 1 MB) sem
 * precisar de serviço de imagem.
 */
export async function comprimirFoto(arquivo: File, lado = 1000, qualidade = 0.6): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("Não deu pra abrir a foto."));
      i.src = url;
    });
    const escala = Math.min(1, lado / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", qualidade);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/*
 * Fotos das notas: um documento por gasto em comprovantes/{id}, lido só
 * quando alguém toca pra ver. Sem Firebase (demonstração), no navegador.
 */
const chaveLocal = (id: string) => `jardins:comprovante:${id}`;

export async function salvarComprovante(id: string, imagem: string) {
  if (!firebaseConfigurado) {
    localStorage.setItem(chaveLocal(id), imagem);
    return;
  }
  await setDoc(doc(getDb(), "comprovantes", id), { imagem });
}

export async function lerComprovante(id: string): Promise<string | null> {
  if (!firebaseConfigurado) return localStorage.getItem(chaveLocal(id));
  const snap = await getDoc(doc(getDb(), "comprovantes", id));
  return snap.exists() ? (snap.data().imagem as string) : null;
}

export async function apagarComprovante(id: string) {
  if (!firebaseConfigurado) {
    localStorage.removeItem(chaveLocal(id));
    return;
  }
  await deleteDoc(doc(getDb(), "comprovantes", id));
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "2026-10" → "Outubro de 2026" */
export function nomeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${NOMES_MES[m - 1]} de ${a}`;
}

/**
 * Planilha da prestação de contas do mês — o Excel que o sócio montava à
 * mão: resumo (entrou, saiu, saldo, por categoria e por quem pagou) e a
 * lista de cada saída.
 */
export async function exportarPrestacaoContas(
  mes: string,
  saidas: Saida[],
  entradas: ReturnType<typeof entradasDoMes>,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Jardins Bebidas";
  wb.created = new Date();

  const moeda = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const laranja = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3510F" } } as const;
  const cinza = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6EEE5" } } as const;
  const titulo = (ws: import("exceljs").Worksheet, texto: string) => {
    ws.mergeCells("A1:D1");
    const c = ws.getCell("A1");
    c.value = texto;
    c.font = { bold: true, size: 14, color: { argb: "FF4A230F" } };
  };
  const cabecalho = (row: import("exceljs").Row) => {
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = laranja;
    });
  };

  const totalEntrou = entradas.reduce((s, e) => s + e.valor, 0);
  const totalSaiu = saidas.reduce((s, e) => s + e.valor, 0);

  // --- Resumo ---------------------------------------------------------------
  const r = wb.addWorksheet("Resumo");
  r.columns = [{ width: 34 }, { width: 18 }, { width: 14 }, { width: 14 }];
  titulo(r, `Prestação de contas — ${nomeMes(mes)}`);
  r.addRow([]);
  const linhasTotais: [string, number][] = [
    ["Entrou (vendas recebidas)", totalEntrou],
    ["Saiu (gastos, contas e compras)", totalSaiu],
    ["Saldo do mês", totalEntrou - totalSaiu],
  ];
  for (const [rotulo, valor] of linhasTotais) {
    const row = r.addRow([rotulo, valor]);
    row.getCell(1).font = { bold: true };
    row.getCell(2).numFmt = moeda;
    row.getCell(2).font = { bold: true };
  }

  const bloco = (tituloBloco: string, mapa: Map<string, number>, base: number) => {
    r.addRow([]);
    cabecalho(r.addRow([tituloBloco, "Valor", "% do total"]));
    for (const [nome, valor] of [...mapa.entries()].sort((a, b) => b[1] - a[1])) {
      const row = r.addRow([nome, valor, base ? valor / base : 0]);
      row.getCell(2).numFmt = moeda;
      row.getCell(3).numFmt = "0.0%";
    }
  };

  const porCategoria = new Map<string, number>();
  const porPagador = new Map<string, number>();
  for (const s of saidas) {
    porCategoria.set(grupoSaida(s), (porCategoria.get(grupoSaida(s)) ?? 0) + s.valor);
    porPagador.set(s.pagoPor, (porPagador.get(s.pagoPor) ?? 0) + s.valor);
  }
  bloco("Saídas por categoria", porCategoria, totalSaiu);
  bloco("Quem pagou", porPagador, totalSaiu);

  const porForma = new Map<string, number>();
  for (const e of entradas) {
    const rotulo = ROTULO_FORMA[e.forma];
    porForma.set(rotulo, (porForma.get(rotulo) ?? 0) + e.valor);
  }
  bloco("Entradas por forma de pagamento", porForma, totalEntrou);

  // --- Saídas, uma por linha -----------------------------------------------
  const s = wb.addWorksheet("Saídas", { views: [{ state: "frozen", ySplit: 1 }] });
  s.columns = [
    { header: "Data", key: "dia", width: 12 },
    { header: "Categoria", key: "categoria", width: 22 },
    { header: "Fornecedor", key: "fornecedor", width: 20 },
    { header: "Descrição", key: "descricao", width: 36 },
    { header: "Forma", key: "forma", width: 12 },
    { header: "Quem pagou", key: "pagoPor", width: 18 },
    { header: "Lançado por", key: "lancadoPor", width: 24 },
    { header: "Valor", key: "valor", width: 14 },
  ];
  cabecalho(s.getRow(1));
  for (const x of [...saidas].sort((a, b) => a.dia.localeCompare(b.dia))) {
    const [a, m, d] = x.dia.split("-");
    const row = s.addRow({ ...x, dia: `${d}/${m}/${a}` });
    row.getCell("valor").numFmt = moeda;
  }
  const total = s.addRow({ descricao: "TOTAL", valor: totalSaiu });
  total.font = { bold: true };
  total.getCell("valor").numFmt = moeda;
  total.eachCell((c) => (c.fill = cinza));

  // --- Entradas por dia -----------------------------------------------------
  const e = wb.addWorksheet("Entradas por dia", { views: [{ state: "frozen", ySplit: 1 }] });
  e.columns = [
    { header: "Data", key: "dia", width: 12 },
    ...Object.values(ROTULO_FORMA).map((f) => ({ header: f, key: f, width: 14 })),
    { header: "Total", key: "total", width: 14 },
  ];
  cabecalho(e.getRow(1));
  const dias = new Map<string, Record<string, number>>();
  for (const x of entradas) {
    const linha = dias.get(x.dia) ?? {};
    const f = ROTULO_FORMA[x.forma];
    linha[f] = (linha[f] ?? 0) + x.valor;
    linha.total = (linha.total ?? 0) + x.valor;
    dias.set(x.dia, linha);
  }
  for (const [dia, valores] of [...dias.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [a, m, d] = dia.split("-");
    const row = e.addRow({ dia: `${d}/${m}/${a}`, ...valores });
    row.eachCell((c, n) => n > 1 && (c.numFmt = moeda));
  }

  const blob = new Blob([await wb.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Prestação de contas ${nomeMes(mes)} - Jardins Bebidas.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

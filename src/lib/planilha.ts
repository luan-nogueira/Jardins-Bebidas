import type { Produto } from "./types";
import { normalizar } from "./format";

/*
 * Planilha de produtos (.xlsx) — o jeito fácil de revisar e editar o
 * catálogo inteiro no Excel e subir de volta. A mesma estrutura serve pra
 * exportar e importar; a coluna "ID" (escondida) liga cada linha ao produto
 * do sistema, e sem ela a linha casa pelo código ou pelo nome.
 *
 * O ExcelJS é carregado só quando alguém exporta/importa (import dinâmico),
 * pra não pesar a abertura do sistema.
 */

export const ABA_PRODUTOS = "Produtos";

/** Colunas na ordem da planilha. `editavel` = célula com fundo de entrada. */
const COLUNAS = [
  { chave: "codigo", titulo: "Código", largura: 10, editavel: true },
  { chave: "codigoBarras", titulo: "Código de barras", largura: 17, editavel: true },
  { chave: "nome", titulo: "Produto", largura: 46, editavel: true },
  { chave: "categoria", titulo: "Categoria", largura: 22, editavel: true },
  { chave: "precoUn", titulo: "Preço de venda (R$)", largura: 15, editavel: true },
  { chave: "precoRetirada", titulo: "Preço retirada (R$)", largura: 15, editavel: true },
  { chave: "precoCusto", titulo: "Preço de custo (R$)", largura: 15, editavel: true },
  { chave: "margem", titulo: "Margem", largura: 10, editavel: false },
  { chave: "estoqueUn", titulo: "Estoque atual", largura: 12, editavel: true },
  { chave: "estoqueMinimo", titulo: "Estoque mínimo", largura: 12, editavel: true },
  { chave: "unPorCaixa", titulo: "Un. por caixa", largura: 11, editavel: true },
  { chave: "controla", titulo: "Controla estoque", largura: 13, editavel: true },
  { chave: "ativo", titulo: "Ativo", largura: 8, editavel: true },
  { chave: "id", titulo: "ID", largura: 12, editavel: false },
] as const;

type Chave = (typeof COLUNAS)[number]["chave"];
const letra = (chave: Chave) => String.fromCharCode(65 + COLUNAS.findIndex((c) => c.chave === chave));

const MARROM = "FF4A230F";
const CREME = "FFFDEBD3";
const ENTRADA = "FFFFF8EC";
const CINZA = "FFF2F2F2";
const FONTE = "Arial";

export interface LinhaPlanilha {
  linha: number;
  id?: string;
  codigo?: string;
  codigoBarras?: string;
  nome: string;
  categoria: string;
  precoUn: number;
  /** undefined = planilha antiga, sem a coluna (não mexe); 0 = em branco (tira). */
  precoRetirada?: number;
  precoCusto: number;
  estoqueUn: number;
  estoqueMinimo: number;
  unPorCaixa: number;
  semEstoque: boolean;
  ativo: boolean;
}

/** Gera o .xlsx com os produtos e baixa no navegador. */
export async function exportarPlanilha(produtos: Produto[], categoriasExtras: string[] = []) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Jardins Bebidas";
  wb.created = new Date();
  // Sem valores calculados no arquivo: o Excel refaz as fórmulas ao abrir.
  wb.calcProperties.fullCalcOnLoad = true;

  const categorias = [...new Set([...produtos.map((p) => p.categoria || "Sem categoria"), ...categoriasExtras])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  // --- Aba Produtos -------------------------------------------------------
  const ws = wb.addWorksheet(ABA_PRODUTOS, {
    views: [{ state: "frozen", xSplit: 3, ySplit: 1, zoomScale: 110 }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = COLUNAS.map((c) => ({ key: c.chave, width: c.largura }));

  const cabecalho = ws.getRow(1);
  COLUNAS.forEach((c, i) => {
    const cel = cabecalho.getCell(i + 1);
    cel.value = c.titulo;
    cel.font = { name: FONTE, bold: true, color: { argb: CREME }, size: 10 };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARROM } };
    cel.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  cabecalho.height = 30;

  const ordenados = [...produtos].sort(
    (a, b) =>
      (a.categoria || "").localeCompare(b.categoria || "", "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"),
  );

  ordenados.forEach((p, i) => {
    const r = i + 2;
    const row = ws.getRow(r);
    row.getCell(letra("codigo")).value = p.codigo ?? "";
    row.getCell(letra("codigoBarras")).value = p.codigoBarras ?? "";
    row.getCell(letra("nome")).value = p.nome;
    row.getCell(letra("categoria")).value = p.categoria || "Sem categoria";
    row.getCell(letra("precoUn")).value = p.precoUn || 0;
    row.getCell(letra("precoRetirada")).value = p.precoRetirada ?? null;
    row.getCell(letra("precoCusto")).value = p.precoCusto || 0;
    const v = `${letra("precoUn")}${r}`;
    const c = `${letra("precoCusto")}${r}`;
    row.getCell(letra("margem")).value = { formula: `IF(AND(${v}>0,${c}>0),(${v}-${c})/${v},"")` };
    row.getCell(letra("estoqueUn")).value = p.semEstoque ? null : p.estoqueUn;
    row.getCell(letra("estoqueMinimo")).value = p.estoqueMinimo || 0;
    row.getCell(letra("unPorCaixa")).value = p.unPorCaixa || 1;
    row.getCell(letra("controla")).value = p.semEstoque ? "Não" : "Sim";
    row.getCell(letra("ativo")).value = p.ativo ? "Sim" : "Não";
    row.getCell(letra("id")).value = p.id;
  });

  const ultima = Math.max(2, ordenados.length + 1);
  const linhasVazias = 200; // espaço pra cadastrar produto novo direto na planilha
  const fim = ultima + linhasVazias;

  for (let r = 2; r <= fim; r++) {
    const row = ws.getRow(r);
    COLUNAS.forEach((col, i) => {
      const cel = row.getCell(i + 1);
      cel.font = { name: FONTE, size: 10, color: { argb: col.editavel ? "FF000000" : "FF666666" } };
      if (col.editavel) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ENTRADA } };
      else cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
      cel.border = { bottom: { style: "hair", color: { argb: "FFE0D4C6" } } };
    });
    row.getCell(letra("precoUn")).numFmt = '"R$" #,##0.00';
    row.getCell(letra("precoRetirada")).numFmt = '"R$" #,##0.00';
    row.getCell(letra("precoCusto")).numFmt = '"R$" #,##0.00';
    row.getCell(letra("margem")).numFmt = "0.0%";
    row.getCell(letra("codigo")).numFmt = "@";
    row.getCell(letra("codigoBarras")).numFmt = "@";
    if (r > ultima) {
      const v = `${letra("precoUn")}${r}`;
      const c = `${letra("precoCusto")}${r}`;
      row.getCell(letra("margem")).value = { formula: `IF(AND(${v}>0,${c}>0),(${v}-${c})/${v},"")` };
    }
  }

  // Listas de escolha (Categoria, Sim/Não) e números válidos.
  const faixa = (chave: Chave) => `${letra(chave)}2:${letra(chave)}${fim}`;
  const dv = (ws as unknown as { dataValidations: { add: (ref: string, v: object) => void } }).dataValidations;
  dv.add(faixa("categoria"), {
    type: "list",
    allowBlank: false,
    formulae: [`Categorias!$A$2:$A$${categorias.length + 51}`],
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: "Categoria nova?",
    error: "Essa categoria não está na aba Categorias. Pode seguir — ela será criada ao importar.",
  });
  for (const chave of ["controla", "ativo"] as const) {
    dv.add(faixa(chave), {
      type: "list",
      allowBlank: true,
      formulae: ['"Sim,Não"'],
      showErrorMessage: true,
      errorTitle: "Use Sim ou Não",
      error: "Escolha Sim ou Não na lista.",
    });
  }
  for (const chave of ["precoUn", "precoRetirada", "precoCusto"] as const) {
    dv.add(faixa(chave), {
      type: "decimal",
      operator: "greaterThanOrEqual",
      formulae: [0],
      showErrorMessage: true,
      errorTitle: "Valor inválido",
      error: "Digite um valor em reais (ex.: 12,50).",
    });
  }
  ws.autoFilter = { from: "A1", to: `${letra("id")}1` };
  ws.getColumn(letra("id")).hidden = true;

  // --- Aba Categorias -----------------------------------------------------
  const wc = wb.addWorksheet("Categorias");
  wc.columns = [{ width: 30 }, { width: 14 }];
  wc.getCell("A1").value = "Categoria";
  wc.getCell("B1").value = "Produtos";
  for (const ref of ["A1", "B1"]) {
    wc.getCell(ref).font = { name: FONTE, bold: true, color: { argb: CREME } };
    wc.getCell(ref).fill = { type: "pattern", pattern: "solid", fgColor: { argb: MARROM } };
  }
  categorias.forEach((cat, i) => {
    wc.getCell(`A${i + 2}`).value = cat;
    wc.getCell(`A${i + 2}`).font = { name: FONTE };
    wc.getCell(`B${i + 2}`).value = {
      formula: `COUNTIF(${ABA_PRODUTOS}!$${letra("categoria")}:$${letra("categoria")},A${i + 2})`,
    };
    wc.getCell(`B${i + 2}`).font = { name: FONTE };
  });
  wc.getCell(`A${categorias.length + 3}`).value =
    "Pra criar uma categoria, escreva o nome numa linha vazia acima do texto (ou direto na coluna Categoria dos produtos).";
  wc.getCell(`A${categorias.length + 3}`).font = { name: FONTE, italic: true, size: 9, color: { argb: "FF666666" } };

  // --- Aba Como usar ------------------------------------------------------
  const wi = wb.addWorksheet("Como usar");
  wi.getColumn(1).width = 110;
  const instrucoes = [
    ["Planilha de produtos — Jardins Bebidas", true],
    ["", false],
    ["1. Edite na aba Produtos as células claras (creme). As cinzas são calculadas pelo sistema.", false],
    ["2. Categoria, Controla estoque e Ativo têm lista: clique na célula e escolha na setinha.", false],
    ["3. Produto novo: preencha uma linha vazia no fim da lista (Produto, Categoria e Preço de venda bastam).", false],
    ["4. Preços em reais (12,50). Margem = (venda − custo) ÷ venda, calculada sozinha.", false],
    ["5. Estoque atual: se mudar, o sistema lança um Ajuste no histórico do produto.", false],
    ["6. Controla estoque = Não pra porção, dose, couvert e serviços (vende, mas não baixa estoque).", false],
    ["7. Não apague linhas pra excluir produto — marque Ativo = Não (ele some das vendas e mantém o histórico).", false],
    ["8. No sistema: Produtos → Planilha → Importar planilha. Ele mostra o que vai mudar antes de gravar.", false],
    ["", false],
    ["Exemplo de linha preenchida:", true],
    ["Código 35 · Produto: Amstel 600ml · Categoria: Cerveja · Venda R$ 12,00 · Custo R$ 7,50 · Estoque 48 · Mínimo 24 · Un/cx 12 · Controla: Sim · Ativo: Sim", false],
    ["", false],
    [`Gerada em ${new Date().toLocaleString("pt-BR")}`, false],
  ] as const;
  instrucoes.forEach(([texto, negrito], i) => {
    const cel = wi.getCell(`A${i + 1}`);
    cel.value = texto;
    cel.font = { name: FONTE, bold: negrito, size: i === 0 ? 14 : 11, color: { argb: i === 0 ? MARROM : "FF000000" } };
    cel.alignment = { wrapText: true, vertical: "top" };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const hoje = new Date();
  const dd = (n: number) => String(n).padStart(2, "0");
  a.href = url;
  a.download = `Produtos Jardins Bebidas ${dd(hoje.getDate())}-${dd(hoje.getMonth() + 1)}-${hoje.getFullYear()}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Texto de uma célula do ExcelJS (número, texto rico, fórmula…). */
function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "object") {
    const v = valor as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return texto(v.result);
    return "";
  }
  return String(valor).trim();
}

function numero(valor: unknown): number {
  if (typeof valor === "number") return valor;
  const s = texto(valor).replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
}

const simNao = (valor: unknown, padrao: boolean) => {
  const t = normalizar(texto(valor));
  if (!t) return padrao;
  return t.startsWith("s") || t === "1" || t === "true";
};

/** Lê o .xlsx e devolve as linhas da aba Produtos (pelos títulos das colunas). */
export async function lerPlanilha(arquivo: File): Promise<{ linhas: LinhaPlanilha[]; avisos: string[] }> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  const ws = wb.getWorksheet(ABA_PRODUTOS) ?? wb.worksheets[0];
  if (!ws) return { linhas: [], avisos: ["A planilha está vazia."] };

  // Acha cada coluna pelo título (assim reordenar colunas no Excel não quebra).
  const posicao = new Map<Chave, number>();
  ws.getRow(1).eachCell((cel, col) => {
    const t = normalizar(texto(cel.value));
    const c = COLUNAS.find((x) => normalizar(x.titulo) === t);
    if (c) posicao.set(c.chave, col);
  });
  const avisos: string[] = [];
  if (!posicao.has("nome")) {
    return { linhas: [], avisos: ['Não achei a coluna "Produto" na primeira linha. Use a planilha exportada pelo sistema.'] };
  }

  const linhas: LinhaPlanilha[] = [];
  ws.eachRow((row, r) => {
    if (r === 1) return;
    const pega = (chave: Chave) => (posicao.has(chave) ? row.getCell(posicao.get(chave)!).value : undefined);
    const nome = texto(pega("nome"));
    if (!nome) return;
    const preco = numero(pega("precoUn"));
    if (preco <= 0) avisos.push(`Linha ${r} (${nome}): sem preço de venda.`);
    linhas.push({
      linha: r,
      id: texto(pega("id")) || undefined,
      codigo: texto(pega("codigo")) || undefined,
      codigoBarras: texto(pega("codigoBarras")) || undefined,
      nome,
      categoria: texto(pega("categoria")) || "Sem categoria",
      precoUn: preco,
      precoRetirada: posicao.has("precoRetirada") ? numero(pega("precoRetirada")) : undefined,
      precoCusto: numero(pega("precoCusto")),
      estoqueUn: numero(pega("estoqueUn")),
      estoqueMinimo: Math.max(0, Math.round(numero(pega("estoqueMinimo")))),
      unPorCaixa: Math.max(1, Math.round(numero(pega("unPorCaixa")) || 1)),
      semEstoque: !simNao(pega("controla"), true),
      ativo: simNao(pega("ativo"), true),
    });
  });
  return { linhas, avisos };
}

export interface Alteracao {
  linha: LinhaPlanilha;
  produto?: Produto;
  /** Campos que mudam, já em texto pra mostrar ("Preço: R$ 10 → R$ 12"). */
  mudancas: string[];
  campos: Partial<Produto>;
  /** Diferença de estoque (vira Ajuste no histórico). */
  deltaEstoque: number;
}

/** Compara a planilha com o cadastro: o que é novo e o que muda em cada produto. */
export function compararComCadastro(linhas: LinhaPlanilha[], produtos: Produto[]): Alteracao[] {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const porCodigo = new Map(produtos.filter((p) => p.codigo).map((p) => [p.codigo!, p]));
  const porNome = new Map(produtos.map((p) => [normalizar(p.nome), p]));
  const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const saida: Alteracao[] = [];
  for (const l of linhas) {
    const p =
      (l.id && porId.get(l.id)) ||
      (l.codigo && porCodigo.get(l.codigo)) ||
      porNome.get(normalizar(l.nome));
    if (!p) {
      saida.push({ linha: l, mudancas: ["Produto novo"], campos: {}, deltaEstoque: 0 });
      continue;
    }
    const campos: Partial<Produto> = {};
    const mudancas: string[] = [];
    const dif = <K extends keyof Produto>(k: K, novo: Produto[K], rotulo: string, mostrar = (v: unknown) => String(v ?? "—")) => {
      const velho = p[k];
      if ((velho ?? "") === (novo ?? "")) return;
      campos[k] = novo;
      mudancas.push(`${rotulo}: ${mostrar(velho)} → ${mostrar(novo)}`);
    };
    dif("nome", l.nome, "Nome");
    dif("categoria", l.categoria, "Categoria");
    dif("precoUn", l.precoUn, "Venda", (v) => fmt(Number(v) || 0));
    if (l.precoRetirada !== undefined)
      dif("precoRetirada", l.precoRetirada || undefined, "Retirada", (v) => (v ? fmt(Number(v)) : "—"));
    dif("precoCusto", l.precoCusto, "Custo", (v) => fmt(Number(v) || 0));
    dif("estoqueMinimo", l.estoqueMinimo, "Mínimo");
    dif("unPorCaixa", l.unPorCaixa, "Un/cx");
    dif("codigo", l.codigo, "Código");
    dif("codigoBarras", l.codigoBarras, "Cód. barras");
    dif("ativo", l.ativo, "Ativo", (v) => (v ? "Sim" : "Não"));
    if (!!p.semEstoque !== l.semEstoque) {
      campos.semEstoque = l.semEstoque ? true : undefined;
      mudancas.push(`Controla estoque: ${p.semEstoque ? "Não" : "Sim"} → ${l.semEstoque ? "Não" : "Sim"}`);
    }
    const deltaEstoque = l.semEstoque ? 0 : l.estoqueUn - p.estoqueUn;
    if (deltaEstoque !== 0) mudancas.push(`Estoque: ${p.estoqueUn} → ${l.estoqueUn} (ajuste)`);
    if (mudancas.length) saida.push({ linha: l, produto: p, mudancas, campos, deltaEstoque });
  }
  return saida;
}

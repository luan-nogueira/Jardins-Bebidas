import { novoId } from "./db";
import { hojeISO } from "./format";
import type {
  EstoqueMovimento,
  FormaPagamento,
  Produto,
  Venda,
  VendaItem,
} from "./types";

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CREDITO: "Cartão crédito",
  DEBITO: "Cartão débito",
};

export const FORMAS: FormaPagamento[] = ["DINHEIRO", "PIX", "DEBITO", "CREDITO"];

export function subtotalItens(itens: VendaItem[]): number {
  return itens.reduce((s, i) => s + i.qtd * i.precoUn, 0);
}

/** Total cobrado: itens − desconto. */
export function totalVenda(v: Pick<Venda, "itens" | "desconto">): number {
  return Math.max(0, subtotalItens(v.itens) - (v.desconto || 0));
}

export function pagoVenda(v: Pick<Venda, "pagamentos">): number {
  return v.pagamentos.reduce((s, p) => s + p.valor, 0);
}

/** O que falta receber. Negativo = troco/pagou a mais. */
export function saldoVenda(v: Venda): number {
  if (v.status === "CANCELADA") return 0;
  return totalVenda(v) - pagoVenda(v);
}

export function custoVenda(v: Pick<Venda, "itens">): number {
  return v.itens.reduce((s, i) => s + i.qtd * (i.custoUn || 0), 0);
}

export function lucroVenda(v: Venda): number {
  return totalVenda(v) - custoVenda(v);
}

export function unidadesVenda(v: Pick<Venda, "itens">): number {
  return v.itens.reduce((s, i) => s + i.qtd, 0);
}

/** Comanda finalizada com saldo em aberto: é conta a receber. */
export function vendaEmAberto(v: Venda): boolean {
  return v.status === "FINALIZADA" && saldoVenda(v) > 0.005;
}

export function vendaVencida(v: Venda, hoje = hojeISO()): boolean {
  return vendaEmAberto(v) && !!v.vencimento && v.vencimento < hoje;
}

/** Só venda finalizada conta nos relatórios (comanda aberta ainda pode mudar). */
export function vendaConta(v: Venda): boolean {
  return v.status === "FINALIZADA" && !!v.finalizadaEm;
}

/** Data local (YYYY-MM-DD) de um timestamp ISO. */
export function diaLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function diaDaVenda(v: Venda): string {
  return diaLocal(v.finalizadaEm ?? v.abertaEm);
}

/** Preço de consumo no local ou, se o produto tiver, de retirada. */
export function precoDe(produto: Produto, retirada = false): number {
  return retirada && produto.precoRetirada ? produto.precoRetirada : produto.precoUn;
}

/** Junta itens iguais (mesmo produto e preço) somando a quantidade. */
export function adicionarItem(itens: VendaItem[], produto: Produto, qtd = 1, retirada = false): VendaItem[] {
  const preco = precoDe(produto, retirada);
  const comRetirada = retirada && !!produto.precoRetirada;
  const i = itens.findIndex((x) => x.produtoId === produto.id && x.precoUn === preco && !!x.retirada === comRetirada);
  if (i >= 0) {
    const novos = [...itens];
    novos[i] = { ...novos[i], qtd: novos[i].qtd + qtd };
    return novos;
  }
  return [
    ...itens,
    {
      produtoId: produto.id,
      nome: produto.nome,
      categoria: produto.categoria || "Sem categoria",
      qtd,
      precoUn: preco,
      ...(comRetirada && { retirada: true }),
      custoUn: produto.precoCusto || 0,
    },
  ];
}

export function numeroVenda(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}

interface DepsEstoque {
  produtoPorId: (id: string) => Produto | undefined;
  somarEstoque: (produtoId: string, delta: number) => Promise<void>;
  salvarMovimento: (m: EstoqueMovimento) => Promise<void>;
}

/**
 * Baixa do estoque o que a venda levou. Só é chamada ao finalizar — comanda
 * aberta não mexe no estoque (o cliente ainda pode trocar ou devolver).
 */
export async function baixarEstoqueVenda(venda: Venda, deps: DepsEstoque) {
  const porProduto = new Map<string, { nome: string; qtd: number }>();
  for (const i of venda.itens) {
    const atual = porProduto.get(i.produtoId) ?? { nome: i.nome, qtd: 0 };
    atual.qtd += i.qtd;
    porProduto.set(i.produtoId, atual);
  }
  for (const [produtoId, { nome, qtd }] of porProduto) {
    if (qtd <= 0 || deps.produtoPorId(produtoId)?.semEstoque) continue;
    await deps.salvarMovimento({
      id: novoId(),
      produtoId,
      produtoNome: deps.produtoPorId(produtoId)?.nome ?? nome,
      tipo: "SAIDA",
      origem: "VENDA",
      quantidadeUn: qtd,
      referenciaId: venda.id,
      data: diaLocal(venda.finalizadaEm ?? new Date().toISOString()),
      criadoEm: new Date().toISOString(),
    });
    // Sem clamp em 0: negativo avisa que faltou lançar uma entrada.
    if (deps.produtoPorId(produtoId)) await deps.somarEstoque(produtoId, -qtd);
  }
}

/**
 * Cancelar uma venda finalizada: devolve ao estoque e apaga os lançamentos
 * dela, pra o histórico do produto não ficar com venda que não existe.
 */
export async function estornarEstoqueVenda(
  venda: Venda,
  deps: {
    produtoPorId: (id: string) => Produto | undefined;
    somarEstoque: (produtoId: string, delta: number) => Promise<void>;
    movimentos: EstoqueMovimento[];
    removerMovimento: (id: string) => Promise<void>;
  },
) {
  const daVenda = deps.movimentos.filter(
    (m) => m.referenciaId === venda.id && m.origem === "VENDA",
  );
  for (const m of daVenda) {
    if (deps.produtoPorId(m.produtoId)) await deps.somarEstoque(m.produtoId, m.quantidadeUn);
    await deps.removerMovimento(m.id);
  }
}

import type { Produto } from "./types";
import { normalizar } from "./format";

/**
 * Produto com mercadoria em estoque mas sem preço de custo — entra como zero
 * no valor do estoque. Estoque e Produtos usam a mesma regra pra contagem
 * do aviso bater com a lista filtrada.
 */
export function semCustoNoEstoque(produto: Produto): boolean {
  return produto.ativo && !produto.semEstoque && produto.estoqueUn > 0 && !produto.precoCusto;
}

/** Converte caixas + unidades avulsas em unidades totais. */
export function paraUnidades(cx: number, un: number, unPorCaixa: number): number {
  return cx * unPorCaixa + un;
}

/** Quebra um total de unidades de volta em caixas + resto, pra exibição. */
export function paraCaixas(totalUn: number, unPorCaixa: number) {
  if (unPorCaixa <= 1) return { cx: 0, un: totalUn };
  return {
    cx: Math.floor(totalUn / unPorCaixa),
    un: totalUn % unPorCaixa,
  };
}

/** Estoque negativo: vendeu mais do que estava lançado. */
export function estoqueNegativo(produto: Produto): boolean {
  return !produto.semEstoque && produto.estoqueUn < 0;
}

/** Estoque no mínimo ou abaixo (e ainda não negativo). */
export function estoqueBaixo(produto: Produto): boolean {
  return (
    !produto.semEstoque &&
    produto.estoqueUn >= 0 &&
    produto.estoqueMinimo > 0 &&
    produto.estoqueUn <= produto.estoqueMinimo
  );
}

/** Semáforo do estoque usado nos cartões de produto e no Painel. */
export function nivelEstoque(produto: Produto): "zerado" | "baixo" | "ok" {
  if (produto.estoqueUn <= 0) return "zerado";
  return estoqueBaixo(produto) ? "baixo" : "ok";
}

const ORDEM_FIM = ["gelo", "descartaveis", "diversos"];

export function compararCategorias(a: string, b: string): number {
  const normA = normalizar(a || "Sem categoria");
  const normB = normalizar(b || "Sem categoria");
  const indexA = ORDEM_FIM.indexOf(normA);
  const indexB = ORDEM_FIM.indexOf(normB);

  const isAFim = indexA !== -1;
  const isBFim = indexB !== -1;

  if (isAFim && !isBFim) return 1;
  if (!isAFim && isBFim) return -1;
  if (isAFim && isBFim) return indexA - indexB;

  return (a || "Sem categoria").localeCompare(b || "Sem categoria", "pt-BR");
}

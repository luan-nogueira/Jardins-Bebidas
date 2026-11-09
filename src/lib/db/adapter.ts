export interface ComId {
  id: string;
}

/**
 * Contrato mínimo que as duas fontes de dados (navegador e Firestore)
 * precisam cumprir. As telas não sabem qual das duas está ativa.
 */
export interface ColecaoAdapter<T extends ComId> {
  /** Escuta a coleção em tempo real. Devolve a função que cancela a escuta. */
  observar(callback: (itens: T[]) => void): () => void;
  salvar(item: T): Promise<void>;
  /** Grava muitos de uma vez (importação) — uma notificação só pra tela. */
  salvarLote(itens: T[]): Promise<void>;
  /**
   * Soma `delta` a um campo numérico direto no banco (e grava `extras`
   * junto), sem partir do valor que a tela tem — duas gravações seguidas
   * não apagam uma a outra.
   */
  somar(id: string, campo: string, delta: number, extras?: Record<string, unknown>): Promise<void>;
  /** Grava só estes campos do documento (undefined apaga o campo). */
  atualizar(id: string, campos: Record<string, unknown>): Promise<void>;
  remover(id: string): Promise<void>;
}

export const COLECOES = [
  "produtos",
  "clientes",
  "fornecedores",
  "vendas",
  "movimentos",
  "contasPagar",
  "usuarios",
  "pedidos",
] as const;

export type NomeColecao = (typeof COLECOES)[number];

export function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

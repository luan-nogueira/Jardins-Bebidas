"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { colecao, modoDemonstracao, novoId } from "./db";
import { saldoVenda } from "./vendas";
import { useAuth } from "./auth";
import type {
  Cliente,
  ContaPagar,
  EstoqueMovimento,
  Fornecedor,
  Pedido,
  Produto,
  Usuario,
  Venda,
} from "./types";

interface Dados {
  produtos: Produto[];
  clientes: Cliente[];
  fornecedores: Fornecedor[];
  vendas: Venda[];
  movimentos: EstoqueMovimento[];
  contasPagar: ContaPagar[];
  /** Pedidos de cozinha (mais novos primeiro). */
  pedidos: Pedido[];
  /** Pedidos esperando a cozinha começar — badge da tela Cozinha. */
  pedidosNovos: number;
  /** Comandas abertas — para o badge da navegação. */
  comandasAbertas: number;
  usuarios: Usuario[];
  carregando: boolean;
  modoDemonstracao: boolean;

  salvarProduto: (p: Produto) => Promise<void>;
  salvarProdutosLote: (p: Produto[]) => Promise<void>;
  salvarMovimentosLote: (m: EstoqueMovimento[]) => Promise<void>;
  somarEstoque: (produtoId: string, delta: number, extras?: Partial<Produto>) => Promise<void>;
  atualizarProduto: (produtoId: string, campos: Partial<Produto>) => Promise<void>;
  removerProduto: (id: string) => Promise<void>;
  salvarCliente: (c: Cliente) => Promise<void>;
  removerCliente: (id: string) => Promise<void>;
  salvarFornecedor: (f: Fornecedor) => Promise<void>;
  removerFornecedor: (id: string) => Promise<void>;
  salvarVenda: (v: Venda) => Promise<void>;
  removerVenda: (id: string) => Promise<void>;
  salvarMovimento: (m: EstoqueMovimento) => Promise<void>;
  removerMovimento: (id: string) => Promise<void>;
  salvarContaPagar: (c: ContaPagar) => Promise<void>;
  removerContaPagar: (id: string) => Promise<void>;
  salvarUsuario: (u: Usuario) => Promise<void>;
  removerUsuario: (id: string) => Promise<void>;
  salvarPedido: (p: Pedido) => Promise<void>;

  proximoNumeroVenda: () => number;
  produtoPorId: (id: string) => Produto | undefined;
  clientePorId: (id: string) => Cliente | undefined;
  vendaPorId: (id: string) => Venda | undefined;
  /** Quanto o cliente deve em comandas finalizadas e não quitadas. */
  pendenciaDoCliente: (clienteId: string) => number;
}

const DadosContext = createContext<Dados | null>(null);

/**
 * Escuta uma coleção protegida — só inicia a subscription quando `ativo`
 * é verdadeiro (i.e. o usuário está autenticado).
 * Enquanto inativo, devolve [] e notifica aoCarregar() imediatamente,
 * para o contador de "prontas" não travar o carregando.
 */
function useColecaoProtegida<T extends { id: string }>(
  nome: Parameters<typeof colecao>[0],
  aoCarregar: () => void,
  ativo: boolean,
) {
  const [itens, setItens] = useState<T[]>([]);

  // Quando passa de inativo → ativo, reseta para não acumular dados stale.
  useEffect(() => {
    if (!ativo) {
      setItens([]);
      // Notifica imediatamente para que "prontas" avance mesmo sem auth.
      aoCarregar();
      return;
    }

    let primeiro = true;
    const parar = colecao<T>(nome).observar((novos) => {
      setItens(novos);
      if (primeiro) {
        primeiro = false;
        aoCarregar();
      }
    });
    return parar;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nome, ativo]);
  // Nota: aoCarregar intencionalmente omitido das deps — é estável via useCallback.

  return itens;
}

/** Evento que o AvisoGravacao escuta pra avisar na tela. */
export const EVENTO_AVISO_GRAVACAO = "aviso-gravacao";

/**
 * Muitas telas salvam sem tratar erro — se a gravação falhava (sem
 * internet, sem permissão), parecia que tinha salvado. Aqui toda gravação
 * avisa a tela quando falha ou quando passa de 8s sem confirmar (sem
 * internet, o Firestore segura a gravação até a conexão voltar).
 */
async function comAviso<T>(gravacao: Promise<T>): Promise<T> {
  const avisar = (tipo: "erro" | "lento") =>
    window.dispatchEvent(new CustomEvent(EVENTO_AVISO_GRAVACAO, { detail: tipo }));
  const lento = setTimeout(() => avisar("lento"), 8000);
  try {
    return await gravacao;
  } catch (e) {
    avisar("erro");
    throw e;
  } finally {
    clearTimeout(lento);
  }
}

const salvarEm =
  <T extends { id: string }>(nome: Parameters<typeof colecao>[0]) =>
  (item: T) =>
    comAviso(colecao<T>(nome).salvar(item));
const removerDe =
  (nome: Parameters<typeof colecao>[0]) => (id: string) =>
    comAviso(colecao(nome).remover(id));

/**
 * Funções de gravar/apagar criadas uma vez só, fora do Provider. Antes
 * eram recriadas a cada mudança de dados — e como o salvamento automático
 * do pedido depende de salvarPedido, cada gravação gerava uma função nova,
 * que disparava outra gravação 700ms depois, em loop infinito enquanto o
 * pedido estivesse aberto. Isso deixava todos os aparelhos redesenhando a
 * tela sem parar (impressão e navegação lentas).
 */
const ACOES = {
  salvarProduto: salvarEm<Produto>("produtos"),
  salvarProdutosLote: (itens: Produto[]) => comAviso(colecao<Produto>("produtos").salvarLote(itens)),
  salvarMovimentosLote: (itens: EstoqueMovimento[]) =>
    comAviso(colecao<EstoqueMovimento>("movimentos").salvarLote(itens)),
  /**
   * Soma (ou tira, com delta negativo) do estoque direto no banco. Gravar
   * `{...produto, estoqueUn: produto.estoqueUn - x}` partia do número que a
   * tela tinha: duas gravações seguidas (o salvamento automático do pedido
   * enquanto se digita) partiam do mesmo número e uma apagava a outra — o
   * lançamento ficava no histórico, mas o estoque não.
   */
  somarEstoque: (produtoId: string, delta: number, extras: Partial<Produto> = {}) =>
    comAviso(
      colecao<Produto>("produtos").somar(produtoId, "estoqueUn", delta, {
        ...extras,
        atualizadoEm: new Date().toISOString(),
      }),
    ),
  /** Grava só estes campos do produto, sem mexer no resto (estoque incluído). */
  atualizarProduto: (produtoId: string, campos: Partial<Produto>) =>
    comAviso(
      colecao<Produto>("produtos").atualizar(produtoId, {
        ...campos,
        atualizadoEm: new Date().toISOString(),
      }),
    ),
  removerProduto: removerDe("produtos"),
  salvarCliente: salvarEm<Cliente>("clientes"),
  removerCliente: removerDe("clientes"),
  salvarFornecedor: salvarEm<Fornecedor>("fornecedores"),
  removerFornecedor: removerDe("fornecedores"),
  salvarVenda: salvarEm<Venda>("vendas"),
  removerVenda: removerDe("vendas"),
  salvarMovimento: salvarEm<EstoqueMovimento>("movimentos"),
  removerMovimento: removerDe("movimentos"),
  salvarContaPagar: salvarEm<ContaPagar>("contasPagar"),
  removerContaPagar: removerDe("contasPagar"),
  salvarUsuario: salvarEm<Usuario>("usuarios"),
  removerUsuario: removerDe("usuarios"),
  salvarPedido: salvarEm<Pedido>("pedidos"),
};

export function DadosProvider({ children }: { children: React.ReactNode }) {
  const [prontas, setProntas] = useState(0);
  const marcarPronta = useCallback(() => setProntas((n) => n + 1), []);

  const { usuario, exigeLogin, ehAdmin, carregando: authCarregando } = useAuth();
  // Só escuta coleções protegidas quando está logado (ou em modo demonstração
  // sem Firebase, onde não há autenticação — exigeLogin === false).
  const logado = !exigeLogin || !!usuario;

  // Coleções protegidas: só observam com login (até os produtos — não há
  // mais tabela pública de preços).
  const produtos = useColecaoProtegida<Produto>("produtos", marcarPronta, logado);
  const clientes = useColecaoProtegida<Cliente>("clientes", marcarPronta, logado);
  const fornecedores = useColecaoProtegida<Fornecedor>("fornecedores", marcarPronta, logado);
  const vendas = useColecaoProtegida<Venda>("vendas", marcarPronta, logado);
  const movimentos = useColecaoProtegida<EstoqueMovimento>("movimentos", marcarPronta, logado);
  const contasPagar = useColecaoProtegida<ContaPagar>("contasPagar", marcarPronta, logado);
  const pedidos = useColecaoProtegida<Pedido>("pedidos", marcarPronta, logado);
  // Só admin pode listar a coleção inteira de usuários (a regra do Firestore
  // só libera "list" pra admin — um funcionário só lê o próprio documento,
  // isso é feito à parte em auth.tsx).
  const usuarios = useColecaoProtegida<Usuario>("usuarios", marcarPronta, logado && ehAdmin);

  const valor = useMemo<Dados>(() => {
    const produtosOrdenados = [...produtos].sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
    const clientesOrdenados = [...clientes].sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR"),
    );
    const vendasOrdenadas = [...vendas].sort(
      (a, b) =>
        (b.finalizadaEm ?? b.abertaEm).localeCompare(a.finalizadaEm ?? a.abertaEm) ||
        b.numero - a.numero,
    );
    const produtoPorId = (id: string) => produtos.find((p) => p.id === id);

    return {
      produtos: produtosOrdenados,
      clientes: clientesOrdenados,
      fornecedores,
      vendas: vendasOrdenadas,
      movimentos,
      contasPagar: [...contasPagar].sort((a, b) =>
        a.vencimento.localeCompare(b.vencimento),
      ),
      pedidos: [...pedidos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
      pedidosNovos: pedidos.filter((p) => p.status === "NOVO").length,
      comandasAbertas: vendas.filter((v) => v.status === "ABERTA").length,
      usuarios: [...usuarios].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      // Aguarda: auth resolvida + 8 coleções respondidas.
      // Em modo demonstração authCarregando é sempre false.
      carregando: authCarregando || prontas < 8,
      modoDemonstracao,

      ...ACOES,

      proximoNumeroVenda: () =>
        vendas.reduce((max, v) => Math.max(max, v.numero || 0), 0) + 1,
      produtoPorId,
      clientePorId: (id) => clientes.find((c) => c.id === id),
      vendaPorId: (id) => vendas.find((v) => v.id === id),

      pendenciaDoCliente: (clienteId) =>
        vendas
          .filter((v) => v.clienteId === clienteId && v.status === "FINALIZADA")
          .reduce((soma, v) => soma + Math.max(0, saldoVenda(v)), 0),
    };
  }, [authCarregando, produtos, clientes, fornecedores, vendas, movimentos, contasPagar, pedidos, usuarios, prontas]);

  return <DadosContext.Provider value={valor}>{children}</DadosContext.Provider>;
}

export function useDados(): Dados {
  const ctx = useContext(DadosContext);
  if (!ctx) throw new Error("useDados precisa estar dentro de <DadosProvider>");
  return ctx;
}

export { novoId };

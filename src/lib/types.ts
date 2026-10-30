/**
 * Modelo de domínio da Jardins Bebidas.
 *
 * A loja vende de dois jeitos:
 *  - BALCAO: o cliente paga e leva na hora. Baixa o estoque na hora.
 *  - COMANDA: venda a prazo. A comanda fica aberta (o cliente vai pegando),
 *    e o estoque só baixa quando a comanda é finalizada. O que não foi pago
 *    na finalização vira conta a receber, com vencimento.
 */

export type FormaPagamento = "DINHEIRO" | "PIX" | "CREDITO" | "DEBITO";

export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
}

export interface Produto {
  id: string;
  nome: string;
  categoria: string;
  /** Quantas unidades vêm em uma caixa. Corona = 24, Coca lata = 12, Suco = 6. */
  unPorCaixa: number;
  /** Preço de venda por unidade, em reais — a "Tabela 1", usada por padrão. */
  precoUn: number;
  /** Preço alternativo (Tabela 2) — opcional, pra escolher ao montar o pedido. */
  precoTabela2?: number;
  /** Preço alternativo (Tabela 3) — opcional, pra escolher ao montar o pedido. */
  precoTabela3?: number;
  /** Preço de custo por unidade, em reais. Usado pra margem. */
  precoCusto: number;
  estoqueUn: number;
  estoqueMinimo: number;
  /**
   * Porção, dose, couvert, taxa de entrega… — vende, mas não tem estoque
   * pra contar: a venda não baixa nada e o produto fica fora do Estoque.
   */
  semEstoque?: boolean;
  /** Código de barras (EAN) — o leitor no caixa digita ele + Enter. */
  codigoBarras?: string;
  /** Código interno do sistema antigo (LC Sistemas). */
  codigo?: string;
  ativo: boolean;
  /** Aparece na tabela de preços pública enviada aos clientes. */
  visivelCatalogo: boolean;
  imagemUrl?: string;
  imagemCenario?: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Cliente {
  id: string;
  nome: string;
  tipo: "PF" | "PJ";
  documento?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  obs?: string;
  ativo: boolean;
  criadoEm: string;
}

export interface Fornecedor {
  id: string;
  nome: string;
  documento?: string;
  telefone?: string;
  email?: string;
  obs?: string;
  ativo: boolean;
  criadoEm: string;
}

export type VendaTipo = "BALCAO" | "COMANDA";
export type VendaStatus = "ABERTA" | "FINALIZADA" | "CANCELADA";

export interface VendaItem {
  produtoId: string;
  /** Snapshot: renomear o produto não muda a venda antiga. */
  nome: string;
  categoria: string;
  qtd: number;
  /** Preço travado no momento da venda. */
  precoUn: number;
  /** Custo no momento da venda (pro lucro). */
  custoUn: number;
}

export interface VendaPagamento {
  id: string;
  forma: FormaPagamento;
  valor: number;
  /** Data/hora ISO do recebimento. */
  data: string;
  obs?: string;
}

export interface Venda {
  id: string;
  numero: number;
  tipo: VendaTipo;
  status: VendaStatus;
  /** Obrigatório na comanda; opcional no balcão (consumidor final). */
  clienteId?: string;
  clienteNome?: string;
  itens: VendaItem[];
  desconto: number;
  pagamentos: VendaPagamento[];
  /** Comanda finalizada sem pagar tudo: até quando o cliente tem pra pagar. */
  vencimento?: string;
  obs?: string;
  operador?: string;
  abertaEm: string;
  /** Quando a venda conta nos relatórios e baixa o estoque. */
  finalizadaEm?: string;
  canceladaEm?: string;
  atualizadoEm: string;
}

export type EstoqueTipo = "ENTRADA" | "SAIDA" | "AJUSTE";
export type EstoqueOrigem = "COMPRA" | "VENDA" | "ESTORNO" | "AJUSTE" | "PERDA";

export interface EstoqueMovimento {
  id: string;
  produtoId: string;
  produtoNome: string;
  tipo: EstoqueTipo;
  origem: EstoqueOrigem;
  /** Sempre em unidades, mesmo quando a entrada foi digitada em caixas. */
  quantidadeUn: number;
  custoUn?: number;
  fornecedorId?: string;
  /** Só em compra: pago na hora ou a prazo (gera conta a pagar). */
  pagamento?: "AVISTA" | "PRAZO";
  /** Conta a pagar criada por uma compra a prazo (lançamentos antigos). */
  contaPagarId?: string;
  /** Contas a pagar (uma por parcela) criadas por uma compra a prazo. */
  contaPagarIds?: string[];
  /** Id da venda ou da compra (nota) que gerou o movimento. */
  referenciaId?: string;
  /** Número da nota fiscal da compra. */
  nota?: string;
  /** Validade do lote comprado (YYYY-MM-DD). */
  validade?: string;
  data: string;
  obs?: string;
  criadoEm: string;
}

export type PapelUsuario = "admin" | "funcionario";

/** O que um funcionário pode ver/mexer — cada chave liga/desliga uma parte do sistema. */
export interface Permissoes {
  vendas: boolean;
  comandas: boolean;
  relatorios: boolean;
  produtos: boolean;
  clientes: boolean;
  financeiro: boolean;
  estoque: boolean;
  fornecedores: boolean;
  /** Ver preço de custo, margem e lucro — mesmo em telas que ele já acessa. */
  verCusto: boolean;
  /** Excluir cadastros e cancelar vendas finalizadas. */
  excluir: boolean;
}

export const PERMISSOES_PADRAO_FUNCIONARIO: Permissoes = {
  vendas: true,
  comandas: true,
  relatorios: false,
  produtos: true,
  clientes: true,
  financeiro: false,
  estoque: true,
  fornecedores: false,
  verCusto: false,
  excluir: false,
};

/** Perfil de acesso — um documento por uid do Firebase Auth. */
export interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: PapelUsuario;
  permissoes: Permissoes;
  /** false = acesso revogado (login continua existindo, mas não vê nada). */
  ativo: boolean;
  criadoEm: string;
}

/** Uma despesa/conta a pagar — fornecedor, aluguel, combustível, etc. */
export interface ContaPagar {
  id: string;
  descricao: string;
  fornecedorId?: string;
  /** Snapshot: se o fornecedor for renomeado, a conta antiga não muda. */
  fornecedorNome?: string;
  valor: number;
  vencimento: string;
  pago: boolean;
  pagoEm?: string;
  obs?: string;
  /** Linha digitável do boleto, só os números — pra copiar e colar no app do banco. */
  codigoBoleto?: string;
  /** Compra (nota) que gerou esta conta. */
  compraId?: string;
  /**
   * Gasto do dia a dia (tela Gastos): mantimentos, carne, gelo, luz…
   * Entra já pago. Os campos abaixo só existem nesses lançamentos.
   */
  categoria?: string;
  /** Boleto só existe em gasto (fornecedor); venda não recebe em boleto. */
  forma?: FormaPagamento | "BOLETO";
  /** "Caixa da loja" ou o nome de quem pagou do próprio bolso (pra acertar depois). */
  pagoPor?: string;
  /** Quando o caixa devolveu o dinheiro a quem pagou do bolso. */
  acertadoEm?: string;
  /** E-mail de quem lançou no sistema. */
  lancadoPor?: string;
  /**
   * Tem foto da nota em comprovantes/{id}. A foto fica fora daqui pra
   * todo aparelho não baixar todas as fotos ao abrir o sistema.
   */
  temComprovante?: boolean;
  criadoEm: string;
}

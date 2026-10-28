import type { Cliente, Produto } from "../types";

/**
 * Catálogo de exemplo do modo demonstração — só pra navegar no sistema
 * antes de cadastrar os produtos de verdade.
 */
type SeedProduto = Omit<Produto, "id" | "criadoEm" | "atualizadoEm">;

const agora = () => new Date().toISOString();

const base = { estoqueMinimo: 6, ativo: true, visivelCatalogo: false, unPorCaixa: 1 };

function p(nome: string, categoria: string, precoUn: number, precoCusto: number, estoqueUn: number, unPorCaixa = 1): SeedProduto {
  return { ...base, nome, categoria, precoUn, precoCusto, estoqueUn, unPorCaixa };
}

export const PRODUTOS_INICIAIS: SeedProduto[] = [
  p("Brahma lata 350ml", "Cerveja", 4.5, 2.9, 180, 12),
  p("Skol lata 350ml", "Cerveja", 4.5, 2.8, 144, 12),
  p("Heineken long neck 330ml", "Cerveja", 8, 5.2, 96, 6),
  p("Heineken lata 350ml", "Cerveja", 6.5, 4.3, 120, 12),
  p("Original 600ml", "Cerveja", 12, 7.5, 48, 12),
  p("Spaten long neck 355ml", "Cerveja", 7, 4.6, 4, 6),
  p("Corona long neck 330ml", "Cerveja", 9, 6, 60, 6),
  p("Coca-Cola 2L", "Refrigerante", 13, 8.9, 36, 6),
  p("Coca-Cola lata 350ml", "Refrigerante", 5.5, 3.2, 72, 12),
  p("Guaraná Antarctica 2L", "Refrigerante", 10, 6.5, 30, 6),
  p("Água mineral 500ml", "Água", 3, 1.2, 96, 12),
  p("Água com gás 500ml", "Água", 3.5, 1.5, 48, 12),
  p("Red Bull 250ml", "Energético", 12, 7.8, 48, 24),
  p("Monster 473ml", "Energético", 11, 7, 3, 6),
  p("Smirnoff 998ml", "Destilados", 45, 31, 12),
  p("Absolut 1L", "Destilados", 110, 78, 6),
  p("Red Label 1L", "Destilados", 120, 85, 8),
  p("Gin Gordon's 750ml", "Destilados", 85, 58, 5),
  p("Cachaça 51 965ml", "Destilados", 18, 11, 24),
  p("Gelo 5kg", "Gelo", 15, 7, 40),
  p("Carvão 3kg", "Diversos", 22, 13, 15),
  p("Copo descartável 50un", "Descartáveis", 8, 4, 30),
];

export const CATEGORIAS_PADRAO = [
  "Cerveja",
  "Refrigerante",
  "Água",
  "Energético",
  "Destilados",
  "Gelo",
  "Descartáveis",
  "Diversos",
];

type SeedCliente = Omit<Cliente, "id" | "criadoEm">;

export const CLIENTES_INICIAIS: SeedCliente[] = [
  { nome: "Bar do Zé", tipo: "PJ", telefone: "22999990001", ativo: true },
  { nome: "Marcos Silva", tipo: "PF", telefone: "22999990002", ativo: true },
  { nome: "Ana Paula", tipo: "PF", telefone: "22999990003", ativo: true },
];

export function semearProdutos(): Produto[] {
  return PRODUTOS_INICIAIS.map((x, i) => ({
    ...x,
    id: `seed-produto-${i + 1}`,
    criadoEm: agora(),
    atualizadoEm: agora(),
  }));
}

export function semearClientes(): Cliente[] {
  return CLIENTES_INICIAIS.map((c, i) => ({
    ...c,
    id: `seed-cliente-${i + 1}`,
    criadoEm: agora(),
  }));
}

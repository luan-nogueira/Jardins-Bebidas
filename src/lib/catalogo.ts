import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { colecao } from "./db";
import { firebaseConfigurado, getDb } from "./firebase";
import { compararCategorias } from "./calc";
import type { Produto } from "./types";

/**
 * Vitrine pública (/catalogo): o cliente vê sem login.
 *
 * Os produtos em si só são lidos com login — o documento tem custo, estoque
 * e códigos. Então a equipe publica uma cópia enxuta num documento aberto
 * (publico/catalogo), só com o que pode ir pro cliente. Quem publica é o
 * SincronizarCatalogo, rodando no aparelho de quem está logado.
 */
export interface ItemCatalogo {
  id: string;
  nome: string;
  categoria: string;
  precoUn: number;
  unPorCaixa: number;
  imagemUrl?: string;
  /** Tem pra vender agora. Não diz quanto — isso fica só pra equipe. */
  disponivel: boolean;
}

export interface Catalogo {
  itens: ItemCatalogo[];
  atualizadoEm: string;
}

/**
 * Categorias que nunca vão pra vitrine, mesmo marcadas: cigarro não pode ser
 * anunciado (Lei 9.294/96) e "Serviços" são taxas internas (entrega,
 * couvert) — o aluguel pra festa aparece na seção de eventos.
 */
export const CATEGORIAS_FORA_DO_CATALOGO = ["Tabacaria", "Serviços", "Outros"];

export function entraNoCatalogo(p: Produto): boolean {
  return (
    p.ativo &&
    p.visivelCatalogo &&
    p.precoUn > 0.05 &&
    !CATEGORIAS_FORA_DO_CATALOGO.includes(p.categoria)
  );
}

export function montarCatalogo(produtos: Produto[]): ItemCatalogo[] {
  return produtos
    .filter(entraNoCatalogo)
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      categoria: p.categoria || "Outros",
      precoUn: p.precoUn,
      unPorCaixa: p.unPorCaixa || 1,
      // Foto em base64 (sem Cloudinary) não vai: estoura o limite de 1 MB
      // do documento com poucos produtos.
      imagemUrl: p.imagemUrl?.startsWith("http") ? p.imagemUrl : undefined,
      disponivel: !!p.semEstoque || p.estoqueUn > 0,
    }))
    .sort(
      (a, b) =>
        compararCategorias(a.categoria, b.categoria) || a.nome.localeCompare(b.nome, "pt-BR"),
    );
}

const refCatalogo = () => doc(getDb(), "publico", "catalogo");

/** Escuta a vitrine publicada. Sem Firebase (demonstração), monta dos produtos locais. */
export function observarCatalogo(aoMudar: (c: Catalogo | null) => void): () => void {
  if (!firebaseConfigurado) {
    return colecao<Produto>("produtos").observar((produtos) =>
      aoMudar({ itens: montarCatalogo(produtos), atualizadoEm: new Date().toISOString() }),
    );
  }
  return onSnapshot(
    refCatalogo(),
    (snap) => aoMudar(snap.exists() ? (snap.data() as Catalogo) : { itens: [], atualizadoEm: "" }),
    (erro) => {
      console.error("[catalogo] falha ao ler a vitrine:", erro);
      aoMudar(null);
    },
  );
}

export async function publicarCatalogo(itens: ItemCatalogo[]) {
  // O Firestore não aceita undefined (foto em branco).
  const limpos = itens.map(({ imagemUrl, ...resto }) => (imagemUrl ? { ...resto, imagemUrl } : resto));
  await setDoc(refCatalogo(), { itens: limpos, atualizadoEm: new Date().toISOString() });
}

/** Texto comparável da vitrine — só grava de novo quando algo mudou. */
export function assinaturaCatalogo(itens: ItemCatalogo[]): string {
  return JSON.stringify(
    itens.map((i) => [i.id, i.nome, i.categoria, i.precoUn, i.unPorCaixa, i.imagemUrl ?? "", i.disponivel]),
  );
}

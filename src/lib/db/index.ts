import { firebaseConfigurado } from "../firebase";
import type { ColecaoAdapter, ComId, NomeColecao } from "./adapter";
import { criarAdaptadorFirestore } from "./firestore";
import { criarAdaptadorLocal } from "./local";

export { novoId, COLECOES } from "./adapter";
export type { NomeColecao } from "./adapter";
export { limparDadosLocais } from "./local";

const cache = new Map<string, ColecaoAdapter<ComId>>();

/** Devolve o adaptador da coleção — Firestore se configurado, senão o local. */
export function colecao<T extends ComId>(nome: NomeColecao): ColecaoAdapter<T> {
  if (!cache.has(nome)) {
    cache.set(
      nome,
      (firebaseConfigurado
        ? criarAdaptadorFirestore(nome)
        : criarAdaptadorLocal(nome)) as ColecaoAdapter<ComId>,
    );
  }
  return cache.get(nome) as unknown as ColecaoAdapter<T>;
}

export const modoDemonstracao = !firebaseConfigurado;

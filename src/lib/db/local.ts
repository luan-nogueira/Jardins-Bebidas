import { type ColecaoAdapter, type ComId, type NomeColecao } from "./adapter";
import { semearClientes, semearProdutos } from "./seed";

/**
 * Adaptador de demonstração: guarda tudo no localStorage do navegador.
 * Usado enquanto o Firebase não está configurado, pra dar pra navegar
 * no sistema de verdade sem depender de nada.
 */

const PREFIXO = "jardins-v1:";

const ouvintes = new Map<string, Set<(itens: never[]) => void>>();

function chave(colecao: NomeColecao) {
  return `${PREFIXO}${colecao}`;
}

function ler<T>(colecao: NomeColecao): T[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(chave(colecao));
    if (bruto === null) return semear<T>(colecao);
    return JSON.parse(bruto) as T[];
  } catch {
    return [];
  }
}

function escrever<T>(colecao: NomeColecao, itens: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave(colecao), JSON.stringify(itens));
  } catch {
    // Cota estourada ou modo privado: segue sem persistir.
  }
  notificar(colecao, itens);
}

/** Primeira visita: joga o catálogo da planilha pra dentro. */
function semear<T>(colecao: NomeColecao): T[] {
  let inicial: unknown[] = [];
  if (colecao === "produtos") inicial = semearProdutos();
  if (colecao === "clientes") inicial = semearClientes();

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(chave(colecao), JSON.stringify(inicial));
    } catch {
      // ignora
    }
  }
  return inicial as T[];
}

function notificar<T>(colecao: NomeColecao, itens: T[]) {
  const alvo = ouvintes.get(colecao);
  if (!alvo) return;
  for (const cb of alvo) (cb as unknown as (i: T[]) => void)(itens);
}

export function criarAdaptadorLocal<T extends ComId>(
  colecao: NomeColecao,
): ColecaoAdapter<T> {
  return {
    observar(callback) {
      if (!ouvintes.has(colecao)) ouvintes.set(colecao, new Set());
      const alvo = ouvintes.get(colecao)!;
      const cb = callback as unknown as (itens: never[]) => void;
      alvo.add(cb);

      // Entrega o estado atual de imediato, como um onSnapshot faria.
      callback(ler<T>(colecao));

      // Mantém abas do mesmo navegador em sincronia.
      const aoMudarStorage = (e: StorageEvent) => {
        if (e.key === chave(colecao)) callback(ler<T>(colecao));
      };
      window.addEventListener("storage", aoMudarStorage);

      return () => {
        alvo.delete(cb);
        window.removeEventListener("storage", aoMudarStorage);
      };
    },

    async salvar(item) {
      const itens = ler<T>(colecao);
      const i = itens.findIndex((x) => x.id === item.id);
      if (i >= 0) itens[i] = item;
      else itens.push(item);
      escrever(colecao, itens);
    },

    async salvarLote(novos) {
      const itens = ler<T>(colecao);
      const pos = new Map(itens.map((x, i) => [x.id, i]));
      for (const item of novos) {
        const i = pos.get(item.id);
        if (i !== undefined) itens[i] = item;
        else {
          pos.set(item.id, itens.length);
          itens.push(item);
        }
      }
      escrever(colecao, itens);
    },

    async somar(id, campo, delta, extras = {}) {
      const itens = ler<T>(colecao);
      const i = itens.findIndex((x) => x.id === id);
      if (i < 0) return;
      const atual = itens[i] as unknown as Record<string, unknown>;
      itens[i] = {
        ...atual,
        ...extras,
        [campo]: (Number(atual[campo]) || 0) + delta,
      } as unknown as T;
      escrever(colecao, itens);
    },

    async atualizar(id, campos) {
      const itens = ler<T>(colecao);
      const i = itens.findIndex((x) => x.id === id);
      if (i < 0) return;
      const novo: Record<string, unknown> = { ...(itens[i] as unknown as Record<string, unknown>) };
      for (const [k, v] of Object.entries(campos)) {
        if (v === undefined) delete novo[k];
        else novo[k] = v;
      }
      itens[i] = novo as unknown as T;
      escrever(colecao, itens);
    },

    async remover(id) {
      const itens = ler<T>(colecao).filter((x) => x.id !== id);
      escrever(colecao, itens);
    },
  };
}

/** Apaga os dados de demonstração e volta ao catálogo inicial. */
export function limparDadosLocais() {
  if (typeof window === "undefined") return;
  for (const k of Object.keys(window.localStorage)) {
    if (k.startsWith(PREFIXO)) window.localStorage.removeItem(k);
  }
  window.location.reload();
}

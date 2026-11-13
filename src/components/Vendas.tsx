"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, Minus, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui";
import { useDados, novoId } from "@/lib/store";
import { ProdutoImagem } from "@/components/ProdutoImagem";
import { brl, caixasEUnidades, hojeISO, normalizar, temPalavras, paraNumero, somarDias, telefoneBR } from "@/lib/format";
import { compararCategorias, nivelEstoque } from "@/lib/calc";
import { COR_NIVEL, visualCategoria } from "@/lib/categoriaVisual";
import {
  FORMAS,
  ROTULO_FORMA,
  baixarEstoqueVenda,
  chaveLancamento,
  estornarEstoqueVenda,
  precoDe,
  subtotalItens,
  precoMaco,
  textoEstoque,
  vendePorMaco,
} from "@/lib/vendas";
import type {
  Cliente,
  FormaPagamento,
  LancamentoComanda,
  Produto,
  Venda,
  VendaItem,
  VendaPagamento,
} from "@/lib/types";

/* ---------------------------------------------------------------------------
   Grade de produtos — toque adiciona 1 unidade; "+cx" adiciona uma caixa
   (as unidades dela: o carrinho e o estoque contam sempre em unidades).
   --------------------------------------------------------------------------- */

export function SeletorProdutos({
  aoEscolher,
  aoEscolherMaco,
  retirada = false,
  aoMudarRetirada,
}: {
  aoEscolher: (p: Produto, qtd?: number) => void;
  /** Com isso, cigarro pergunta "maço ou unidade?" ao tocar. */
  aoEscolherMaco?: (p: Produto) => void;
  /** Mostra o preço de retirada nos cartões. */
  retirada?: boolean;
  /** Com isso aparece a chave "Consumo no local / Retirada". */
  aoMudarRetirada?: (retirada: boolean) => void;
}) {
  const { produtos, vendas } = useDados();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const campoBusca = useRef<HTMLInputElement>(null);

  // No computador o cursor já começa na busca (leitor de código de barras e
  // teclado prontos); "/" volta pra busca de qualquer lugar da tela.
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) campoBusca.current?.focus();
    const aoTeclarTela = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      const digitando = alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT";
      if (e.key === "/" && !digitando) {
        e.preventDefault();
        campoBusca.current?.focus();
      }
    };
    window.addEventListener("keydown", aoTeclarTela);
    return () => window.removeEventListener("keydown", aoTeclarTela);
  }, []);

  /** Quanto cada produto vendeu nos últimos 30 dias — os mais vendidos vêm primeiro. */
  const popularidade = useMemo(() => {
    const desde = new Date(Date.now() - 30 * 864e5).toISOString();
    const mapa = new Map<string, number>();
    for (const v of vendas) {
      if (v.status !== "FINALIZADA" || (v.finalizadaEm ?? "") < desde) continue;
      for (const i of v.itens) mapa.set(i.produtoId, (mapa.get(i.produtoId) ?? 0) + i.qtd);
    }
    return mapa;
  }, [vendas]);

  const ativos = useMemo(() => produtos.filter((p) => p.ativo), [produtos]);
  const categorias = useMemo(
    () =>
      [...new Set(ativos.map((p) => p.categoria || "Sem categoria"))].sort(compararCategorias),
    [ativos],
  );
  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return ativos.filter(
      (p) =>
        (!categoria || (p.categoria || "Sem categoria") === categoria) &&
        (!termo ||
          temPalavras(p.nome, termo) ||
          p.codigoBarras === busca.trim() ||
          p.codigo === busca.trim()),
    ).sort(
      (a, b) =>
        (popularidade.get(b.id) ?? 0) - (popularidade.get(a.id) ?? 0) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [ativos, busca, categoria, popularidade]);

  /** Leitor de código de barras: digita o código e aperta Enter sozinho. */
  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const codigo = busca.trim();
    const exato =
      ativos.find((p) => p.codigoBarras && p.codigoBarras === codigo) ??
      ativos.find((p) => p.codigo && p.codigo === codigo) ??
      (visiveis.length === 1 ? visiveis[0] : undefined);
    if (exato) {
      escolher(exato);
      setBusca("");
    }
  }

  // Conta os toques no último produto escolhido, pra repetir o "pulo" do
  // cartão a cada toque (a animação reinicia quando a key muda).
  const [toques, setToques] = useState({ id: "", n: 0 });
  const [perguntando, setPerguntando] = useState<Produto | null>(null);
  // O leitor de código de barras manda um Enter: sem essa trava ele já
  // "clicava" em Maço no instante em que a pergunta abria.
  const perguntouEm = useRef(0);
  function escolher(p: Produto, qtd = 1) {
    if (aoEscolherMaco && vendePorMaco(p)) {
      perguntouEm.current = Date.now();
      setPerguntando(p);
      return;
    }
    setToques((t) => ({ id: p.id, n: t.id === p.id ? t.n + 1 : 1 }));
    aoEscolher(p, qtd);
  }
  function escolherDoModal(maco: boolean) {
    const p = perguntando;
    if (!p || Date.now() - perguntouEm.current < 500) return;
    setPerguntando(null);
    setToques((t) => ({ id: p.id, n: t.id === p.id ? t.n + 1 : 1 }));
    if (maco) aoEscolherMaco?.(p);
    else aoEscolher(p, 1);
  }

  return (
    <div>
      <Modal aberto={!!perguntando} aoFechar={() => setPerguntando(null)} titulo={perguntando?.nome ?? ""}>
        {perguntando && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              autoFocus
              className="flex flex-col items-center gap-1 rounded-2xl border-2 border-acento bg-acento/10 p-5 transition hover:bg-acento/20 active:scale-95"
              onClick={() => escolherDoModal(true)}
            >
              <span className="text-xl font-black">Maço</span>
              <span className="text-xs text-texto-suave">{perguntando.unPorCaixa} unidades</span>
              <span className="text-lg font-black text-acento tabular-nums">{brl(precoMaco(perguntando))}</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-1 rounded-2xl border-2 border-borda p-5 transition hover:bg-superficie-2 active:scale-95"
              onClick={() => escolherDoModal(false)}
            >
              <span className="text-xl font-black">Unidade</span>
              <span className="text-xs text-texto-suave">avulso</span>
              <span className="text-lg font-black text-acento tabular-nums">{brl(precoDe(perguntando, retirada))}</span>
            </button>
          </div>
        )}
      </Modal>
      {aoMudarRetirada && <ChaveRetirada retirada={retirada} aoMudar={aoMudarRetirada} />}
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-texto-suave" />
        <input
          ref={campoBusca}
          className="campo pl-9"
          placeholder="Buscar produto ou código…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={aoTeclar}
        />
      </div>
      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {["", ...categorias].map((c) => (
          <button
            key={c || "todas"}
            type="button"
            onClick={() => setCategoria(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              categoria === c
                ? "bg-acento text-acento-texto"
                : "border border-borda bg-superficie text-texto-suave hover:bg-superficie-2"
            }`}
          >
            {c || "Todas"}
          </button>
        ))}
      </div>
      {visiveis.length === 0 ? (
        <p className="py-8 text-center text-sm text-texto-suave">Nenhum produto encontrado.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {visiveis.map((p) => (
            <CartaoProduto
              key={p.id}
              produto={p}
              preco={precoDe(p, retirada)}
              toques={toques.id === p.id ? toques.n : 0}
              aoEscolher={(qtd) => escolher(p, qtd)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Consumo no local (preço normal) ou retirada (preço de levar, quando o produto tem). */
export function ChaveRetirada({
  retirada,
  aoMudar,
  historico = false,
  aoHistorico,
}: {
  retirada: boolean;
  aoMudar: (retirada: boolean) => void;
  /** Aba "Histórico" ligada (aí nenhuma das outras fica marcada). */
  historico?: boolean;
  /** Com isso aparece a terceira aba, "Histórico". */
  aoHistorico?: () => void;
}) {
  const classe = (ativa: boolean) =>
    `h-9 rounded-lg text-sm font-bold transition ${ativa ? "bg-superficie text-acento shadow-sm" : "text-texto-suave"}`;
  return (
    <div
      className={`mb-2 grid ${aoHistorico ? "grid-cols-3" : "grid-cols-2"} gap-1 rounded-xl bg-superficie-2 p-1`}
      role="group"
      aria-label="Tipo de venda"
    >
      {[false, true].map((r) => (
        <button
          key={String(r)}
          type="button"
          aria-pressed={!historico && retirada === r}
          onClick={() => aoMudar(r)}
          className={classe(!historico && retirada === r)}
        >
          {r ? "Retirada" : (
            <>
              <span className="sm:hidden">No local</span>
              <span className="hidden sm:inline">Consumo no local</span>
            </>
          )}
        </button>
      ))}
      {aoHistorico && (
        <button type="button" aria-pressed={historico} onClick={aoHistorico} className={classe(historico)}>
          Histórico
        </button>
      )}
    </div>
  );
}

function CartaoProduto({
  produto: p,
  preco,
  toques,
  aoEscolher,
}: {
  produto: Produto;
  preco: number;
  /** Muda a cada toque nesse produto — reinicia o "pulo" do ícone. */
  toques: number;
  aoEscolher: (qtd: number) => void;
}) {
  const { Icone, selo } = visualCategoria(p.categoria, p.nome);
  const nivel = COR_NIVEL[nivelEstoque(p)];
  const temCaixa = p.unPorCaixa > 1;
  const iconeCategoria = (
    <span className={`grid h-full w-full place-items-center rounded-xl ${selo}`}>
      <Icone className="h-5 w-5" />
    </span>
  );

  return (
    <div className="card group flex flex-col overflow-hidden transition hover:border-acento">
      <button
        type="button"
        onClick={() => aoEscolher(1)}
        className="flex flex-1 items-start gap-2.5 p-3 pb-2 text-left transition active:scale-[.97]"
        aria-label={`Adicionar 1 ${p.nome}`}
      >
        <span key={toques} className={`h-11 w-11 shrink-0 ${toques ? "animate-pop" : ""}`}>
          {p.imagemUrl ? (
            <span className="block h-full w-full overflow-hidden rounded-xl bg-white ring-1 ring-borda">
              <ProdutoImagem
                src={p.imagemUrl}
                alt=""
                width={44}
                height={44}
                className="h-full w-full object-contain p-0.5"
                fallback={iconeCategoria}
              />
            </span>
          ) : (
            iconeCategoria
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm leading-tight font-semibold">{p.nome}</span>
          <span className="mt-1 block font-black text-acento tabular-nums">{brl(preco)}</span>
        </span>
      </button>

      <div className="flex items-center gap-2 px-3 pb-2.5">
        {p.semEstoque ? (
          <span className="min-w-0 flex-1" />
        ) : (
          <span
            className={`flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-semibold tabular-nums ${nivel.texto}`}
            title="Estoque"
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${nivel.ponto}`} />
            <span className="truncate">{textoEstoque(p)}</span>
          </span>
        )}
        {/* Cigarro: o toque no cartão já pergunta maço ou unidade. */}
        {temCaixa && !vendePorMaco(p) && (
          <button
            type="button"
            onClick={() => aoEscolher(p.unPorCaixa)}
            className="shrink-0 rounded-lg bg-acento/10 px-2 py-1.5 text-[11px] font-black text-acento transition hover:bg-acento hover:text-acento-texto active:scale-95"
            title={`Adicionar 1 caixa (${p.unPorCaixa} un) · ${brl(preco * p.unPorCaixa)}`}
            aria-label={`Adicionar 1 caixa de ${p.nome} (${p.unPorCaixa} unidades)`}
          >
            +cx {p.unPorCaixa}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Lista de itens editável (carrinho / comanda).
   --------------------------------------------------------------------------- */

export function ListaItens({
  itens,
  aoMudar,
  somenteLeitura = false,
  lancamentos,
}: {
  itens: VendaItem[];
  aoMudar?: (itens: VendaItem[]) => void;
  somenteLeitura?: boolean;
  /** Histórico da comanda: com ele, tocar no item mostra quando e quem lançou. */
  lancamentos?: LancamentoComanda[];
}) {
  const [vendoHistorico, setVendoHistorico] = useState<VendaItem | null>(null);
  const { produtos } = useDados();
  const produtoDe = (produtoId: string) => produtos.find((p) => p.id === produtoId);
  const unPorCaixa = (produtoId: string) => produtoDe(produtoId)?.unPorCaixa ?? 1;

  /** Troca só esse item entre consumo no local e retirada. */
  function trocarRetirada(i: number) {
    const produto = produtoDe(itens[i].produtoId);
    if (!aoMudar || !produto?.precoRetirada) return;
    const retirada = !itens[i].retirada;
    const novos = [...itens];
    const { retirada: _, ...resto } = novos[i];
    novos[i] = { ...resto, precoUn: precoDe(produto, retirada), ...(retirada && { retirada: true }) };
    aoMudar(novos);
  }

  function mudarQtd(i: number, qtd: number) {
    if (!aoMudar) return;
    if (qtd <= 0) {
      aoMudar(itens.filter((_, j) => j !== i));
      return;
    }
    const novos = [...itens];
    novos[i] = { ...novos[i], qtd };
    aoMudar(novos);
  }

  if (itens.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-texto-suave">
        Nenhum item ainda. Toque nos produtos pra adicionar.
      </p>
    );
  }

  return (
    <>
    <ul className="divide-y divide-borda">
      {itens.map((item, i) => {
        const produtoItem = produtoDe(item.produtoId);
        // Cigarro: maço e unidade já são linhas separadas — sem "+cx".
        const porCaixa = item.fator || (produtoItem && vendePorMaco(produtoItem)) ? 1 : unPorCaixa(item.produtoId);
        const temRetirada = !!produtoDe(item.produtoId)?.precoRetirada;
        return (
        <li key={`${item.produtoId}-${i}`} className="flex items-center gap-2 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            {lancamentos ? (
              <button
                type="button"
                onClick={() => setVendoHistorico(item)}
                className="flex max-w-full items-center gap-1 text-left text-sm font-semibold hover:text-acento"
                title="Ver quando e quem lançou"
              >
                <span className="truncate">{item.nome}</span>
                <History className="h-3.5 w-3.5 shrink-0 text-texto-suave" aria-label="Ver histórico" />
              </button>
            ) : (
              <p className="truncate text-sm font-semibold">{item.nome}</p>
            )}
            <p className="text-xs text-texto-suave tabular-nums">
              {(temRetirada || item.retirada) &&
                (somenteLeitura || !temRetirada ? (
                  <span className="mr-1 font-bold">{item.retirada ? "Retirada" : "Local"} ·</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => trocarRetirada(i)}
                    className="mr-1 rounded-md bg-superficie-2 px-1.5 py-0.5 font-bold text-texto ring-1 ring-borda"
                    title="Trocar entre consumo no local e retirada"
                  >
                    {item.retirada ? "Retirada" : "Local"} ⇄
                  </button>
                ))}
              {brl(item.precoUn)} · {brl(item.qtd * item.precoUn)}
              {porCaixa > 1 && item.qtd >= porCaixa && (
                <span className="font-bold text-acento"> · {caixasEUnidades(item.qtd, porCaixa)}</span>
              )}
            </p>
          </div>
          {somenteLeitura ? (
            <span className="shrink-0 font-bold tabular-nums">{item.qtd}×</span>
          ) : (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-lg border border-borda transition hover:bg-superficie-2"
                onClick={() => mudarQtd(i, item.qtd - 1)}
                aria-label={`Tirar um ${item.nome}`}
              >
                {item.qtd === 1 ? <Trash2 className="h-3.5 w-3.5 text-red-600" /> : <Minus className="h-3.5 w-3.5" />}
              </button>
              <input
                className="h-8 w-11 rounded-lg border border-borda bg-superficie text-center text-sm font-bold tabular-nums"
                inputMode="numeric"
                value={item.qtd}
                onChange={(e) => mudarQtd(i, Math.max(0, Math.floor(paraNumero(e.target.value))))}
                aria-label={`Quantidade de ${item.nome}`}
              />
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-lg border border-borda transition hover:bg-superficie-2"
                onClick={() => mudarQtd(i, item.qtd + 1)}
                aria-label={`Mais um ${item.nome}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              {porCaixa > 1 && (
                <button
                  type="button"
                  className="h-8 rounded-lg bg-acento/10 px-2 text-[11px] font-black text-acento transition hover:bg-acento hover:text-acento-texto"
                  onClick={() => mudarQtd(i, item.qtd + porCaixa)}
                  aria-label={`Mais uma caixa de ${item.nome} (${porCaixa} unidades)`}
                  title={`Mais 1 caixa (${porCaixa} un)`}
                >
                  +cx
                </button>
              )}
            </div>
          )}
        </li>
        );
      })}
    </ul>
    {lancamentos && (
      <HistoricoItem
        item={vendoHistorico}
        total={vendoHistorico ? itens.filter((x) => chaveLancamento(x) === chaveLancamento(vendoHistorico)).reduce((s, x) => s + x.qtd, 0) : 0}
        lancamentos={lancamentos}
        aoFechar={() => setVendoHistorico(null)}
      />
    )}
    </>
  );
}

const quandoBR = (iso: string) =>
  new Date(iso)
    .toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .replace(".", "");

/** "15 Stella → 10 em 11/11 por Alice, 5 em 13/11 por Luiza". */
function HistoricoItem({
  item,
  total,
  lancamentos,
  aoFechar,
}: {
  item: VendaItem | null;
  total: number;
  lancamentos: LancamentoComanda[];
  aoFechar: () => void;
}) {
  const doItem = item ? lancamentos.filter((l) => chaveLancamento(l) === chaveLancamento(item)) : [];
  // Comanda aberta antes do histórico existir: o que sobra veio sem registro.
  const semRegistro = total - doItem.reduce((s, l) => s + l.qtd, 0);
  return (
    <Modal aberto={!!item} aoFechar={aoFechar} titulo={item ? item.nome : ""}>
      {item && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between rounded-xl bg-superficie-2 px-4 py-3">
            <span className="text-sm font-semibold text-texto-suave">Na comanda agora</span>
            <span className="text-2xl font-black tabular-nums">{total}</span>
          </div>
          <ul className="divide-y divide-borda">
            {semRegistro > 0 && (
              <li className="flex items-center gap-3 py-2.5 text-sm text-texto-suave">
                <span className="w-12 shrink-0 text-right font-black tabular-nums">+{semRegistro}</span>
                <span>Lançado antes do histórico existir (sem data)</span>
              </li>
            )}
            {doItem.map((l, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                <span
                  className={`w-12 shrink-0 text-right font-black tabular-nums ${l.qtd < 0 ? "text-red-600 dark:text-red-400" : "text-acento"}`}
                >
                  {l.qtd > 0 ? `+${l.qtd}` : l.qtd}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{quandoBR(l.em)}</span>
                  <span className="block truncate text-xs text-texto-suave">
                    {l.qtd < 0 ? "Tirado por" : "Lançado por"} {l.por}
                  </span>
                </span>
              </li>
            ))}
            {doItem.length === 0 && semRegistro <= 0 && (
              <li className="py-4 text-center text-sm text-texto-suave">Sem lançamentos registrados.</li>
            )}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------------------
   Cliente: escolher da lista ou cadastrar na hora (nome + telefone).
   --------------------------------------------------------------------------- */

export function SeletorCliente({
  clienteId,
  aoMudar,
  obrigatorio = false,
}: {
  clienteId: string;
  aoMudar: (cliente: Cliente | null) => void;
  obrigatorio?: boolean;
}) {
  const { clientes, salvarCliente, pendenciaDoCliente } = useDados();
  const [novo, setNovo] = useState<{ nome: string; telefone: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const atual = clientes.find((c) => c.id === clienteId);
  const deve = atual ? pendenciaDoCliente(atual.id) : 0;

  async function cadastrar() {
    if (!novo || !novo.nome.trim()) return;
    setSalvando(true);
    try {
      const existente = clientes.find((c) => normalizar(c.nome) === normalizar(novo.nome));
      if (existente) {
        aoMudar(existente);
      } else {
        const cliente: Cliente = {
          id: novoId(),
          nome: novo.nome.trim(),
          telefone: novo.telefone.replace(/\D/g, "") || undefined,
          tipo: "PF",
          ativo: true,
          criadoEm: new Date().toISOString(),
        };
        await salvarCliente(cliente);
        aoMudar(cliente);
      }
      setNovo(null);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <label className="rotulo">Cliente{obrigatorio ? "" : " (opcional)"}</label>
      {novo === null ? (
        <div className="flex gap-2">
          <select
            className="campo min-w-0 flex-1"
            value={clienteId}
            onChange={(e) => aoMudar(clientes.find((c) => c.id === e.target.value) ?? null)}
          >
            <option value="">{obrigatorio ? "Escolha o cliente…" : "Consumidor final"}</option>
            {clientes
              .filter((c) => c.ativo !== false)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.telefone ? ` · ${telefoneBR(c.telefone)}` : ""}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn-secundario shrink-0 px-3"
            onClick={() => setNovo({ nome: "", telefone: "" })}
            aria-label="Cadastrar cliente novo"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-borda bg-superficie-2 p-3">
          <input
            autoFocus
            className="campo"
            placeholder="Nome do cliente"
            value={novo.nome}
            onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
          />
          <input
            className="campo"
            placeholder="Telefone (opcional)"
            inputMode="tel"
            value={novo.telefone}
            onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-fantasma" onClick={() => setNovo(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primario"
              disabled={salvando || !novo.nome.trim()}
              onClick={cadastrar}
            >
              Cadastrar
            </button>
          </div>
        </div>
      )}
      {deve > 0.005 && (
        <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
          Este cliente já deve {brl(deve)} em comandas anteriores.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Pagamento: uma ou mais formas, troco no dinheiro e (na comanda) a opção
   de deixar o restante a prazo com vencimento.
   --------------------------------------------------------------------------- */

interface LinhaPg {
  forma: FormaPagamento;
  valor: string;
}

export interface ResultadoPagamento {
  pagamentos: VendaPagamento[];
  /** Preenchido quando ficou saldo pra pagar depois. */
  vencimento?: string;
  /** Desconto dado agora (R$), somado ao da venda. */
  desconto?: number;
}

export function ModalPagamento({
  aberto,
  titulo = "Pagamento",
  aPagar,
  permitePrazo,
  textoConfirmar = "Confirmar",
  extra,
  aoFechar,
  aoConfirmar,
}: {
  extra?: React.ReactNode;
  aberto: boolean;
  titulo?: string;
  /** Quanto falta pagar agora. */
  aPagar: number;
  permitePrazo: boolean;
  textoConfirmar?: string;
  aoFechar: () => void;
  aoConfirmar: (r: ResultadoPagamento) => Promise<void>;
}) {
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo}>
      {aberto && (
        <FormPagamento
          aPagar={aPagar}
          permitePrazo={permitePrazo}
          textoConfirmar={textoConfirmar}
          extra={extra}
          aoCancelar={aoFechar}
          aoConfirmar={aoConfirmar}
        />
      )}
    </Modal>
  );
}

function FormPagamento({
  aPagar: cheio,
  permitePrazo,
  textoConfirmar,
  extra,
  aoCancelar,
  aoConfirmar,
}: {
  extra?: React.ReactNode;
  aPagar: number;
  permitePrazo: boolean;
  textoConfirmar: string;
  aoCancelar: () => void;
  aoConfirmar: (r: ResultadoPagamento) => Promise<void>;
}) {
  const [linhas, setLinhas] = useState<LinhaPg[]>([
    { forma: "DINHEIRO", valor: cheio.toFixed(2).replace(".", ",") },
  ]);
  const [aPrazo, setAPrazo] = useState(false);
  const [vencimento, setVencimento] = useState(() => somarDias(hojeISO(), 30));
  const [salvando, setSalvando] = useState(false);
  const [desconto, setDesconto] = useState("");
  const [emPorcento, setEmPorcento] = useState(false);

  const calcDesconto = (texto: string, porcento: boolean) => {
    const n = Math.max(0, paraNumero(texto));
    return Math.round(Math.min(cheio, porcento ? (cheio * n) / 100 : n) * 100) / 100;
  };
  const valorDesconto = calcDesconto(desconto, emPorcento);
  const aPagar = cheio - valorDesconto;

  /** Com uma forma só, o valor dela acompanha o desconto. */
  function mudarDesconto(texto: string, porcento: boolean) {
    setDesconto(texto);
    setEmPorcento(porcento);
    const devido = cheio - calcDesconto(texto, porcento);
    setLinhas((ls) => (ls.length === 1 ? [{ ...ls[0], valor: devido.toFixed(2).replace(".", ",") }] : ls));
  }

  const informado = linhas.reduce((s, l) => s + paraNumero(l.valor), 0);
  const temDinheiro = linhas.some((l) => l.forma === "DINHEIRO" && paraNumero(l.valor) > 0);
  const troco = temDinheiro ? Math.max(0, informado - aPagar) : 0;
  const falta = Math.max(0, aPagar - informado);
  const excessoSemDinheiro = !temDinheiro && informado > aPagar + 0.005;
  const podeConfirmar =
    !salvando && !excessoSemDinheiro && (falta <= 0.005 || (permitePrazo && aPrazo));

  function mudar(i: number, campo: Partial<LinhaPg>) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...campo } : l)));
  }

  async function confirmar() {
    if (!podeConfirmar) return;
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      let sobraTroco = troco;
      const pagamentos: VendaPagamento[] = [];
      for (const l of linhas) {
        let valor = paraNumero(l.valor);
        // O troco sai do dinheiro: registra só o que ficou no caixa.
        if (l.forma === "DINHEIRO" && sobraTroco > 0) {
          const tirar = Math.min(valor, sobraTroco);
          valor -= tirar;
          sobraTroco -= tirar;
        }
        if (valor > 0.004) {
          pagamentos.push({ id: novoId(), forma: l.forma, valor: Math.round(valor * 100) / 100, data: agora });
        }
      }
      await aoConfirmar({
        pagamentos,
        vencimento: falta > 0.005 && aPrazo ? vencimento : undefined,
        desconto: valorDesconto || undefined,
      });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="rotulo mb-0 shrink-0" htmlFor="pg-desconto">
          Desconto
        </label>
        <input
          id="pg-desconto"
          className="campo h-9 min-w-0 py-1 text-right tabular-nums"
          inputMode="decimal"
          placeholder={emPorcento ? "0" : "0,00"}
          value={desconto}
          onChange={(e) => mudarDesconto(e.target.value, emPorcento)}
        />
        <div className="flex shrink-0 rounded-lg border border-borda p-0.5">
          {[false, true].map((p) => (
            <button
              key={String(p)}
              type="button"
              aria-pressed={emPorcento === p}
              onClick={() => mudarDesconto(desconto, p)}
              className={`h-7 w-9 rounded-md text-xs font-bold ${
                emPorcento === p ? "bg-acento text-acento-texto" : "text-texto-suave"
              }`}
            >
              {p ? "%" : "R$"}
            </button>
          ))}
        </div>
      </div>

      <div className="card flex items-center justify-between border-acento/40 bg-acento/5 px-4 py-3">
        <span className="text-sm font-semibold text-texto-suave">
          A pagar
          {valorDesconto > 0 && (
            <span className="block text-xs font-normal">
              de {brl(cheio)} − {brl(valorDesconto)}
              {emPorcento && ` (${desconto.replace(".", ",")}%)`}
            </span>
          )}
        </span>
        <span className="text-2xl font-black text-acento tabular-nums">{brl(aPagar)}</span>
      </div>

      <div className="space-y-3">
        {linhas.map((l, i) => (
          <div key={i} className="space-y-2">
            <div className="grid grid-cols-4 gap-1">
              {FORMAS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => mudar(i, { forma: f })}
                  className={`rounded-lg px-1 py-2 text-[11px] font-bold transition ${
                    l.forma === f
                      ? "bg-acento text-acento-texto"
                      : "border border-borda bg-superficie text-texto-suave"
                  }`}
                >
                  {ROTULO_FORMA[f].replace("Cartão ", "")}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="campo text-lg font-bold tabular-nums"
                inputMode="decimal"
                value={l.valor}
                onFocus={(e) => e.target.select()}
                onChange={(e) => mudar(i, { valor: e.target.value })}
                aria-label="Valor"
              />
              {linhas.length > 1 && (
                <button
                  type="button"
                  className="btn-fantasma shrink-0 px-3"
                  onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                  aria-label="Tirar esta forma"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="text-sm font-semibold text-acento hover:underline"
          onClick={() =>
            setLinhas((ls) => [...ls, { forma: "PIX", valor: falta > 0 ? falta.toFixed(2).replace(".", ",") : "" }])
          }
        >
          + Dividir em outra forma
        </button>
      </div>

      {troco > 0.005 && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-lg font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          Troco: {brl(troco)}
        </p>
      )}
      {excessoSemDinheiro && (
        <p className="text-sm text-red-600">O valor passou do total (troco só no dinheiro).</p>
      )}

      {falta > 0.005 && (
        <div className="rounded-xl border border-borda p-3">
          <p className="text-sm">
            Faltam <strong className="tabular-nums">{brl(falta)}</strong>
          </p>
          {permitePrazo ? (
            <>
              <label className="mt-2 flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={aPrazo}
                  onChange={(e) => setAPrazo(e.target.checked)}
                  className="h-4 w-4 accent-[var(--acento)]"
                />
                Deixar o restante a prazo (conta a receber)
              </label>
              {aPrazo && (
                <div className="mt-2">
                  <label className="rotulo" htmlFor="venc-prazo">
                    Vence em
                  </label>
                  <input
                    id="venc-prazo"
                    type="date"
                    className="campo"
                    value={vencimento}
                    onChange={(e) => setVencimento(e.target.value)}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="mt-1 text-xs text-texto-suave">
              No balcão é preciso receber tudo. Pra vender fiado, use uma comanda.
            </p>
          )}
        </div>
      )}

      {extra}

      <div className="flex justify-end gap-2 border-t border-borda pt-4">
        <button type="button" className="btn-secundario" onClick={aoCancelar} disabled={salvando}>
          Voltar
        </button>
        <button type="button" className="btn-primario" onClick={confirmar} disabled={!podeConfirmar}>
          {salvando ? "Salvando…" : textoConfirmar}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Ações que mexem em venda + estoque juntos.
   --------------------------------------------------------------------------- */

export function useAcoesVenda() {
  const d = useDados();

  /** Fecha a venda: entra nos relatórios e baixa o estoque. */
  async function finalizar(venda: Venda, r: ResultadoPagamento): Promise<Venda> {
    const agora = new Date().toISOString();
    const final: Venda = {
      ...venda,
      status: "FINALIZADA",
      desconto: venda.desconto + (r.desconto ?? 0),
      pagamentos: [...venda.pagamentos, ...r.pagamentos],
      vencimento: r.vencimento,
      finalizadaEm: agora,
      atualizadoEm: agora,
    };
    await d.salvarVenda(final);
    await baixarEstoqueVenda(final, d);
    return final;
  }

  /** Recebe (parte de) uma comanda já finalizada. */
  async function receber(venda: Venda, r: ResultadoPagamento) {
    await d.salvarVenda({
      ...venda,
      desconto: venda.desconto + (r.desconto ?? 0),
      pagamentos: [...venda.pagamentos, ...r.pagamentos],
      vencimento: r.vencimento ?? venda.vencimento,
      atualizadoEm: new Date().toISOString(),
    });
  }

  /** Cancela: se já estava finalizada, devolve os itens ao estoque. */
  async function cancelar(venda: Venda) {
    if (venda.status === "FINALIZADA") {
      await estornarEstoqueVenda(venda, d);
    }
    const agora = new Date().toISOString();
    await d.salvarVenda({ ...venda, status: "CANCELADA", canceladaEm: agora, atualizadoEm: agora });
  }

  /**
   * Troca os itens de uma venda. Já finalizada: devolve o estoque antigo e
   * baixa o novo. Se o novo total ficou menor que o já pago, tira a
   * diferença dos últimos pagamentos e devolve quanto entregar ao cliente.
   */
  async function editarItens(venda: Venda, itens: VendaItem[]): Promise<{ venda: Venda; devolver: number }> {
    const agora = new Date().toISOString();
    const subtotal = itens.reduce((s, i) => s + i.qtd * i.precoUn, 0);
    const desconto = Math.min(venda.desconto, subtotal);
    let excesso = Math.round((venda.pagamentos.reduce((s, p) => s + p.valor, 0) - (subtotal - desconto)) * 100) / 100;
    const devolver = Math.max(0, excesso);
    const pagamentos = [...venda.pagamentos];
    for (let i = pagamentos.length - 1; i >= 0 && excesso > 0.004; i--) {
      const tira = Math.min(excesso, pagamentos[i].valor);
      pagamentos[i] = { ...pagamentos[i], valor: Math.round((pagamentos[i].valor - tira) * 100) / 100 };
      excesso -= tira;
    }
    const nova: Venda = {
      ...venda,
      itens,
      desconto,
      pagamentos: pagamentos.filter((p) => p.valor > 0.004),
      atualizadoEm: agora,
    };
    if (venda.status === "FINALIZADA") {
      await estornarEstoqueVenda(venda, d);
      await d.salvarVenda(nova);
      await baixarEstoqueVenda(nova, d);
    } else {
      await d.salvarVenda(nova);
    }
    return { venda: nova, devolver };
  }

  return { finalizar, receber, cancelar, editarItens };
}

export function novaVenda(
  dados: Pick<Venda, "tipo" | "itens"> & Partial<Venda>,
  numero: number,
): Venda {
  const agora = new Date().toISOString();
  return {
    id: novoId(),
    numero,
    status: "ABERTA",
    desconto: 0,
    pagamentos: [],
    abertaEm: agora,
    atualizadoEm: agora,
    ...dados,
  };
}

export { subtotalItens };

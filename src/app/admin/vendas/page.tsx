"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, Printer, ShoppingCart, X } from "lucide-react";
import { Cabecalho, Modal } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import {
  ChaveRetirada,
  ListaItens,
  ModalPagamento,
  SeletorCliente,
  SeletorProdutos,
  novaVenda,
  useAcoesVenda,
} from "@/components/Vendas";
import { DetalheVenda } from "@/components/DetalheVenda";
import { HistoricoVendas } from "@/components/HistoricoVendas";
import { BotaoImprimirVenda, useImprimirVenda } from "@/components/CupomVenda";

const CHAVE_IMPRIMIR = "jardins:vender-imprimir-cupom";
import { MiniBrinde } from "@/components/Brinde";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { brl, horaBR, hojeISO } from "@/lib/format";
import {
  adicionarItem,
  adicionarMaco,
  diaDaVenda,
  numeroVenda,
  subtotalItens,
  totalVenda,
  vendaConta,
} from "@/lib/vendas";
import { nomeComanda } from "@/lib/pedidos";
import type { Cliente, Venda, VendaItem } from "@/lib/types";

export default function VendasPage() {
  return (
    <Protegido chave="vendas">
      <VendasInterno />
    </Protegido>
  );
}

function VendasInterno() {
  const router = useRouter();
  const { vendas, proximoNumeroVenda, salvarVenda } = useDados();
  const { usuario, permissoes } = useAuth();
  const { finalizar } = useAcoesVenda();

  const [itens, setItens] = useState<VendaItem[]>([]);
  /** Preço de retirada nos produtos que entram daqui pra frente. */
  const [retirada, setRetirada] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [verHistorico, setVerHistorico] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [escolhendoComanda, setEscolhendoComanda] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; brinde: boolean } | null>(null);
  const [vendo, setVendo] = useState<Venda | null>(null);
  /** Última venda fechada aqui — fica à mão pra imprimir o cupom. */
  const [ultima, setUltima] = useState<Venda | null>(null);
  // Imprimir o cupom sozinho ao finalizar — escolha lembrada neste computador.
  const [imprimirAoFechar, setImprimirAoFechar] = useState(true);
  const impressao = useImprimirVenda();
  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE_IMPRIMIR) === "nao") setImprimirAoFechar(false);
    } catch {}
  }, []);
  function mudarImprimir(sim: boolean) {
    setImprimirAoFechar(sim);
    try {
      localStorage.setItem(CHAVE_IMPRIMIR, sim ? "sim" : "nao");
    } catch {}
  }

  const total = subtotalItens(itens);
  const qtdItens = itens.reduce((s, i) => s + i.qtd, 0);

  // Atalho do caixa no computador: F2 = Cobrar.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "F2" && total > 0 && !pagando) {
        e.preventDefault();
        setPagando(true);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [total, pagando]);

  const hoje = hojeISO();
  const vendasHoje = useMemo(
    () => vendas.filter((v) => (vendaConta(v) || v.status === "CANCELADA") && diaDaVenda(v) === hoje),
    [vendas, hoje],
  );
  const totalHoje = vendasHoje.filter(vendaConta).reduce((s, v) => s + totalVenda(v), 0);

  function limpar() {
    setItens([]);
    setCliente(null);
    setRetirada(false);
    setCarrinhoAberto(false);
  }

  /** `brinde`: venda fechada de verdade — o aviso vem com os canecos brindando. */
  function mostrarAviso(texto: string, brinde = false) {
    setAviso({ texto, brinde });
    setTimeout(() => setAviso(null), 3500);
  }

  async function cobrar(r: Parameters<typeof finalizar>[1]) {
    const venda = novaVenda(
      {
        tipo: "BALCAO",
        itens,
        clienteId: cliente?.id,
        clienteNome: cliente?.nome,
        operador: usuario?.email ?? undefined,
      },
      proximoNumeroVenda(),
    );
    const final = await finalizar(venda, r);
    setUltima(final);
    setPagando(false);
    if (imprimirAoFechar) impressao.imprimir(final);
    limpar();
    mostrarAviso(`Venda ${numeroVenda(final.numero)} finalizada — ${brl(totalVenda(final))}`, true);
  }

  async function lancarNaComanda(comanda: Venda) {
    let novos = comanda.itens;
    for (const i of itens) {
      const idx = novos.findIndex((x) => x.produtoId === i.produtoId && x.precoUn === i.precoUn);
      if (idx >= 0) {
        novos = novos.map((x, j) => (j === idx ? { ...x, qtd: x.qtd + i.qtd } : x));
      } else {
        novos = [...novos, i];
      }
    }
    await salvarVenda({
      ...comanda,
      itens: novos,
      atualizadoEm: new Date().toISOString(),
    });
    setEscolhendoComanda(false);
    limpar();
    mostrarAviso(`Lançado na comanda de ${nomeComanda(comanda)}`);
  }

  async function abrirComandaNova(c: Cliente) {
    const comanda = novaVenda(
      {
        tipo: "COMANDA",
        itens,
        clienteId: c.id,
        clienteNome: c.nome,
        operador: usuario?.email ?? undefined,
        ...(retirada && { retirada: true }),
      },
      proximoNumeroVenda(),
    );
    await salvarVenda(comanda);
    setEscolhendoComanda(false);
    limpar();
    mostrarAviso(`Comanda ${numeroVenda(comanda.numero)} aberta pra ${c.nome}`);
  }

  const carrinho = (
    <div className="flex flex-col">
      <ListaItens itens={itens} aoMudar={setItens} />
      {itens.length > 0 && (
        <div className="space-y-3 border-t border-borda px-4 py-3">
          <SeletorCliente clienteId={cliente?.id ?? ""} aoMudar={setCliente} />
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-texto-suave">
              {qtdItens} {qtdItens === 1 ? "item" : "itens"} · desconto na hora de cobrar
            </span>
            <span className="text-2xl font-black text-acento tabular-nums">{brl(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {permissoes.comandas && (
              <button className="btn-secundario" onClick={() => setEscolhendoComanda(true)}>
                <ClipboardList className="h-4 w-4" />
                Na comanda
              </button>
            )}
            <button
              className={`btn-primario ${permissoes.comandas ? "" : "col-span-2"}`}
              onClick={() => setPagando(true)}
              disabled={total <= 0}
            >
              Cobrar
              <kbd className="hidden rounded bg-white/20 px-1.5 text-[10px] font-bold md:inline">F2</kbd>
            </button>
          </div>
          <button className="w-full text-center text-xs font-semibold text-texto-suave hover:text-red-600" onClick={limpar}>
            Limpar venda
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <Cabecalho
        titulo="Vender"
        subtitulo={`Hoje: ${vendasHoje.filter(vendaConta).length} venda(s) · ${brl(totalHoje)}`}
      />

      {aviso && (
        <div
          key={aviso.texto}
          role="status"
          className="animate-toast fixed inset-x-4 top-16 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-xl md:top-6"
        >
          {aviso.brinde ? (
            <span className="grid h-10 w-14 shrink-0 place-items-center rounded-xl bg-white/15">
              <MiniBrinde className="h-8 w-auto" />
            </span>
          ) : (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          )}
          <span className="min-w-0">
            {aviso.brinde && <span className="block text-xs font-black tracking-wide uppercase opacity-80">Tim-tim!</span>}
            {aviso.texto}
          </span>
        </div>
      )}

      {ultima && (
        <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 md:mx-6 dark:border-emerald-900 dark:bg-emerald-950/40">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="min-w-0 flex-1 text-sm font-semibold">
            Venda {numeroVenda(ultima.numero)} · {brl(totalVenda(ultima))}
          </span>
          <BotaoImprimirVenda venda={ultima} className="btn-primario px-3 py-1.5 text-sm" />
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-lg text-texto-suave hover:bg-superficie-2"
            onClick={() => setUltima(null)}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-4 px-4 md:px-6 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <ChaveRetirada
            retirada={retirada}
            aoMudar={(r) => {
              setRetirada(r);
              setVerHistorico(false);
            }}
            historico={verHistorico}
            aoHistorico={() => setVerHistorico(true)}
          />
          {verHistorico ? (
            <HistoricoVendas aoVer={setVendo} />
          ) : (
            <SeletorProdutos
              retirada={retirada}
              aoEscolher={(p, qtd) => setItens((its) => adicionarItem(its, p, qtd, retirada))}
              aoEscolherMaco={(p) => setItens((its) => adicionarMaco(its, p))}
            />
          )}

          <section className={`mt-8 ${verHistorico ? "hidden" : ""}`}>
            <h2 className="mb-2 text-sm font-bold">Vendas de hoje</h2>
            {vendasHoje.length === 0 ? (
              <p className="card px-4 py-6 text-center text-sm text-texto-suave">Nenhuma venda ainda hoje.</p>
            ) : (
              <ul className="card divide-y divide-borda overflow-hidden">
                {vendasHoje.map((v) => (
                  <li key={v.id}>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-superficie-2"
                      onClick={() => setVendo(v)}
                    >
                      <span className="w-12 shrink-0 text-xs text-texto-suave tabular-nums">
                        {horaBR(v.finalizadaEm ?? v.abertaEm)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {numeroVenda(v.numero)} · {v.clienteNome ?? "Consumidor final"}
                        </span>
                        <span className="block text-xs text-texto-suave">
                          {v.tipo === "COMANDA" ? "Comanda" : "Balcão"}
                          {v.status === "CANCELADA" && " · cancelada"}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 font-bold tabular-nums ${
                          v.status === "CANCELADA" ? "text-texto-suave line-through" : ""
                        }`}
                      >
                        {brl(totalVenda(v))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Carrinho fixo no desktop */}
        <aside className="hidden xl:block">
          <div className="card sticky top-4 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-borda px-4 py-3">
              <ShoppingCart className="h-4 w-4 text-acento" />
              <h2 className="font-bold">Venda atual</h2>
            </div>
            {carrinho}
          </div>
        </aside>
      </div>

      {/* Barra do carrinho no celular */}
      {itens.length > 0 && (
        <button
          className="fixed inset-x-3 bottom-[76px] z-20 flex items-center gap-3 rounded-2xl bg-acento px-4 py-3 text-acento-texto shadow-xl md:bottom-4 md:left-[252px] xl:hidden"
          onClick={() => setCarrinhoAberto(true)}
        >
          {/* key = quantidade: o ícone "pula" a cada item que entra. */}
          <span key={qtdItens} className="animate-pop">
            <ShoppingCart className="h-5 w-5" />
          </span>
          <span className="flex-1 text-left text-sm font-bold">
            {qtdItens} {qtdItens === 1 ? "item" : "itens"} · ver venda
          </span>
          <span className="text-lg font-black tabular-nums">{brl(total)}</span>
        </button>
      )}

      <Modal aberto={carrinhoAberto} aoFechar={() => setCarrinhoAberto(false)} titulo="Venda atual">
        <div className="-mx-5 -my-4">{carrinho}</div>
      </Modal>

      <ModalPagamento
        aberto={pagando}
        titulo="Cobrar"
        aPagar={total}
        permitePrazo={false}
        textoConfirmar="Finalizar venda"
        extra={
          <label className="flex items-center gap-2 rounded-xl border border-borda px-3 py-2.5 text-sm font-semibold">
            <input
              type="checkbox"
              checked={imprimirAoFechar}
              onChange={(e) => mudarImprimir(e.target.checked)}
              className="h-4 w-4 accent-[var(--acento)]"
            />
            <Printer className="h-4 w-4 text-texto-suave" />
            Imprimir cupom ao finalizar
          </label>
        }
        aoFechar={() => setPagando(false)}
        aoConfirmar={cobrar}
      />
      {impressao.area}

      <ModalEscolherComanda
        aberto={escolhendoComanda}
        aoFechar={() => setEscolhendoComanda(false)}
        clientePreSelecionado={cliente}
        aoEscolher={lancarNaComanda}
        aoAbrirNova={abrirComandaNova}
      />

      {vendo && (
        <DetalheVenda
          venda={vendas.find((v) => v.id === vendo.id) ?? vendo}
          aoFechar={() => setVendo(null)}
          aoAbrirComanda={(v) => router.push(`/admin/comandas/ver?id=${v.id}`)}
        />
      )}
    </>
  );
}

function ModalEscolherComanda({
  aberto,
  aoFechar,
  clientePreSelecionado,
  aoEscolher,
  aoAbrirNova,
}: {
  aberto: boolean;
  aoFechar: () => void;
  clientePreSelecionado: Cliente | null;
  aoEscolher: (v: Venda) => Promise<void>;
  aoAbrirNova: (c: Cliente) => Promise<void>;
}) {
  const { vendas } = useDados();
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const abertas = vendas.filter((v) => v.status === "ABERTA");
  const escolhido = cliente ?? clientePreSelecionado;

  async function executar(f: () => Promise<void>) {
    setSalvando(true);
    try {
      await f();
      setCliente(null);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Lançar na comanda">
      <div className="space-y-5">
        <p className="text-xs text-texto-suave">
          Na comanda o estoque só baixa quando ela for finalizada.
        </p>
        {abertas.length > 0 && (
          <div>
            <p className="rotulo">Comandas abertas</p>
            <ul className="card divide-y divide-borda overflow-hidden">
              {abertas.map((c) => (
                <li key={c.id}>
                  <button
                    disabled={salvando}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-superficie-2"
                    onClick={() => executar(() => aoEscolher(c))}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{nomeComanda(c)}</span>
                      <span className="block text-xs text-texto-suave">
                        {numeroVenda(c.numero)} · {c.itens.length} item(ns)
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">{brl(totalVenda(c))}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="space-y-3 rounded-xl border border-dashed border-borda-forte p-3">
          <p className="text-sm font-bold">Abrir comanda nova</p>
          <SeletorCliente clienteId={escolhido?.id ?? ""} aoMudar={setCliente} obrigatorio />
          <button
            className="btn-primario w-full"
            disabled={!escolhido || salvando}
            onClick={() => escolhido && executar(() => aoAbrirNova(escolhido))}
          >
            Abrir comanda {escolhido ? `de ${escolhido.nome}` : ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}

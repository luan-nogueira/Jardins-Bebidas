"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { ListaItens, ModalPagamento, SeletorProdutos, useAcoesVenda } from "@/components/Vendas";
import { BotaoAbaterValor, BotaoPagarSeparado, ResumoConta } from "@/components/PagarSeparado";
import { DetalheVenda } from "@/components/DetalheVenda";
import { BotaoImprimirVenda } from "@/components/CupomVenda";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { brl, dataHoraBR } from "@/lib/format";
import { adicionarItem, numeroVenda, saldoVenda, subtotalItens, totalVenda } from "@/lib/vendas";
import { nomeComanda } from "@/lib/pedidos";
import { ChipPedido, LinhaItemPedido, useNomePessoa } from "@/components/Pedidos";
import { horaBR } from "@/lib/format";
import type { Venda, VendaItem } from "@/lib/types";

export default function VerComandaPage() {
  return (
    <Protegido chave="comandas">
      <Suspense>
        <VerComanda />
      </Suspense>
    </Protegido>
  );
}

function VerComanda() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const { vendaPorId, salvarVenda, carregando, pendenciaDoCliente, pedidos } = useDados();
  const { finalizar, cancelar } = useAcoesVenda();
  const { permissoes } = useAuth();
  const comanda = vendaPorId(id);

  const [adicionando, setAdicionando] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  // Abre só pra ver; editar/cobrar é um toque a mais.
  const [editando, setEditando] = useState(false);
  const nomePessoa = useNomePessoa();
  const daComanda = useMemo(
    () => pedidos.filter((p) => p.vendaId === id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
    [pedidos, id],
  );

  if (carregando) return <p className="p-6 text-sm text-texto-suave">Carregando…</p>;
  if (!comanda) {
    return (
      <div className="p-6">
        <p className="font-semibold">Comanda não encontrada.</p>
        <Link href="/admin/comandas" className="text-sm text-acento">Voltar pras comandas</Link>
      </div>
    );
  }
  if (comanda.status !== "ABERTA") {
    return <DetalheVenda venda={comanda} aoFechar={() => router.push("/admin/comandas")} />;
  }

  const c: Venda = comanda;
  const subtotal = subtotalItens(c.itens);
  const total = totalVenda(c);
  const deveAntes = c.clienteId ? pendenciaDoCliente(c.clienteId) : 0;

  async function salvarItens(itens: VendaItem[]) {
    await salvarVenda({ ...c, itens, atualizadoEm: new Date().toISOString() });
  }

  async function mudarRetirada(retirada: boolean) {
    const { retirada: _, ...resto } = c;
    await salvarVenda({ ...resto, ...(retirada && { retirada: true }), atualizadoEm: new Date().toISOString() });
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 md:px-6 md:pt-8">
        <Link
          href="/admin/comandas"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-borda hover:bg-superficie-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black md:text-2xl">{nomeComanda(c)}</h1>
          <p className="text-xs text-texto-suave">
            Comanda {numeroVenda(c.numero)} · aberta {dataHoraBR(c.abertaEm)}
          </p>
        </div>
        <button className="btn-secundario ml-auto shrink-0" onClick={() => setEditando((e) => !e)}>
          {editando ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          {editando ? "Só visualizar" : "Editar / cobrar"}
        </button>
      </div>

      {!editando && (
        <div className="grid gap-4 px-4 pb-6 md:px-6 xl:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-3">
            <div className="card overflow-hidden">
              <div className="border-b border-borda px-4 py-3">
                <h2 className="font-bold">Itens da comanda</h2>
              </div>
              <ListaItens itens={c.itens} somenteLeitura />
            </div>
            {daComanda.length > 0 && (
              <div className="card overflow-hidden">
                <div className="border-b border-borda px-4 py-3">
                  <h2 className="font-bold">Pedidos pra cozinha</h2>
                </div>
                <ul className="divide-y divide-borda">
                  {daComanda.map((p) => (
                    <li key={p.id} className={`px-4 py-3 ${p.status === "CANCELADO" ? "opacity-60" : ""}`}>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-bold">Pedido {p.sequencia}</span>
                        <ChipPedido status={p.status} />
                        <span className="ml-auto text-xs text-texto-suave">
                          {horaBR(p.criadoEm)}
                          {p.garcom && ` · ${nomePessoa(p.garcom)}`}
                        </span>
                      </div>
                      <ul className="divide-y divide-borda">
                        {p.itens.map((it, i) => (
                          <LinhaItemPedido key={i} item={it} />
                        ))}
                      </ul>
                      {p.obs && <p className="mt-1 text-xs text-texto-suave">Obs.: {p.obs}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <aside>
            <div className="card sticky top-4 space-y-3 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-texto-suave">{c.itens.reduce((s, i) => s + i.qtd, 0)} itens</span>
                <span className="text-2xl font-black text-acento tabular-nums">{brl(total)}</span>
              </div>
              <ResumoConta venda={c} />
              <BotaoImprimirVenda venda={c} className="btn-secundario w-full" />
              <button className="btn-primario w-full" onClick={() => setEditando(true)}>
                <Pencil className="h-4 w-4" />
                Editar / cobrar comanda
              </button>
              {permissoes.excluir && (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 border-t border-borda pt-3 text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400"
                  onClick={() => setCancelando(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Cancelar comanda
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      <div className={`grid gap-4 px-4 md:px-6 xl:grid-cols-[1fr_360px] ${editando ? "" : "hidden"}`}>
        <div className="min-w-0 space-y-3">
          {deveAntes > 0.005 && (
            <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {c.clienteNome} já deve <strong>{brl(deveAntes)}</strong> de comandas anteriores.
            </p>
          )}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-borda px-4 py-3">
              <h2 className="font-bold">Itens da comanda</h2>
              <button className="btn-secundario px-3 py-1.5 text-xs xl:hidden" onClick={() => setAdicionando(true)}>
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
            <ListaItens itens={c.itens} aoMudar={salvarItens} />
          </div>
          <div className="hidden xl:block">
            <h2 className="mb-2 text-sm font-bold">Adicionar produtos</h2>
            <SeletorProdutos
            retirada={!!c.retirada}
            aoMudarRetirada={mudarRetirada}
            aoEscolher={(p, qtd) => salvarItens(adicionarItem(c.itens, p, qtd, !!c.retirada))}
          />
          </div>
        </div>

        <aside>
          <div className="card sticky top-4 space-y-3 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-texto-suave">
                {c.itens.reduce((s, i) => s + i.qtd, 0)} itens
                {c.desconto > 0 && ` · de ${brl(subtotal)}`}
              </span>
              <span className="text-2xl font-black text-acento tabular-nums">{brl(total)}</span>
            </div>
            <ResumoConta venda={c} />
            <BotaoImprimirVenda venda={c} className="btn-secundario w-full" />
            <BotaoPagarSeparado venda={c} />
            <BotaoAbaterValor venda={c} />
            <button
              className="btn-primario w-full"
              disabled={c.itens.length === 0}
              onClick={() => setFechando(true)}
            >
              Finalizar comanda
            </button>
            <p className="text-xs text-texto-suave">
              Ao finalizar, os itens saem do estoque. Dá pra receber tudo, parte, ou
              deixar a prazo com data de vencimento. O desconto (R$ ou %) é dado na hora de finalizar.
            </p>
            {permissoes.excluir && (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 border-t border-borda pt-3 text-xs font-semibold text-red-600 transition hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                onClick={() => setCancelando(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Cancelar comanda
              </button>
            )}
          </div>
        </aside>
      </div>

      <Modal aberto={adicionando} aoFechar={() => setAdicionando(false)} titulo="Adicionar produtos" largura="max-w-2xl">
        <SeletorProdutos
            retirada={!!c.retirada}
            aoMudarRetirada={mudarRetirada}
            aoEscolher={(p, qtd) => salvarItens(adicionarItem(c.itens, p, qtd, !!c.retirada))}
          />
      </Modal>

      <ModalPagamento
        aberto={fechando}
        titulo={`Finalizar comanda de ${nomeComanda(c)}`}
        aPagar={Math.max(0, saldoVenda(vendaPorId(c.id) ?? c))}
        // Mesa sem cliente cadastrado não tem de quem cobrar depois.
        permitePrazo={!!c.clienteId}
        textoConfirmar="Finalizar"
        aoFechar={() => setFechando(false)}
        aoConfirmar={async (r) => {
          await finalizar(vendaPorId(c.id) ?? c, r);
          setFechando(false);
          router.push("/admin/comandas");
        }}
      />

      <Modal
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        titulo="Cancelar comanda"
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setCancelando(false)} disabled={ocupado}>
              Voltar
            </button>
            <button
              className="btn-perigo"
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                try {
                  await cancelar(vendaPorId(c.id) ?? c);
                  setCancelando(false);
                  router.push("/admin/comandas");
                } finally {
                  setOcupado(false);
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              Cancelar comanda
            </button>
          </>
        }
      >
        <p className="text-sm text-texto-suave">
          A comanda de <strong className="text-texto">{nomeComanda(c)}</strong> ({numeroVenda(c.numero)}
          {c.itens.length > 0 ? ` · ${brl(total)}` : ""}) será cancelada. O estoque não muda, porque
          comanda aberta ainda não tinha baixado nada. Ela continua no histórico, na aba
          “Quitadas”, marcada como cancelada.
        </p>
      </Modal>
    </>
  );
}

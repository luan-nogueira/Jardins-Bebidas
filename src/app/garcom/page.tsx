"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BellRing,
  ChefHat,
  CheckCheck,
  Minus,
  Plus,
  Receipt,
  Send,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Cabecalho, Modal } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { BotaoPagarSeparado } from "@/components/PagarSeparado";
import { ListaItens, ModalPagamento, SeletorProdutos, novaVenda, useAcoesVenda } from "@/components/Vendas";
import {
  ChipPedido,
  LinhaItemPedido,
  ModalCancelarPedido,
  useAgora,
  useQuemSou,
  type AlvoCancelamento,
} from "@/components/Pedidos";
import { useDados, novoId } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { brl, horaBR } from "@/lib/format";
import { adicionarItem, numeroVenda, totalVenda, unidadesVenda } from "@/lib/vendas";
import { comStatus, minutosDesde, nomeComanda, pedidoEmAndamento } from "@/lib/pedidos";
import type { Pedido, Produto, Venda } from "@/lib/types";

export default function GarcomPage() {
  return (
    <Protegido chave="comandas">
      <Suspense>
        <GarcomInterno />
      </Suspense>
    </Protegido>
  );
}

function GarcomInterno() {
  const id = useSearchParams().get("id");
  return id ? <MesaAberta id={id} /> : <ListaMesas />;
}

/** Ordena "Mesa 2" antes de "Mesa 10"; comanda sem mesa vai pro fim. */
function compararMesa(a: Venda, b: Venda) {
  if (!a.mesa !== !b.mesa) return a.mesa ? -1 : 1;
  return (a.mesa ?? "").localeCompare(b.mesa ?? "", "pt-BR", { numeric: true }) || a.abertaEm.localeCompare(b.abertaEm);
}

/* ---------------------------------------------------------------------------
   Grade de mesas — verde livre, amarelo ocupada, azul com pedido pronto
   --------------------------------------------------------------------------- */

const CHAVE_TOTAL_MESAS = "jardins:garcom-total-mesas";

function lerTotalMesas() {
  try {
    const n = Number(localStorage.getItem(CHAVE_TOTAL_MESAS));
    return n >= 1 && n <= 500 ? n : 40;
  } catch {
    return 40;
  }
}

function ListaMesas() {
  const router = useRouter();
  const { vendas, pedidos, salvarVenda, proximoNumeroVenda } = useDados();
  const { usuario } = useAuth();
  const quem = useQuemSou();
  const agora = useAgora();
  const [totalMesas, setTotalMesas] = useState(40);
  const [configurando, setConfigurando] = useState(false);
  const [totalDigitado, setTotalDigitado] = useState("");
  const [abrindo, setAbrindo] = useState(false);
  const [mesa, setMesa] = useState("");
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setTotalMesas(lerTotalMesas()), []);

  const abertas = useMemo(
    () => vendas.filter((v) => v.tipo === "COMANDA" && v.status === "ABERTA").sort(compararMesa),
    [vendas],
  );
  const porMesa = useMemo(() => new Map(abertas.filter((v) => v.mesa).map((v) => [v.mesa!, v])), [abertas]);
  // 1..N, mais qualquer mesa aberta fora disso (ex.: "50", "Varanda").
  const numeros = useMemo(() => {
    const base = Array.from({ length: totalMesas }, (_, i) => String(i + 1));
    const extras = [...porMesa.keys()].filter((m) => !base.includes(m));
    return [...base, ...extras];
  }, [totalMesas, porMesa]);
  const semMesa = abertas.filter((v) => !v.mesa);
  const jaAberta = mesa.trim() ? porMesa.get(mesa.trim()) : undefined;
  const prontosTotal = pedidos.filter((p) => p.status === "PRONTO").length;

  function tocar(numero: string) {
    const v = porMesa.get(numero);
    if (v) {
      router.push(`/garcom?id=${v.id}`);
      return;
    }
    setMesa(numero);
    setNome("");
    setAbrindo(true);
  }

  async function abrir() {
    if (!mesa.trim()) return;
    if (jaAberta) {
      router.push(`/garcom?id=${jaAberta.id}`);
      return;
    }
    setSalvando(true);
    try {
      const comanda = novaVenda(
        {
          tipo: "COMANDA",
          itens: [],
          mesa: mesa.trim(),
          clienteNome: nome.trim() || undefined,
          garcom: quem,
          operador: usuario?.email ?? undefined,
        },
        proximoNumeroVenda(),
      );
      await salvarVenda(comanda);
      setAbrindo(false);
      setMesa("");
      setNome("");
      router.push(`/garcom?id=${comanda.id}`);
    } finally {
      setSalvando(false);
    }
  }

  function salvarTotal() {
    const n = Math.round(Number(totalDigitado));
    if (!(n >= 1 && n <= 500)) return;
    setTotalMesas(n);
    try {
      localStorage.setItem(CHAVE_TOTAL_MESAS, String(n));
    } catch {
      // sem armazenamento: vale só até recarregar
    }
    setConfigurando(false);
  }

  return (
    <>
      <Cabecalho
        titulo="Mesas"
        subtitulo={
          prontosTotal > 0 ? (
            <span className="font-bold text-sky-600 dark:text-sky-400">
              {prontosTotal} pedido(s) pronto(s) esperando pra levar
            </span>
          ) : (
            `${abertas.length} ocupada(s) · toque numa mesa`
          )
        }
        acao={
          <div className="flex gap-2">
            <button
              className="btn-secundario px-3"
              onClick={() => {
                setTotalDigitado(String(totalMesas));
                setConfigurando(true);
              }}
              aria-label="Quantidade de mesas"
              title="Quantidade de mesas"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              className="btn-primario"
              onClick={() => {
                setMesa("");
                setNome("");
                setAbrindo(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Outra
            </button>
          </div>
        }
      />

      <div className="mx-4 mb-3 flex flex-wrap gap-3 text-xs font-semibold text-texto-suave md:mx-6">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-500" /> Livre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-400" /> Ocupada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-sky-500" /> Pedido pronto
        </span>
      </div>

      <ul className="mx-4 grid grid-cols-4 gap-2 sm:grid-cols-6 md:mx-6 lg:grid-cols-8 xl:grid-cols-10">
        {numeros.map((n) => {
          const v = porMesa.get(n);
          const dela = v ? pedidos.filter((p) => p.vendaId === v.id) : [];
          const prontos = dela.filter((p) => p.status === "PRONTO").length;
          const naCozinha = dela.some((p) => p.status === "NOVO" || p.status === "PREPARANDO");
          const cor = !v
            ? "bg-emerald-500 text-white hover:bg-emerald-600"
            : prontos > 0
              ? "animate-pulse bg-sky-500 text-white ring-4 ring-sky-400/40"
              : "bg-amber-400 text-amber-950 hover:bg-amber-300";
          return (
            <li key={n}>
              <button
                onClick={() => tocar(n)}
                className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-xl px-1 shadow-sm transition active:scale-95 ${cor}`}
                aria-label={v ? `Mesa ${n}, ocupada${v.clienteNome ? ` por ${v.clienteNome}` : ""}` : `Mesa ${n}, livre`}
              >
                <span className={`leading-none font-black tabular-nums ${n.length > 3 ? "text-sm" : "text-2xl"}`}>{n}</span>
                {v && (
                  <>
                    <span className="mt-1 w-full truncate text-center text-[11px] leading-tight font-bold">
                      {v.clienteNome ?? brl(totalVenda(v))}
                    </span>
                    {v.clienteNome && (
                      <span className="text-[10px] leading-tight font-semibold tabular-nums opacity-80">
                        {brl(totalVenda(v))}
                      </span>
                    )}
                  </>
                )}
                {prontos > 0 && <BellRing className="absolute top-1 right-1 h-3.5 w-3.5" />}
                {!prontos && naCozinha && <ChefHat className="absolute top-1 right-1 h-3.5 w-3.5 opacity-70" />}
              </button>
            </li>
          );
        })}
      </ul>

      {semMesa.length > 0 && (
        <div className="mx-4 mt-6 md:mx-6">
          <h2 className="mb-2 text-sm font-bold">Comandas sem mesa</h2>
          <ul className="card divide-y divide-borda overflow-hidden">
            {semMesa.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/garcom?id=${v.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-superficie-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{nomeComanda(v)}</span>
                    <span className="block text-xs text-texto-suave">
                      {numeroVenda(v.numero)} · {unidadesVenda(v)} itens · há {minutosDesde(v.abertaEm, agora)} min
                    </span>
                  </span>
                  <span className="font-bold tabular-nums">{brl(totalVenda(v))}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        aberto={abrindo}
        aoFechar={() => setAbrindo(false)}
        titulo={mesa.trim() && !jaAberta ? `Abrir mesa ${mesa.trim()}` : "Abrir mesa"}
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setAbrindo(false)}>
              Cancelar
            </button>
            <button className="btn-primario" disabled={!mesa.trim() || salvando} onClick={abrir}>
              {jaAberta ? "Ir pra mesa" : "Abrir mesa"}
            </button>
          </>
        }
      >
        <label className="mb-1.5 block text-xs font-bold text-texto-suave">Número da mesa / comanda</label>
        <input
          className="campo text-center text-2xl font-black"
          inputMode="numeric"
          placeholder="Ex.: 5"
          value={mesa}
          onChange={(e) => setMesa(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && abrir()}
        />
        {jaAberta && (
          <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
            A mesa {jaAberta.mesa} já está aberta ({numeroVenda(jaAberta.numero)}). Toque em “Ir pra mesa”.
          </p>
        )}
        <label className="mt-4 mb-1.5 block text-xs font-bold text-texto-suave">Nome do cliente (opcional)</label>
        <input
          className="campo"
          placeholder="Ex.: Fábio"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && abrir()}
        />
        <p className="mt-3 text-xs text-texto-suave">
          Mesa sem cliente cadastrado paga na hora, ao fechar a conta.
        </p>
      </Modal>

      <Modal
        aberto={configurando}
        aoFechar={() => setConfigurando(false)}
        titulo="Quantidade de mesas"
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setConfigurando(false)}>
              Cancelar
            </button>
            <button className="btn-primario" onClick={salvarTotal}>
              Salvar
            </button>
          </>
        }
      >
        <input
          className="campo text-center text-2xl font-black"
          inputMode="numeric"
          value={totalDigitado}
          onChange={(e) => setTotalDigitado(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && salvarTotal()}
        />
        <p className="mt-2 text-xs text-texto-suave">
          Quantos quadradinhos aparecem na grade (de 1 a 500). Vale pra este aparelho.
        </p>
      </Modal>
    </>
  );
}

/* ---------------------------------------------------------------------------
   Uma mesa: pedidos, novo pedido e conta
   --------------------------------------------------------------------------- */

interface Linha {
  chave: string;
  produto: Produto;
  qtd: number;
  obs: string;
}

function MesaAberta({ id }: { id: string }) {
  const router = useRouter();
  const { vendaPorId, pedidos, salvarPedido, salvarVenda, carregando } = useDados();
  const { finalizar, cancelar } = useAcoesVenda();
  const { permissoes } = useAuth();
  const quem = useQuemSou();
  const agora = useAgora();
  const venda = vendaPorId(id);

  const [montando, setMontando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [carrinho, setCarrinho] = useState<Linha[]>([]);
  const [obsGeral, setObsGeral] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [cancelandoPedido, setCancelandoPedido] = useState<AlvoCancelamento | null>(null);
  const [fechando, setFechando] = useState(false);
  const [cancelandoMesa, setCancelandoMesa] = useState(false);
  const [motivoMesa, setMotivoMesa] = useState("");
  const [vendoConta, setVendoConta] = useState(false);

  const daMesa = useMemo(
    () => pedidos.filter((p) => p.vendaId === id).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
    [pedidos, id],
  );

  if (carregando) return <p className="p-6 text-sm text-texto-suave">Carregando…</p>;
  if (!venda || venda.status !== "ABERTA") {
    return (
      <div className="p-6">
        <p className="font-semibold">{venda ? "Essa mesa já foi fechada." : "Mesa não encontrada."}</p>
        <Link href="/garcom" className="text-sm text-acento">
          Voltar pras mesas
        </Link>
      </div>
    );
  }

  const c: Venda = venda;
  const total = totalVenda(c);
  const qtdCarrinho = carrinho.reduce((s, l) => s + l.qtd, 0);
  const emAndamento = daMesa.filter((p) => p.status === "NOVO" || p.status === "PREPARANDO").length;

  function colocar(p: Produto, qtd = 1) {
    setCarrinho((atual) => {
      const i = atual.findIndex((l) => l.produto.id === p.id && !l.obs);
      if (i >= 0) return atual.map((l, j) => (j === i ? { ...l, qtd: l.qtd + qtd } : l));
      return [...atual, { chave: novoId(), produto: p, qtd, obs: "" }];
    });
  }

  function mudarLinha(chave: string, campos: Partial<Linha>) {
    setCarrinho((atual) =>
      atual.map((l) => (l.chave === chave ? { ...l, ...campos } : l)).filter((l) => l.qtd > 0),
    );
  }

  async function enviar() {
    if (carrinho.length === 0) return;
    setEnviando(true);
    try {
      const agoraIso = new Date().toISOString();
      const pedido: Pedido = {
        id: novoId(),
        vendaId: c.id,
        comandaNumero: c.numero,
        sequencia: daMesa.length + 1,
        mesa: c.mesa,
        clienteNome: c.clienteNome,
        garcom: quem,
        itens: carrinho.map((l) => ({
          produtoId: l.produto.id,
          nome: l.produto.nome,
          categoria: l.produto.categoria || "Sem categoria",
          qtd: l.qtd,
          obs: l.obs.trim() || undefined,
        })),
        obs: obsGeral.trim() || undefined,
        status: "NOVO",
        criadoEm: agoraIso,
        atualizadoEm: agoraIso,
      };
      let itens = (vendaPorId(c.id) ?? c).itens;
      for (const l of carrinho) itens = adicionarItem(itens, l.produto, l.qtd, !!c.retirada);
      await salvarPedido(pedido);
      await salvarVenda({ ...(vendaPorId(c.id) ?? c), itens, atualizadoEm: agoraIso });
      setCarrinho([]);
      setObsGeral("");
      setRevisando(false);
      setMontando(false);
      setAviso(`Pedido ${pedido.sequencia} enviado pra cozinha`);
      setTimeout(() => setAviso(""), 3000);
    } finally {
      setEnviando(false);
    }
  }

  async function cancelarMesa() {
    if (!motivoMesa.trim()) return;
    const atual = vendaPorId(c.id) ?? c;
    for (const p of daMesa.filter(pedidoEmAndamento)) {
      await salvarPedido({
        ...comStatus(p, "CANCELADO"),
        itens: p.itens.map((it) =>
          it.cancelado
            ? it
            : { ...it, cancelado: true, motivoCancelamento: motivoMesa.trim(), canceladoEm: new Date().toISOString(), canceladoPor: quem },
        ),
        motivoCancelamento: motivoMesa.trim(),
        canceladoPor: quem,
      });
    }
    await cancelar({ ...atual, obs: [atual.obs, `Cancelada por ${quem}: ${motivoMesa.trim()}`].filter(Boolean).join(" · ") });
    router.push("/garcom");
  }

  return (
    <>
      {aviso && (
        <div className="animate-toast fixed inset-x-4 top-16 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-xl md:top-6">
          <Send className="h-4 w-4" />
          {aviso}
        </div>
      )}

      <div className="flex items-center gap-3 px-4 pt-5 pb-3 md:px-6 md:pt-8">
        <button
          onClick={() => (montando ? setMontando(false) : router.push("/garcom"))}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-borda hover:bg-superficie-2"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-black md:text-2xl">{nomeComanda(c)}</h1>
          <p className="text-xs text-texto-suave">
            {numeroVenda(c.numero)} · aberta {horaBR(c.abertaEm)}
            {c.garcom ? ` · ${c.garcom}` : ""}
          </p>
        </div>
        <button className="shrink-0 text-right" onClick={() => setVendoConta(true)}>
          <p className="text-[11px] font-bold text-texto-suave uppercase">Conta</p>
          <p className="text-xl font-black text-acento tabular-nums">{brl(total)}</p>
        </button>
      </div>

      {montando ? (
        <div className="px-4 pb-24 md:px-6">
          <p className="mb-2 text-sm font-bold">Toque nos produtos do novo pedido</p>
          <SeletorProdutos aoEscolher={colocar} retirada={!!c.retirada} />
          <div className="fixed inset-x-3 bottom-4 z-20 mx-auto flex max-w-3xl items-center gap-2 pb-[env(safe-area-inset-bottom)]">
            <button
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-borda bg-superficie shadow-xl"
              onClick={() => {
                setCarrinho([]);
                setMontando(false);
              }}
              aria-label="Desistir do pedido"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              disabled={qtdCarrinho === 0}
              onClick={() => setRevisando(true)}
              className="flex h-14 flex-1 items-center gap-3 rounded-2xl bg-acento px-4 text-acento-texto shadow-xl transition disabled:opacity-50"
            >
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-black/20 px-2 text-sm font-black tabular-nums">
                {qtdCarrinho}
              </span>
              <span className="flex-1 text-left font-bold">Revisar e enviar</span>
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 px-4 md:px-6 xl:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-3">
            <button className="btn-primario w-full py-4 text-base" onClick={() => setMontando(true)}>
              <Plus className="h-5 w-5" />
              Novo pedido
            </button>

            {daMesa.length === 0 ? (
              <p className="card px-4 py-10 text-center text-sm text-texto-suave">
                Nenhum pedido ainda. Toque em “Novo pedido” pra lançar.
              </p>
            ) : (
              daMesa.map((p) => {
                const min = minutosDesde(p.criadoEm, agora);
                const podeMexer = p.status !== "CANCELADO" && p.status !== "ENTREGUE";
                return (
                  <div
                    key={p.id}
                    className={`card p-4 ${p.status === "PRONTO" ? "border-emerald-400 ring-4 ring-emerald-400/20" : ""} ${
                      p.status === "CANCELADO" || p.status === "ENTREGUE" ? "opacity-70" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <p className="font-bold">Pedido {p.sequencia}</p>
                      <ChipPedido status={p.status} />
                      <span className="ml-auto text-xs text-texto-suave tabular-nums">
                        {horaBR(p.criadoEm)}
                        {pedidoEmAndamento(p) && ` · ${min} min`}
                      </span>
                    </div>
                    <ul className="divide-y divide-borda">
                      {p.itens.map((it, i) => (
                        <LinhaItemPedido
                          key={i}
                          item={it}
                          aoCancelar={podeMexer ? () => setCancelandoPedido({ pedido: p, indice: i }) : undefined}
                        />
                      ))}
                    </ul>
                    {p.obs && <p className="mt-2 text-xs text-texto-suave">Obs.: {p.obs}</p>}
                    {p.status === "CANCELADO" && p.motivoCancelamento && (
                      <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
                        Pedido cancelado — {p.motivoCancelamento}
                      </p>
                    )}
                    {podeMexer && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-borda pt-3">
                        {p.status === "PRONTO" && (
                          <button className="btn-primario flex-1" onClick={() => salvarPedido(comStatus(p, "ENTREGUE"))}>
                            <CheckCheck className="h-4 w-4" />
                            Levei pra mesa
                          </button>
                        )}
                        <button
                          className="btn-fantasma text-xs text-red-600 dark:text-red-400"
                          onClick={() => setCancelandoPedido({ pedido: p })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Cancelar pedido
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <aside>
            <div className="card sticky top-4 space-y-3 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-texto-suave">{unidadesVenda(c)} itens na conta</span>
                <span className="text-2xl font-black text-acento tabular-nums">{brl(total)}</span>
              </div>
              {emAndamento > 0 && (
                <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  {emAndamento} pedido(s) ainda na cozinha.
                </p>
              )}
              <button className="btn-secundario w-full" onClick={() => setVendoConta(true)}>
                <Receipt className="h-4 w-4" />
                Ver conta
              </button>
              <BotaoPagarSeparado
                venda={c}
                aoPagar={(v) => {
                  setAviso(`Recebido ${brl(totalVenda(v))} separado`);
                  setTimeout(() => setAviso(""), 3000);
                }}
              />
              <button className="btn-primario w-full" disabled={c.itens.length === 0} onClick={() => setFechando(true)}>
                Fechar conta
              </button>
              {permissoes.excluir && (
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1.5 border-t border-borda pt-3 text-xs font-semibold text-red-600 transition hover:text-red-700 dark:text-red-400"
                  onClick={() => setCancelandoMesa(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Cancelar mesa inteira
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Revisar o pedido antes de mandar: quantidade e observação por item */}
      <Modal
        aberto={revisando}
        aoFechar={() => setRevisando(false)}
        titulo={`Novo pedido · ${nomeComanda(c)}`}
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setRevisando(false)}>
              Adicionar mais
            </button>
            <button className="btn-primario" disabled={enviando || carrinho.length === 0} onClick={enviar}>
              <Send className="h-4 w-4" />
              Enviar pra cozinha
            </button>
          </>
        }
      >
        <ul className="space-y-3">
          {carrinho.map((l) => (
            <li key={l.chave} className="rounded-xl border border-borda p-3">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-semibold">{l.produto.nome}</p>
                <button
                  className="grid h-9 w-9 place-items-center rounded-lg border border-borda"
                  onClick={() => mudarLinha(l.chave, { qtd: l.qtd - 1 })}
                  aria-label="Menos"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-7 text-center font-black tabular-nums">{l.qtd}</span>
                <button
                  className="grid h-9 w-9 place-items-center rounded-lg border border-borda"
                  onClick={() => mudarLinha(l.chave, { qtd: l.qtd + 1 })}
                  aria-label="Mais"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <input
                className="campo mt-2 py-2 text-sm"
                placeholder="Observação (sem gelo, bem passado…)"
                value={l.obs}
                onChange={(e) => mudarLinha(l.chave, { obs: e.target.value })}
              />
            </li>
          ))}
        </ul>
        <label className="mt-4 mb-1.5 block text-xs font-bold text-texto-suave">Observação do pedido</label>
        <input
          className="campo"
          placeholder="Ex.: servir junto com a porção"
          value={obsGeral}
          onChange={(e) => setObsGeral(e.target.value)}
        />
      </Modal>

      <Modal aberto={vendoConta} aoFechar={() => setVendoConta(false)} titulo={`Conta · ${nomeComanda(c)}`}>
        <ListaItens itens={c.itens} somenteLeitura />
        <div className="mt-3 flex items-baseline justify-between border-t border-borda pt-3">
          <span className="text-sm text-texto-suave">Total</span>
          <span className="text-2xl font-black text-acento tabular-nums">{brl(total)}</span>
        </div>
      </Modal>

      <ModalCancelarPedido alvo={cancelandoPedido} aoFechar={() => setCancelandoPedido(null)} />

      <ModalPagamento
        aberto={fechando}
        titulo={`Fechar conta · ${nomeComanda(c)}`}
        aPagar={totalVenda(vendaPorId(c.id) ?? c)}
        permitePrazo={!!c.clienteId}
        textoConfirmar="Fechar conta"
        aoFechar={() => setFechando(false)}
        aoConfirmar={async (r) => {
          await finalizar(vendaPorId(c.id) ?? c, r);
          setFechando(false);
          router.push("/garcom");
        }}
      />

      <Modal
        aberto={cancelandoMesa}
        aoFechar={() => setCancelandoMesa(false)}
        titulo="Cancelar mesa inteira"
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setCancelandoMesa(false)}>
              Voltar
            </button>
            <button className="btn-perigo" disabled={!motivoMesa.trim()} onClick={cancelarMesa}>
              <Trash2 className="h-4 w-4" />
              Cancelar mesa
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-texto-suave">
          A conta de <strong className="text-texto">{nomeComanda(c)}</strong> ({brl(total)}) é cancelada e os
          pedidos que ainda estão na cozinha também. Fica no histórico com o motivo.
        </p>
        <input
          className="campo"
          placeholder="Motivo do cancelamento"
          value={motivoMesa}
          onChange={(e) => setMotivoMesa(e.target.value)}
        />
      </Modal>
    </>
  );
}

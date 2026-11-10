"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  BellRing,
  ChefHat,
  CheckCircle2,
  Clock,
  Flame,
  Maximize,
  Minimize,
  Printer,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Cabecalho, Metrica, Vazio } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { ChipPedido, LinhaItemPedido, ModalCancelarPedido, useAgora, type AlvoCancelamento } from "@/components/Pedidos";
import { useImpressaoCozinha, type Cupom } from "@/components/CupomCozinha";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { dataBR, horaBR, hojeISO } from "@/lib/format";
import { diaLocal, numeroVenda } from "@/lib/vendas";
import { ROTULO_STATUS_PEDIDO, comStatus, itensAtivos, minutosDesde, nivelEspera } from "@/lib/pedidos";
import type { Pedido, PedidoStatus } from "@/lib/types";

export default function CozinhaPage() {
  return (
    <Protegido chave="cozinha">
      <CozinhaInterno />
    </Protegido>
  );
}

type Aba = "painel" | "historico";

function CozinhaInterno() {
  const [aba, setAba] = useState<Aba>("painel");
  return (
    <>
      <div className="px-4 pt-5 md:px-6 md:pt-8">
        <div className="grid max-w-xs grid-cols-2 gap-1 rounded-xl bg-superficie-2 p-1">
          {(
            [
              ["painel", "Painel"],
              ["historico", "Histórico"],
            ] as [Aba, string][]
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={`rounded-lg py-2 text-sm font-bold transition ${aba === chave ? "bg-superficie shadow-sm" : "text-texto-suave"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>
      {aba === "painel" ? <Painel /> : <Historico />}
    </>
  );
}

/* ---------------------------------------------------------------------------
   Som — alarme alto (onda quadrada + compressor), gerado no navegador
   --------------------------------------------------------------------------- */

function tocarNotas(ctx: AudioContext, notas: number[], passo: number, pausaMeio = 0) {
  const t0 = ctx.currentTime + 0.02;
  const saida = ctx.createDynamicsCompressor();
  saida.threshold.value = -10;
  saida.connect(ctx.destination);
  notas.forEach((freq, i) => {
    const t = t0 + i * passo + (pausaMeio && i >= notas.length / 2 ? pausaMeio : 0);
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(1, t + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + passo * 0.95);
    osc.connect(ganho).connect(saida);
    osc.start(t);
    osc.stop(t + passo);
  });
}

/** Pedido novo: dois arpejos subindo, bem alto. */
const alarmePedido = (ctx: AudioContext) => tocarNotas(ctx, [880, 1175, 1568, 2093, 880, 1175, 1568, 2093], 0.14, 0.3);
/** Lembrete de pedido parado / cancelamento: três bipes. */
const alarmeCurto = (ctx: AudioContext) => tocarNotas(ctx, [1568, 1568, 1568], 0.18);

/* ---------------------------------------------------------------------------
   Preferências deste aparelho (som e impressão automática)
   --------------------------------------------------------------------------- */

const CHAVE_PREFS = "jardins:cozinha-prefs";

function lerPrefs(): { som: boolean; autoImprimir: boolean } {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PREFS) ?? "{}");
    return { som: !!p.som, autoImprimir: !!p.autoImprimir };
  } catch {
    return { som: false, autoImprimir: false };
  }
}

function gravarPrefs(prefs: { som: boolean; autoImprimir: boolean }) {
  try {
    localStorage.setItem(CHAVE_PREFS, JSON.stringify(prefs));
  } catch {
    // sem armazenamento: vale até recarregar
  }
}

/* ---------------------------------------------------------------------------
   Painel — Novos → Em preparo → Prontos
   --------------------------------------------------------------------------- */

const COLUNAS: { status: PedidoStatus; titulo: string; Icone: typeof ChefHat; cor: string }[] = [
  { status: "NOVO", titulo: "Novos", Icone: BellRing, cor: "text-blue-600 dark:text-blue-400" },
  { status: "PREPARANDO", titulo: "Em preparo", Icone: Flame, cor: "text-amber-600 dark:text-amber-400" },
  { status: "PRONTO", titulo: "Prontos — esperando o garçom", Icone: CheckCircle2, cor: "text-emerald-600 dark:text-emerald-400" },
];

const BORDA_ESPERA = {
  ok: "border-l-emerald-500",
  atencao: "border-l-amber-500",
  atrasado: "border-l-red-500",
};
const TEXTO_ESPERA = {
  ok: "text-emerald-600 dark:text-emerald-400",
  atencao: "text-amber-600 dark:text-amber-400",
  atrasado: "text-red-600 dark:text-red-400",
};

function nomeDoPedido(p: Pedido) {
  return p.mesa ? `Mesa ${p.mesa}` : (p.clienteNome ?? "Balcão");
}

function Painel() {
  const { pedidos, salvarPedido, carregando } = useDados();
  const { permissoes } = useAuth();
  const agora = useAgora(15_000);
  const [colunaCelular, setColunaCelular] = useState<PedidoStatus>("NOVO");
  const [cancelando, setCancelando] = useState<AlvoCancelamento | null>(null);
  const [som, setSom] = useState(false);
  const [autoImprimir, setAutoImprimir] = useState(false);
  const [modoTela, setModoTela] = useState(false);
  const [alerta, setAlerta] = useState<{ titulo: string; detalhe: string; cor: string } | null>(null);
  const { imprimir, area } = useImpressaoCozinha();

  const audio = useRef<AudioContext | null>(null);
  const somRef = useRef(false);
  const autoRef = useRef(false);
  const vistos = useRef<Set<string> | null>(null);
  const cancelVistos = useRef<Set<string>>(new Set());
  const pedidosRef = useRef(pedidos);
  pedidosRef.current = pedidos;
  somRef.current = som;
  autoRef.current = autoImprimir;

  const ativos = useMemo(
    () =>
      pedidos
        .filter((p) => p.status === "NOVO" || p.status === "PREPARANDO" || p.status === "PRONTO")
        .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [pedidos],
  );

  /** O navegador só libera som depois de um toque na tela. */
  const garantirAudio = useCallback(() => {
    audio.current ??= new AudioContext();
    void audio.current.resume();
    return audio.current;
  }, []);

  const tocar = useCallback((tipo: "pedido" | "curto") => {
    const ctx = audio.current;
    if (!somRef.current || !ctx || ctx.state !== "running") return;
    (tipo === "pedido" ? alarmePedido : alarmeCurto)(ctx);
  }, []);

  // Preferências salvas; o som volta a funcionar no primeiro toque na tela.
  useEffect(() => {
    const prefs = lerPrefs();
    setSom(prefs.som);
    setAutoImprimir(prefs.autoImprimir);
    if (!prefs.som) return;
    const destravar = () => garantirAudio();
    window.addEventListener("pointerdown", destravar, { once: true });
    return () => window.removeEventListener("pointerdown", destravar);
  }, [garantirAudio]);

  const imprimirPedidos = useCallback(
    (lista: Pedido[]) => {
      const agoraIso = new Date().toISOString();
      imprimir(
        lista.map((p) => ({ chave: `${p.id}-${agoraIso}`, pedido: p, tipo: "PEDIDO", itens: itensAtivos(p) }) satisfies Cupom),
      );
      for (const p of lista) if (!p.impressoEm) void salvarPedido({ ...p, impressoEm: agoraIso });
    },
    [imprimir, salvarPedido],
  );

  // Chegou pedido / item cancelado: alarme, tela piscando, vibração e cupom.
  useEffect(() => {
    if (carregando) return;
    const chaveCancel = pedidos.flatMap((p) => p.itens.flatMap((it, i) => (it.cancelado ? [`${p.id}:${i}`] : [])));
    if (vistos.current === null) {
      vistos.current = new Set(pedidos.map((p) => p.id));
      cancelVistos.current = new Set(chaveCancel);
      return;
    }
    const chegaram = pedidos.filter((p) => p.status === "NOVO" && !vistos.current!.has(p.id));
    pedidos.forEach((p) => vistos.current!.add(p.id));

    const cancelNovos = pedidos.flatMap((p) => {
      const itens = p.itens.filter((it, i) => it.cancelado && !cancelVistos.current.has(`${p.id}:${i}`));
      return itens.length ? [{ pedido: p, itens }] : [];
    });
    chaveCancel.forEach((k) => cancelVistos.current.add(k));

    if (chegaram.length) {
      tocar("pedido");
      navigator.vibrate?.([400, 150, 400, 150, 400]);
      setAlerta({
        titulo: chegaram.length > 1 ? `${chegaram.length} NOVOS PEDIDOS` : "NOVO PEDIDO",
        detalhe: chegaram.map(nomeDoPedido).join(" · "),
        cor: "bg-blue-600",
      });
      if (autoRef.current) imprimirPedidos(chegaram.filter((p) => !p.impressoEm));
    } else if (cancelNovos.length) {
      tocar("curto");
      navigator.vibrate?.([600]);
      setAlerta({
        titulo: "CANCELADO",
        detalhe: cancelNovos.map((c) => `${nomeDoPedido(c.pedido)}: ${c.itens.map((i) => `${i.qtd}× ${i.nome}`).join(", ")}`).join(" · "),
        cor: "bg-red-600",
      });
    }
    // Cupom de cancelamento só pra pedido que já tinha saído impresso.
    if (autoRef.current) {
      const agoraIso = new Date().toISOString();
      imprimir(
        cancelNovos
          .filter((c) => c.pedido.impressoEm)
          .map((c) => ({ chave: `${c.pedido.id}-cancel-${agoraIso}`, pedido: c.pedido, tipo: "CANCELAMENTO", itens: c.itens })),
      );
    }
  }, [pedidos, carregando, tocar, imprimir, imprimirPedidos]);

  // O alerta some sozinho.
  useEffect(() => {
    if (!alerta) return;
    const t = setTimeout(() => setAlerta(null), 7000);
    return () => clearTimeout(t);
  }, [alerta]);

  // Lembrete: pedido parado em "Novos" há mais de 2 min toca de novo a cada 45s.
  useEffect(() => {
    const t = setInterval(() => {
      const limite = new Date(Date.now() - 2 * 60_000).toISOString();
      if (pedidosRef.current.some((p) => p.status === "NOVO" && p.criadoEm < limite)) tocar("curto");
    }, 45_000);
    return () => clearInterval(t);
  }, [tocar]);

  // Tela cheia: sai do modo quando o navegador sai (tecla Esc).
  useEffect(() => {
    const aoMudar = () => {
      if (!document.fullscreenElement) setModoTela(false);
    };
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  // No modo tela cheia a tela do tablet não apaga sozinha.
  useEffect(() => {
    if (!modoTela || !("wakeLock" in navigator)) return;
    let trava: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((t) => (trava = t), () => {});
    return () => void trava?.release();
  }, [modoTela]);

  function alternarSom() {
    const novo = !som;
    setSom(novo);
    somRef.current = novo;
    gravarPrefs({ som: novo, autoImprimir });
    if (novo) alarmePedido(garantirAudio());
  }

  function alternarAuto() {
    const novo = !autoImprimir;
    setAutoImprimir(novo);
    gravarPrefs({ som, autoImprimir: novo });
  }

  function alternarTela() {
    if (modoTela) {
      setModoTela(false);
      if (document.fullscreenElement) void document.exitFullscreen();
    } else {
      setModoTela(true);
      // iPad não tem tela cheia de verdade: aí fica só o modo sem menu.
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
  }

  // Cancelamentos dos últimos 20 min — pra cozinha parar de preparar.
  const cancelamentos = useMemo(() => {
    const desde = new Date(agora - 20 * 60_000).toISOString();
    return pedidos.flatMap((p) =>
      p.itens.filter((i) => i.cancelado && (i.canceladoEm ?? "") >= desde).map((i) => ({ pedido: p, item: i })),
    );
  }, [pedidos, agora]);

  const mover = (p: Pedido, status: PedidoStatus) => salvarPedido(comStatus(p, status));
  const voltar: Partial<Record<PedidoStatus, PedidoStatus>> = { PREPARANDO: "NOVO", PRONTO: "PREPARANDO" };
  const contagem = (s: PedidoStatus) => ativos.filter((p) => p.status === s).length;

  const botoes = (
    <div className="flex flex-wrap gap-2">
      <button className={som ? "btn-primario" : "btn-secundario"} onClick={alternarSom} title="Alarme quando chegar pedido">
        {som ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        {som ? "Som ligado" : "Ligar som"}
      </button>
      <button
        className={autoImprimir ? "btn-primario" : "btn-secundario"}
        onClick={alternarAuto}
        title="Imprime o cupom sozinho quando o pedido chega"
      >
        <Printer className="h-4 w-4" />
        {autoImprimir ? "Imprime sozinho" : "Imprimir automático"}
      </button>
      <button className={modoTela ? "btn-primario" : "btn-secundario"} onClick={alternarTela}>
        {modoTela ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        {modoTela ? "Sair da tela cheia" : "Tela cheia"}
      </button>
    </div>
  );

  return (
    <div className={modoTela ? "fixed inset-0 z-[60] overflow-y-auto bg-fundo pb-6" : ""}>
      {modoTela ? (
        <div className="fundo-barra sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-barra-texto shadow-lg md:px-6">
          <p className="flex items-center gap-2 text-2xl font-black">
            <ChefHat className="h-7 w-7" />
            COZINHA
          </p>
          <p className="text-3xl font-black tabular-nums">{horaBR(new Date(agora).toISOString())}</p>
          <div className="flex gap-4 text-sm font-bold">
            <span className="text-blue-300">{contagem("NOVO")} novos</span>
            <span className="text-amber-300">{contagem("PREPARANDO")} em preparo</span>
            <span className="text-emerald-300">{contagem("PRONTO")} prontos</span>
          </div>
          <div className="ml-auto">{botoes}</div>
        </div>
      ) : (
        <Cabecalho titulo="Cozinha" subtitulo={`${ativos.length} pedido(s) em andamento · atualiza sozinho`} acao={botoes} />
      )}

      {cancelamentos.length > 0 && (
        <div
          className={`mx-4 mb-4 space-y-1 rounded-2xl border-2 border-red-400 bg-red-50 p-3 md:mx-6 dark:border-red-800 dark:bg-red-950/40 ${
            modoTela ? "mt-4" : ""
          }`}
        >
          <p className="flex items-center gap-1.5 text-sm font-black text-red-700 dark:text-red-300">
            <Ban className="h-4 w-4" />
            Cancelados — não preparar
          </p>
          {cancelamentos.map(({ pedido, item }, i) => (
            <p key={i} className={`text-red-800 dark:text-red-200 ${modoTela ? "text-lg" : "text-sm"}`}>
              <strong>{nomeDoPedido(pedido)}</strong> · {item.qtd}× {item.nome}
              {item.motivoCancelamento && <span className="text-red-600/80 dark:text-red-300/70"> — {item.motivoCancelamento}</span>}
              <span className="text-xs text-red-600/70"> · {horaBR(item.canceladoEm ?? "")}</span>
            </p>
          ))}
        </div>
      )}

      {/* Celular: uma coluna por vez */}
      <div className={`mx-4 mb-3 grid grid-cols-3 gap-1 rounded-xl bg-superficie-2 p-1 md:hidden ${modoTela ? "mt-4" : ""}`}>
        {COLUNAS.map(({ status }) => (
          <button
            key={status}
            onClick={() => setColunaCelular(status)}
            className={`rounded-lg py-2 text-xs font-bold transition ${colunaCelular === status ? "bg-superficie shadow-sm" : "text-texto-suave"}`}
          >
            {ROTULO_STATUS_PEDIDO[status]} ({contagem(status)})
          </button>
        ))}
      </div>

      {!carregando && ativos.length === 0 ? (
        <div className={modoTela ? "mt-6" : ""}>
          <Vazio Icone={ChefHat} titulo="Nenhum pedido agora" descricao="Os pedidos que o garçom enviar aparecem aqui na hora." />
        </div>
      ) : (
        <div className={`grid gap-4 px-4 md:grid-cols-3 md:px-6 ${modoTela ? "mt-4 lg:[zoom:1.2]" : ""}`}>
          {COLUNAS.map(({ status, titulo, Icone, cor }) => {
            const daColuna = ativos.filter((p) => p.status === status);
            return (
              <section key={status} className={colunaCelular === status ? "" : "hidden md:block"}>
                <h2 className={`mb-2 hidden items-center gap-1.5 font-black md:flex ${modoTela ? "text-lg" : "text-sm"} ${cor}`}>
                  <Icone className="h-4 w-4" />
                  {titulo}
                  <span className="ml-auto rounded-full bg-superficie-2 px-2 py-0.5 text-xs text-texto tabular-nums">
                    {daColuna.length}
                  </span>
                </h2>
                <div className="space-y-3">
                  {daColuna.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-borda px-4 py-8 text-center text-xs text-texto-suave">
                      Nada aqui
                    </p>
                  )}
                  {daColuna.map((p) => {
                    const min = minutosDesde(p.criadoEm, agora);
                    const nivel = status === "PRONTO" ? "ok" : nivelEspera(min);
                    const recente = agora - new Date(p.criadoEm).getTime() < 90_000 && status === "NOVO";
                    return (
                      <article
                        key={p.id}
                        className={`card animate-entrar border-l-[6px] p-4 ${BORDA_ESPERA[nivel]} ${
                          recente ? "ring-4 ring-blue-500 shadow-[0_0_0_10px_rgb(59_130_246/0.25)]" : ""
                        }`}
                      >
                        <header className="mb-2 flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-3xl leading-none font-black">{nomeDoPedido(p)}</p>
                            <p className="mt-1 text-xs text-texto-suave">
                              Comanda {numeroVenda(p.comandaNumero)} · pedido {p.sequencia}
                              {p.garcom ? ` · ${p.garcom}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`flex items-center justify-end gap-1 text-xl font-black tabular-nums ${TEXTO_ESPERA[nivel]}`}>
                              <Clock className="h-4 w-4" />
                              {min} min
                            </p>
                            <p className="text-[11px] text-texto-suave">{horaBR(p.criadoEm)}</p>
                          </div>
                        </header>
                        <ul className="divide-y divide-borda border-t border-borda">
                          {p.itens.map((it, i) => (
                            <LinhaItemPedido
                              key={i}
                              item={it}
                              grande
                              aoCancelar={permissoes.comandas ? () => setCancelando({ pedido: p, indice: i }) : undefined}
                            />
                          ))}
                        </ul>
                        {p.obs && (
                          <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1.5 text-sm font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                            {p.obs}
                          </p>
                        )}
                        <div className="mt-3 flex gap-2">
                          {voltar[status] && (
                            <button
                              className="btn-secundario px-3"
                              onClick={() => mover(p, voltar[status]!)}
                              title="Voltar etapa"
                              aria-label="Voltar etapa"
                            >
                              <Undo2 className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            className={`btn-secundario px-3 ${p.impressoEm ? "" : "border-acento text-acento"}`}
                            onClick={() => imprimirPedidos([p])}
                            title={p.impressoEm ? `Impresso às ${horaBR(p.impressoEm)} — imprimir de novo` : "Imprimir cupom"}
                            aria-label="Imprimir cupom"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                          {status === "NOVO" && (
                            <button
                              className="btn flex-1 bg-amber-500 py-3 text-base font-black text-white hover:bg-amber-600"
                              onClick={() => mover(p, "PREPARANDO")}
                            >
                              <Flame className="h-5 w-5" />
                              Começar preparo
                            </button>
                          )}
                          {status === "PREPARANDO" && (
                            <button
                              className="btn flex-1 bg-emerald-600 py-3 text-base font-black text-white hover:bg-emerald-700"
                              onClick={() => mover(p, "PRONTO")}
                            >
                              <CheckCircle2 className="h-5 w-5" />
                              Pronto!
                            </button>
                          )}
                          {status === "PRONTO" && (
                            <button className="btn-secundario flex-1 py-3" onClick={() => mover(p, "ENTREGUE")}>
                              Saiu pra mesa
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Aviso que toma a tela quando chega pedido ou cancelamento */}
      {alerta && (
        <button
          type="button"
          onClick={() => setAlerta(null)}
          className={`fixed inset-0 z-[90] flex animate-aparecer flex-col items-center justify-center gap-4 p-6 text-center text-white ${alerta.cor}`}
        >
          <span className="absolute inset-0 animate-pulse bg-white/15" aria-hidden />
          <BellRing className="relative h-20 w-20 animate-bounce" />
          <span className="relative text-5xl font-black tracking-tight md:text-7xl">{alerta.titulo}</span>
          <span className="relative max-w-3xl text-2xl font-bold md:text-4xl">{alerta.detalhe}</span>
          <span className="relative mt-4 text-sm font-semibold opacity-80">Toque pra fechar</span>
        </button>
      )}

      {area}
      <ModalCancelarPedido alvo={cancelando} aoFechar={() => setCancelando(null)} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Histórico — todos os pedidos do dia, com filtros e cancelamentos
   --------------------------------------------------------------------------- */

function Historico() {
  const { pedidos } = useDados();
  const [dia, setDia] = useState(hojeISO());
  const [garcom, setGarcom] = useState("");
  const [status, setStatus] = useState<PedidoStatus | "">("");
  const [mesa, setMesa] = useState("");

  const doDia = useMemo(() => pedidos.filter((p) => diaLocal(p.criadoEm) === dia), [pedidos, dia]);
  const garcons = [...new Set(doDia.map((p) => p.garcom).filter(Boolean))] as string[];
  const lista = doDia.filter(
    (p) =>
      (!garcom || p.garcom === garcom) &&
      (!status || p.status === status) &&
      (!mesa || (p.mesa ?? "") === mesa.trim()),
  );

  const comTempo = doDia.filter((p) => p.prontoEm);
  const tempoMedio = comTempo.length
    ? Math.round(
        comTempo.reduce((s, p) => s + (new Date(p.prontoEm!).getTime() - new Date(p.criadoEm).getTime()), 0) /
          comTempo.length /
          60000,
      )
    : 0;
  const itensCancelados = doDia.flatMap((p) => p.itens.filter((i) => i.cancelado)).length;

  return (
    <>
      <Cabecalho titulo="Histórico de pedidos" subtitulo={dataBR(dia)} />
      <div className="mb-4 grid grid-cols-3 gap-3 px-4 md:px-6">
        <Metrica rotulo="Pedidos" valor={String(doDia.length)} />
        <Metrica rotulo="Tempo médio" valor={`${tempoMedio} min`} detalhe="até ficar pronto" destaque />
        <Metrica rotulo="Itens cancelados" valor={String(itensCancelados)} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 px-4 md:grid-cols-4 md:px-6">
        <input type="date" className="campo" value={dia} onChange={(e) => setDia(e.target.value)} />
        <input className="campo" placeholder="Mesa" inputMode="numeric" value={mesa} onChange={(e) => setMesa(e.target.value)} />
        <select className="campo" value={garcom} onChange={(e) => setGarcom(e.target.value)}>
          <option value="">Todos os garçons</option>
          {garcons.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select className="campo" value={status} onChange={(e) => setStatus(e.target.value as PedidoStatus | "")}>
          <option value="">Todos os status</option>
          {(Object.keys(ROTULO_STATUS_PEDIDO) as PedidoStatus[]).map((s) => (
            <option key={s} value={s}>
              {ROTULO_STATUS_PEDIDO[s]}
            </option>
          ))}
        </select>
      </div>

      {lista.length === 0 ? (
        <Vazio Icone={ChefHat} titulo="Nenhum pedido nesse filtro" />
      ) : (
        <ul className="mx-4 space-y-2 md:mx-6">
          {lista.map((p) => {
            const preparo = p.prontoEm ? minutosDesde(p.criadoEm, new Date(p.prontoEm).getTime()) : null;
            return (
              <li key={p.id} className="card p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="font-bold">
                    {p.mesa ? `Mesa ${p.mesa}` : (p.clienteNome ?? "—")} · {numeroVenda(p.comandaNumero)} · pedido {p.sequencia}
                  </p>
                  <ChipPedido status={p.status} />
                  <span className="ml-auto text-xs text-texto-suave tabular-nums">
                    {horaBR(p.criadoEm)}
                    {preparo !== null && ` · pronto em ${preparo} min`}
                  </span>
                </div>
                <p className="mb-1 text-xs text-texto-suave">
                  {p.garcom ?? "—"} · {itensAtivos(p).reduce((s, i) => s + i.qtd, 0)} item(ns)
                </p>
                <ul className="divide-y divide-borda">
                  {p.itens.map((it, i) => (
                    <LinhaItemPedido key={i} item={it} />
                  ))}
                </ul>
                {p.status === "CANCELADO" && p.motivoCancelamento && (
                  <p className="mt-1 text-xs font-semibold text-red-600 dark:text-red-400">
                    Pedido cancelado por {p.canceladoPor ?? "—"} — {p.motivoCancelamento}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

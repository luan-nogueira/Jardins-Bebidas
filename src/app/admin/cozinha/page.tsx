"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  BellRing,
  ChefHat,
  CheckCircle2,
  Clock,
  Flame,
  Maximize,
  Minimize,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Cabecalho, Metrica, Vazio } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { ChipPedido, LinhaItemPedido, ModalCancelarPedido, useAgora, type AlvoCancelamento } from "@/components/Pedidos";
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

/** Bipe curto — sem arquivo de som, gerado no navegador. */
function bipar(ctx: AudioContext) {
  for (const [atraso, freq] of [
    [0, 880],
    [0.18, 1175],
  ]) {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.25, ctx.currentTime + atraso);
    ganho.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + atraso + 0.3);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(ctx.currentTime + atraso);
    osc.stop(ctx.currentTime + atraso + 0.3);
  }
}

function Painel() {
  const { pedidos, salvarPedido, carregando } = useDados();
  const { permissoes } = useAuth();
  const agora = useAgora(15_000);
  const [colunaCelular, setColunaCelular] = useState<PedidoStatus>("NOVO");
  const [cancelando, setCancelando] = useState<AlvoCancelamento | null>(null);
  const [som, setSom] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const vistos = useRef<Set<string> | null>(null);

  const ativos = useMemo(
    () =>
      pedidos
        .filter((p) => p.status === "NOVO" || p.status === "PREPARANDO" || p.status === "PRONTO")
        .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    [pedidos],
  );

  // Pedido novo chegou: bipe (se ligado).
  useEffect(() => {
    if (carregando) return;
    const novos = pedidos.filter((p) => p.status === "NOVO").map((p) => p.id);
    if (vistos.current === null) {
      vistos.current = new Set(novos);
      return;
    }
    const chegou = novos.some((id) => !vistos.current!.has(id));
    novos.forEach((id) => vistos.current!.add(id));
    if (chegou && som && audio.current) bipar(audio.current);
  }, [pedidos, carregando, som]);

  useEffect(() => {
    const aoMudar = () => setTelaCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  function alternarSom() {
    if (!som) {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      bipar(audio.current);
    }
    setSom(!som);
  }

  function alternarTelaCheia() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  }

  // Cancelamentos dos últimos 20 min — pra cozinha parar de preparar.
  const cancelamentos = useMemo(() => {
    const desde = new Date(agora - 20 * 60_000).toISOString();
    return pedidos.flatMap((p) =>
      p.itens
        .filter((i) => i.cancelado && (i.canceladoEm ?? "") >= desde)
        .map((i) => ({ pedido: p, item: i })),
    );
  }, [pedidos, agora]);

  const mover = (p: Pedido, status: PedidoStatus) => salvarPedido(comStatus(p, status));
  const voltar: Partial<Record<PedidoStatus, PedidoStatus>> = { PREPARANDO: "NOVO", PRONTO: "PREPARANDO" };

  return (
    <>
      <Cabecalho
        titulo="Cozinha"
        subtitulo={`${ativos.length} pedido(s) em andamento · atualiza sozinho`}
        acao={
          <div className="flex gap-2">
            <button className={som ? "btn-primario" : "btn-secundario"} onClick={alternarSom} title="Bipe quando chegar pedido">
              {som ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {som ? "Som ligado" : "Ligar som"}
            </button>
            <button className="btn-secundario" onClick={alternarTelaCheia} title="Tela cheia">
              {telaCheia ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        }
      />

      {cancelamentos.length > 0 && (
        <div className="mx-4 mb-4 space-y-1 rounded-2xl border-2 border-red-400 bg-red-50 p-3 md:mx-6 dark:border-red-800 dark:bg-red-950/40">
          <p className="flex items-center gap-1.5 text-sm font-black text-red-700 dark:text-red-300">
            <Ban className="h-4 w-4" />
            Cancelados — não preparar
          </p>
          {cancelamentos.map(({ pedido, item }, i) => (
            <p key={i} className="text-sm text-red-800 dark:text-red-200">
              <strong>
                {pedido.mesa ? `Mesa ${pedido.mesa}` : numeroVenda(pedido.comandaNumero)}
              </strong>{" "}
              · {item.qtd}× {item.nome}
              {item.motivoCancelamento && <span className="text-red-600/80 dark:text-red-300/70"> — {item.motivoCancelamento}</span>}
              <span className="text-xs text-red-600/70"> · {horaBR(item.canceladoEm ?? "")}</span>
            </p>
          ))}
        </div>
      )}

      {/* Celular: uma coluna por vez */}
      <div className="mx-4 mb-3 grid grid-cols-3 gap-1 rounded-xl bg-superficie-2 p-1 md:hidden">
        {COLUNAS.map(({ status }) => (
          <button
            key={status}
            onClick={() => setColunaCelular(status)}
            className={`rounded-lg py-2 text-xs font-bold transition ${colunaCelular === status ? "bg-superficie shadow-sm" : "text-texto-suave"}`}
          >
            {ROTULO_STATUS_PEDIDO[status]} ({ativos.filter((p) => p.status === status).length})
          </button>
        ))}
      </div>

      {!carregando && ativos.length === 0 ? (
        <Vazio Icone={ChefHat} titulo="Nenhum pedido agora" descricao="Os pedidos que o garçom enviar aparecem aqui na hora." />
      ) : (
        <div className="grid gap-4 px-4 md:grid-cols-3 md:px-6">
          {COLUNAS.map(({ status, titulo, Icone, cor }) => {
            const daColuna = ativos.filter((p) => p.status === status);
            return (
              <section key={status} className={colunaCelular === status ? "" : "hidden md:block"}>
                <h2 className={`mb-2 hidden items-center gap-1.5 text-sm font-black md:flex ${cor}`}>
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
                    const recente = agora - new Date(p.criadoEm).getTime() < 60_000 && status === "NOVO";
                    return (
                      <article
                        key={p.id}
                        className={`card animate-entrar border-l-[6px] p-4 ${BORDA_ESPERA[nivel]} ${
                          recente ? "ring-4 ring-blue-400/40" : ""
                        }`}
                      >
                        <header className="mb-2 flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-2xl leading-none font-black">
                              {p.mesa ? `Mesa ${p.mesa}` : (p.clienteNome ?? "Balcão")}
                            </p>
                            <p className="mt-1 text-xs text-texto-suave">
                              Comanda {numeroVenda(p.comandaNumero)} · pedido {p.sequencia}
                              {p.garcom ? ` · ${p.garcom}` : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`flex items-center justify-end gap-1 text-lg font-black tabular-nums ${TEXTO_ESPERA[nivel]}`}>
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

      <ModalCancelarPedido alvo={cancelando} aoFechar={() => setCancelando(null)} />
    </>
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

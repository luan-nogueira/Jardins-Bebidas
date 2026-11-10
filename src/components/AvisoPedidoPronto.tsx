"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, X } from "lucide-react";
import { useDados } from "@/lib/store";
import { useQuemSou } from "@/components/Pedidos";
import { itensAtivos } from "@/lib/pedidos";
import { inscreverPush } from "@/lib/push";
import type { Pedido } from "@/lib/types";

/*
 * Aviso pro garçom quando a cozinha marca o pedido como pronto: toca,
 * vibra e mostra "Mesa 5 — pedido pronto!" no topo. Com o app aberto em
 * segundo plano, também sai como notificação do celular.
 * Só avisa dos pedidos do próprio garçom (quem lançou o pedido ou abriu a mesa).
 */

interface Aviso {
  id: string;
  vendaId: string;
  titulo: string;
  detalhe: string;
}

const DURACAO = 10_000;

/** "Plim-plim": dois toques agudos, curtos e bem audíveis. */
function plim(ctx: AudioContext) {
  const t0 = ctx.currentTime + 0.02;
  [1319, 1760, 1319, 1760].forEach((freq, i) => {
    const t = t0 + i * 0.16 + (i >= 2 ? 0.25 : 0);
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  });
}

function nomeMesa(p: Pedido) {
  return p.mesa ? `Mesa ${p.mesa}` : (p.clienteNome ?? "Comanda");
}

export function AvisoPedidoPronto() {
  const router = useRouter();
  const { pedidos, vendas, carregando } = useDados();
  const quem = useQuemSou();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [permissao, setPermissao] = useState<NotificationPermission | "indisponivel">("indisponivel");
  const vistos = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);

  // O navegador só libera som depois de um toque na tela.
  useEffect(() => {
    setPermissao("Notification" in window ? Notification.permission : "indisponivel");
    const destravar = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    };
    window.addEventListener("pointerdown", destravar);
    return () => window.removeEventListener("pointerdown", destravar);
  }, []);

  useEffect(() => {
    if (carregando) return;
    const prontos = pedidos.filter((p) => p.status === "PRONTO");
    if (vistos.current === null) {
      vistos.current = new Set(prontos.map((p) => p.id));
      return;
    }
    const novos = prontos.filter((p) => !vistos.current!.has(p.id));
    // Se a cozinha voltar a etapa e marcar pronto de novo, avisa de novo.
    vistos.current = new Set(prontos.map((p) => p.id));

    const meu = (p: Pedido) => p.garcom === quem || vendas.find((v) => v.id === p.vendaId)?.garcom === quem;
    const paraMim = novos.filter(meu);
    if (paraMim.length === 0) return;

    const lista = paraMim.map((p) => ({
      id: p.id,
      vendaId: p.vendaId,
      titulo: `${nomeMesa(p)} — pedido pronto!`,
      detalhe: itensAtivos(p)
        .map((i) => `${i.qtd}× ${i.nome}`)
        .join(", "),
    }));
    setAvisos((a) => [...lista, ...a.filter((x) => !lista.some((l) => l.id === x.id))].slice(0, 3));

    if (audio.current?.state === "running") plim(audio.current);
    navigator.vibrate?.([300, 120, 300, 120, 300]);

    // App em segundo plano: notificação do celular. Se o push também chegar,
    // a mesma tag (id do pedido) faz o celular mostrar uma só.
    if (permissao === "granted" && document.visibilityState !== "visible" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then((reg) => {
        for (const l of lista) {
          void reg.showNotification(l.titulo, {
            body: l.detalhe,
            tag: l.id,
            icon: "/icone-192.png",
            badge: "/icone-192.png",
            data: { url: `/garcom?id=${l.vendaId}` },
          });
        }
      });
    }
  }, [pedidos, vendas, carregando, quem, permissao]);

  // Cada aviso some sozinho depois de alguns segundos.
  useEffect(() => {
    if (avisos.length === 0) return;
    const t = setTimeout(() => setAvisos((a) => a.slice(0, -1)), DURACAO);
    return () => clearTimeout(t);
  }, [avisos]);

  // Com a permissão dada, (re)inscreve este celular no push — com o nome
  // atual do garçom, pra cozinha achar ele mesmo com o app fechado.
  useEffect(() => {
    if (permissao !== "granted") return;
    inscreverPush(quem).catch((e) => console.error("Não deu pra ativar o push:", e));
  }, [permissao, quem]);

  async function pedirPermissao() {
    try {
      setPermissao(await Notification.requestPermission());
    } catch {
      // navegador sem suporte: segue só com o aviso na tela
    }
  }

  return (
    <>
      {permissao === "default" && (
        <button
          type="button"
          onClick={pedirPermissao}
          className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-2 rounded-xl border border-sky-400/40 bg-sky-500/10 p-3 text-left text-xs font-semibold"
        >
          <BellRing className="h-4 w-4 shrink-0 text-sky-500" />
          <span className="flex-1">
            Ativar aviso de pedido pronto — chega até com o celular bloqueado
          </span>
          <span className="rounded-lg bg-sky-500 px-2 py-1 text-white">Ativar</span>
        </button>
      )}

      <div className="pointer-events-none fixed inset-x-3 top-16 z-[70] mx-auto flex max-w-md flex-col gap-2">
        {avisos.map((a) => (
          <div
            key={a.id}
            className="pointer-events-auto flex animate-toast items-start gap-3 rounded-2xl bg-sky-600 p-4 text-white shadow-2xl ring-4 ring-sky-400/40"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
              onClick={() => {
                setAvisos((x) => x.filter((y) => y.id !== a.id));
                router.push(`/garcom?id=${a.vendaId}`);
              }}
            >
              <BellRing className="mt-0.5 h-6 w-6 shrink-0 animate-bounce" />
              <span className="min-w-0">
                <span className="block text-lg leading-tight font-black">{a.titulo}</span>
                <span className="mt-0.5 block truncate text-sm opacity-90">{a.detalhe}</span>
                <span className="mt-1 block text-xs font-semibold opacity-80">Toque pra abrir a mesa</span>
              </span>
            </button>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setAvisos((x) => x.filter((y) => y.id !== a.id))}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white/15"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

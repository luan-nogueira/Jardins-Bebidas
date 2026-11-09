"use client";

import { useEffect, useState } from "react";
import { Ban, MessageSquareWarning } from "lucide-react";
import { Modal } from "@/components/ui";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  CLASSE_STATUS_PEDIDO,
  ROTULO_STATUS_PEDIDO,
  comStatus,
  tirarDaComanda,
} from "@/lib/pedidos";
import type { Pedido, PedidoItem, PedidoStatus } from "@/lib/types";

export function ChipPedido({ status }: { status: PedidoStatus }) {
  return <span className={`chip ${CLASSE_STATUS_PEDIDO[status]}`}>{ROTULO_STATUS_PEDIDO[status]}</span>;
}

/** Hora "agora" que anda sozinha — pros cronômetros de espera. */
export function useAgora(intervaloMs = 30_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(t);
  }, [intervaloMs]);
  return agora;
}

/** Nome de quem está usando o sistema — vai no pedido e no cancelamento. */
export function useQuemSou() {
  const { perfil, usuario } = useAuth();
  return perfil?.nome || usuario?.email || "Equipe";
}

/** Uma linha de item: "2× Porção de fritas" + observação em destaque. */
export function LinhaItemPedido({
  item,
  grande = false,
  aoCancelar,
}: {
  item: PedidoItem;
  grande?: boolean;
  aoCancelar?: () => void;
}) {
  return (
    <li className={`flex items-start gap-2 ${grande ? "py-1.5" : "py-1"}`}>
      <span
        className={`shrink-0 font-black tabular-nums ${grande ? "min-w-9 text-lg" : "min-w-7 text-sm"} ${
          item.cancelado ? "text-red-500 line-through" : "text-acento"
        }`}
      >
        {item.qtd}×
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`font-semibold ${grande ? "text-base" : "text-sm"} ${
            item.cancelado ? "text-texto-suave line-through" : ""
          }`}
        >
          {item.nome}
        </p>
        {item.obs && !item.cancelado && (
          <p className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <MessageSquareWarning className="h-3.5 w-3.5" />
            {item.obs}
          </p>
        )}
        {item.cancelado && (
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">
            Cancelado{item.motivoCancelamento ? ` — ${item.motivoCancelamento}` : ""}
            {item.canceladoPor ? ` (${item.canceladoPor})` : ""}
          </p>
        )}
      </div>
      {aoCancelar && !item.cancelado && (
        <button
          type="button"
          onClick={aoCancelar}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-texto-suave transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
          aria-label={`Cancelar ${item.nome}`}
          title="Cancelar item"
        >
          <Ban className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

export interface AlvoCancelamento {
  pedido: Pedido;
  /** Índice do item; sem ele cancela o pedido inteiro. */
  indice?: number;
}

const MOTIVOS = ["Cliente desistiu", "Lançado errado", "Acabou o produto", "Demorou demais"];

/**
 * Cancela um item (ou o pedido todo) com motivo. Tira da comanda também,
 * pra não cobrar o que não saiu.
 */
export function ModalCancelarPedido({
  alvo,
  aoFechar,
}: {
  alvo: AlvoCancelamento | null;
  aoFechar: () => void;
}) {
  const { salvarPedido, salvarVenda, vendaPorId } = useDados();
  const quem = useQuemSou();
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setMotivo(""), [alvo]);

  if (!alvo) return null;
  const { pedido, indice } = alvo;
  const item = indice !== undefined ? pedido.itens[indice] : undefined;

  async function confirmar() {
    if (!motivo.trim()) return;
    setSalvando(true);
    try {
      const agora = new Date().toISOString();
      const marca = { cancelado: true, motivoCancelamento: motivo.trim(), canceladoEm: agora, canceladoPor: quem };
      const itens = pedido.itens.map((it, i) =>
        !it.cancelado && (indice === undefined || i === indice) ? { ...it, ...marca } : it,
      );
      const cancelados = pedido.itens.filter((it, i) => !it.cancelado && (indice === undefined || i === indice));
      const tudoCancelado = itens.every((it) => it.cancelado);
      const atualizado: Pedido = tudoCancelado
        ? { ...comStatus({ ...pedido, itens }, "CANCELADO"), motivoCancelamento: motivo.trim(), canceladoPor: quem }
        : { ...pedido, itens, atualizadoEm: agora };
      await salvarPedido(atualizado);

      const venda = vendaPorId(pedido.vendaId);
      if (venda && venda.status === "ABERTA") {
        let vItens = venda.itens;
        for (const c of cancelados) vItens = tirarDaComanda(vItens, c.produtoId, c.qtd);
        await salvarVenda({ ...venda, itens: vItens, atualizadoEm: agora });
      }
      aoFechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={item ? "Cancelar item" : "Cancelar pedido"}
      rodape={
        <>
          <button className="btn-secundario" onClick={aoFechar} disabled={salvando}>
            Voltar
          </button>
          <button className="btn-perigo" onClick={confirmar} disabled={salvando || !motivo.trim()}>
            <Ban className="h-4 w-4" />
            Cancelar {item ? "item" : "pedido"}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-texto-suave">
        {item ? (
          <>
            <strong className="text-texto">
              {item.qtd}× {item.nome}
            </strong>{" "}
            sai do pedido e da conta da mesa.
          </>
        ) : (
          <>Todos os itens ainda ativos deste pedido saem da cozinha e da conta da mesa.</>
        )}{" "}
        A cozinha vê o cancelamento na hora.
      </p>
      <label className="mb-1.5 block text-xs font-bold text-texto-suave">Motivo</label>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {MOTIVOS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMotivo(m)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              motivo === m ? "bg-red-600 text-white" : "border border-borda bg-superficie text-texto-suave hover:bg-superficie-2"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <input
        className="campo"
        placeholder="Ou escreva o motivo…"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
    </Modal>
  );
}

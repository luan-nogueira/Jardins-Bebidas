import type { Pedido, PedidoStatus, Venda, VendaItem } from "./types";

export const ROTULO_STATUS_PEDIDO: Record<PedidoStatus, string> = {
  NOVO: "Novo",
  PREPARANDO: "Em preparo",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

export const CLASSE_STATUS_PEDIDO: Record<PedidoStatus, string> = {
  NOVO: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  PREPARANDO: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  PRONTO: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ENTREGUE: "bg-superficie-2 text-texto-suave",
  CANCELADO: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

/** "Mesa 5 · João", "Mesa 5" ou só o nome do cliente (comanda antiga, sem mesa). */
export function nomeComanda(v: Pick<Venda, "mesa" | "clienteNome">): string {
  if (v.mesa && v.clienteNome) return `Mesa ${v.mesa} · ${v.clienteNome}`;
  if (v.mesa) return `Mesa ${v.mesa}`;
  return v.clienteNome ?? "Sem nome";
}

export function minutosDesde(iso: string, agora = Date.now()): number {
  return Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
}

/** Até 10 min tranquilo, até 20 atenção, depois atrasado. */
export function nivelEspera(min: number): "ok" | "atencao" | "atrasado" {
  return min < 10 ? "ok" : min < 20 ? "atencao" : "atrasado";
}

export function itensAtivos(p: Pedido) {
  return p.itens.filter((i) => !i.cancelado);
}

/** Pedido que ainda está com a cozinha ou esperando o garçom levar. */
export function pedidoEmAndamento(p: Pedido) {
  return p.status === "NOVO" || p.status === "PREPARANDO" || p.status === "PRONTO";
}

/**
 * Tira `qtd` unidades do produto da comanda (item cancelado no pedido).
 * Começa pelas linhas mais novas; linha zerada sai da comanda.
 */
export function tirarDaComanda(itens: VendaItem[], produtoId: string, qtd: number): VendaItem[] {
  const novos = [...itens];
  let falta = qtd;
  for (let i = novos.length - 1; i >= 0 && falta > 0; i--) {
    if (novos[i].produtoId !== produtoId) continue;
    const tira = Math.min(falta, novos[i].qtd);
    falta -= tira;
    novos[i] = { ...novos[i], qtd: novos[i].qtd - tira };
  }
  return novos.filter((i) => i.qtd > 0);
}

/** Marca o horário da etapa junto com o status. */
export function comStatus(p: Pedido, status: PedidoStatus): Pedido {
  const agora = new Date().toISOString();
  const campo = {
    NOVO: null,
    PREPARANDO: "preparoEm",
    PRONTO: "prontoEm",
    ENTREGUE: "entregueEm",
    CANCELADO: "canceladoEm",
  }[status];
  return { ...p, status, atualizadoEm: agora, ...(campo && { [campo]: agora }) };
}

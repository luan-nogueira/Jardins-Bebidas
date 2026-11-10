import { useEffect, useMemo, useState } from "react";
import { colecao } from "./db";
import { useAuth } from "./auth";
import { saldoVenda, subtotalItens, totalVenda } from "./vendas";
import type { Caixa, CaixaResumo, FormaPagamento, Venda } from "./types";

/*
 * Caixa: um turno que começa em "Abrir caixa" e só termina em "Fechar
 * caixa" (nada de virar sozinho à meia-noite). Tudo que entrou nesse
 * intervalo — vendas fechadas, recebimentos de fiado, abatimentos de mesa —
 * conta pra ele, pela hora do pagamento.
 */

export const FORMAS: FormaPagamento[] = ["DINHEIRO", "PIX", "DEBITO", "CREDITO"];

/** Escuta a coleção de caixas (mais novo primeiro). */
export function useCaixas() {
  const { usuario, exigeLogin } = useAuth();
  const ativo = !exigeLogin || !!usuario;
  const [caixas, setCaixas] = useState<Caixa[]>([]);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    if (!ativo) return;
    return colecao<Caixa>("caixas").observar((lista) => {
      setCaixas([...lista].sort((a, b) => b.abertoEm.localeCompare(a.abertoEm)));
      setCarregando(false);
    });
  }, [ativo]);
  const aberto = useMemo(() => caixas.find((c) => c.status === "ABERTO") ?? null, [caixas]);
  return { caixas, aberto, carregando, salvar: (c: Caixa) => colecao<Caixa>("caixas").salvar(c) };
}

const dentro = (iso: string | undefined, de: string, ate: string) => !!iso && iso >= de && iso <= ate;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface DetalheCaixa {
  resumo: CaixaResumo;
  vendas: Venda[];
  canceladas: Venda[];
  /** Pagamentos de vendas de outros turnos recebidos agora (fiado, mesa aberta). */
  recebimentosAvulsos: { venda: Venda; valor: number; forma: FormaPagamento; data: string }[];
  produtos: { nome: string; qtd: number; total: number }[];
}

/** Calcula tudo do turno — do abertoEm até o fechamento (ou agora, se ainda aberto). */
export function calcularCaixa(caixa: Caixa, todasVendas: Venda[], agora = new Date().toISOString()): DetalheCaixa {
  const de = caixa.abertoEm;
  const ate = caixa.fechadoEm ?? agora;

  const vendas = todasVendas
    .filter((v) => v.status === "FINALIZADA" && dentro(v.finalizadaEm, de, ate))
    .sort((a, b) => (a.finalizadaEm ?? "").localeCompare(b.finalizadaEm ?? ""));
  const canceladas = todasVendas.filter((v) => v.status === "CANCELADA" && dentro(v.canceladaEm, de, ate));

  const porForma: Partial<Record<FormaPagamento, number>> = {};
  const recebimentosAvulsos: DetalheCaixa["recebimentosAvulsos"] = [];
  const idsDoTurno = new Set(vendas.map((v) => v.id));
  for (const v of todasVendas) {
    if (v.status === "CANCELADA") continue;
    for (const p of v.pagamentos) {
      if (!dentro(p.data, de, ate)) continue;
      porForma[p.forma] = r2((porForma[p.forma] ?? 0) + p.valor);
      if (!idsDoTurno.has(v.id)) recebimentosAvulsos.push({ venda: v, valor: p.valor, forma: p.forma, data: p.data });
    }
  }

  const mapa = new Map<string, { nome: string; qtd: number; total: number }>();
  for (const v of vendas)
    for (const i of v.itens) {
      const l = mapa.get(i.nome) ?? { nome: i.nome, qtd: 0, total: 0 };
      l.qtd += i.qtd;
      l.total = r2(l.total + i.qtd * i.precoUn);
      mapa.set(i.nome, l);
    }

  const soma = (tipo: "SANGRIA" | "REFORCO") =>
    r2(caixa.movimentos.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.valor, 0));
  const sangrias = soma("SANGRIA");
  const reforcos = soma("REFORCO");
  const totalRecebido = r2(Object.values(porForma).reduce((s, n) => s + (n ?? 0), 0));

  return {
    resumo: {
      vendas: vendas.length,
      totalVendido: r2(vendas.reduce((s, v) => s + totalVenda(v), 0)),
      descontos: r2(vendas.reduce((s, v) => s + Math.min(v.desconto || 0, subtotalItens(v.itens)), 0)),
      canceladas: canceladas.length,
      totalCancelado: r2(canceladas.reduce((s, v) => s + totalVenda(v), 0)),
      porForma,
      totalRecebido,
      aPrazo: r2(vendas.reduce((s, v) => s + Math.max(0, saldoVenda(v)), 0)),
      sangrias,
      reforcos,
      dinheiroEsperado: r2(caixa.fundoTroco + (porForma.DINHEIRO ?? 0) + reforcos - sangrias),
    },
    vendas,
    canceladas,
    recebimentosAvulsos,
    produtos: [...mapa.values()].sort((a, b) => b.total - a.total),
  };
}

export function numeroCaixa(n: number) {
  return `Caixa #${String(n).padStart(3, "0")}`;
}

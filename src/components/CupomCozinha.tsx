"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { imprimirCupom } from "@/lib/imprimirCupom";
import { numeroVenda } from "@/lib/vendas";
import type { Pedido, PedidoItem } from "@/lib/types";

/**
 * Cupom da cozinha pra impressora térmica (bobina de 80mm): mesa grande,
 * itens em caixa alta e observação em destaque — igual ao das lojas.
 */
export interface Cupom {
  chave: string;
  pedido: Pedido;
  tipo: "PEDIDO" | "CANCELAMENTO";
  itens: PedidoItem[];
}

const LINHA = "- - - - - - - - - - - - - - - - - - - - -";

function dataHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function CupomUnico({ cupom }: { cupom: Cupom }) {
  const { pedido: p, tipo, itens } = cupom;
  const cancelamento = tipo === "CANCELAMENTO";
  const total = itens.reduce((s, i) => s + i.qtd, 0);
  return (
    <div
      style={{
        width: "72mm",
        padding: "3mm 3mm 8mm",
        fontFamily: "'Courier New', Courier, monospace",
        // Térmica imprime fino: tudo em negrito pra sair escuro.
        fontWeight: 700,
        color: "#000",
        background: "#fff",
        breakAfter: "page",
        lineHeight: 1.25,
      }}
    >
      <p style={{ textAlign: "center", fontSize: "11pt", fontWeight: 700 }}>JARDINS BEBIDAS</p>
      <p
        style={{
          textAlign: "center",
          fontSize: cancelamento ? "14pt" : "10pt",
          fontWeight: 700,
          ...(cancelamento && { background: "#000", color: "#fff", padding: "1mm 0" }),
        }}
      >
        {cancelamento ? "*** CANCELAMENTO ***" : "PEDIDO DA COZINHA"}
      </p>
      <p style={{ fontSize: "8pt", overflow: "hidden", whiteSpace: "nowrap" }}>{LINHA}</p>
      <p style={{ textAlign: "center", fontSize: "26pt", fontWeight: 900, lineHeight: 1.1 }}>
        {p.mesa ? `MESA ${p.mesa}` : (p.clienteNome ?? "BALCÃO").toUpperCase()}
      </p>
      {p.mesa && p.clienteNome && (
        <p style={{ textAlign: "center", fontSize: "11pt", fontWeight: 700 }}>{p.clienteNome}</p>
      )}
      <p style={{ fontSize: "10pt", marginTop: "1mm" }}>
        Comanda {numeroVenda(p.comandaNumero)} · Pedido {p.sequencia}
      </p>
      {p.garcom && <p style={{ fontSize: "10pt" }}>Garçom: {p.garcom}</p>}
      <p style={{ fontSize: "10pt" }}>
        {cancelamento ? "Cancelado" : "Feito"} em: {dataHora(cancelamento ? (itens[0]?.canceladoEm ?? p.atualizadoEm) : p.criadoEm)}
      </p>
      <p style={{ fontSize: "8pt", overflow: "hidden", whiteSpace: "nowrap" }}>{LINHA}</p>
      {itens.map((it, i) => (
        <div key={i} style={{ marginBottom: "2mm" }}>
          <div style={{ display: "flex", gap: "2mm", fontSize: "14pt", fontWeight: 900 }}>
            <span style={{ minWidth: "11mm" }}>{it.qtd}x</span>
            <span style={{ textTransform: "uppercase", textDecoration: cancelamento ? "line-through" : undefined }}>
              {it.nome}
            </span>
          </div>
          {it.obs && !cancelamento && (
            <p style={{ fontSize: "12pt", fontWeight: 700, paddingLeft: "13mm" }}>&gt;&gt; {it.obs.toUpperCase()}</p>
          )}
          {cancelamento && it.motivoCancelamento && (
            <p style={{ fontSize: "10pt", paddingLeft: "13mm" }}>Motivo: {it.motivoCancelamento}</p>
          )}
        </div>
      ))}
      {p.obs && !cancelamento && (
        <>
          <p style={{ fontSize: "8pt", overflow: "hidden", whiteSpace: "nowrap" }}>{LINHA}</p>
          <p style={{ fontSize: "12pt", fontWeight: 700 }}>OBS: {p.obs.toUpperCase()}</p>
        </>
      )}
      <p style={{ fontSize: "8pt", overflow: "hidden", whiteSpace: "nowrap" }}>{LINHA}</p>
      <p style={{ fontSize: "10pt" }}>
        {cancelamento ? "NÃO PREPARAR" : `Total de itens: ${total}`}
      </p>
    </div>
  );
}

/**
 * Fila de impressão: põe os cupons num bloco escondido, chama a impressão
 * do navegador e limpa. Vários pedidos juntos saem num trabalho só, um por
 * página (a impressora corta entre eles).
 */
export function useImpressaoCozinha() {
  const [fila, setFila] = useState<Cupom[]>([]);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    if (fila.length === 0) return;
    const t = setTimeout(() => {
      imprimirCupom();
      setFila([]);
    }, 120);
    return () => clearTimeout(t);
  }, [fila]);

  const imprimir = useCallback((cupons: Cupom[]) => {
    if (cupons.length) setFila((f) => [...f, ...cupons]);
  }, []);

  const area =
    montado && fila.length > 0
      ? createPortal(
          <div className="so-impressao">
            {fila.map((c) => (
              <CupomUnico key={c.chave} cupom={c} />
            ))}
          </div>,
          document.body,
        )
      : null;

  return { imprimir, area };
}

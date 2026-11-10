"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { imprimirCupom } from "@/lib/imprimirCupom";
import { Printer } from "lucide-react";
import { EMPRESA } from "@/lib/empresa";
import { ROTULO_FORMA, numeroVenda, pagoVenda, saldoVenda, subtotalItens, totalVenda } from "@/lib/vendas";
import { nomeComanda } from "@/lib/pedidos";
import type { Venda } from "@/lib/types";

/**
 * Cupom da venda pra impressora térmica (bobina de 80mm). NÃO é documento
 * fiscal — é o comprovante manual até a integração com a SEFAZ (NFC-e).
 * Com a comanda ainda aberta sai como "conferência de conta".
 */

const LINHA = "- - - - - - - - - - - - - - - - - - - - -";
const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const sep = <p style={{ fontSize: "8pt", overflow: "hidden", whiteSpace: "nowrap" }}>{LINHA}</p>;

function Linha({ esq, dir, forte = false, grande = false }: { esq: string; dir: string; forte?: boolean; grande?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "2mm",
        fontSize: grande ? "13pt" : "10pt",
        fontWeight: forte ? 900 : 700,
      }}
    >
      <span>{esq}</span>
      <span style={{ whiteSpace: "nowrap" }}>{dir}</span>
    </div>
  );
}

function CupomUnico({ venda: v }: { venda: Venda }) {
  const aberta = v.status === "ABERTA";
  const subtotal = subtotalItens(v.itens);
  const total = totalVenda(v);
  const pago = pagoVenda(v);
  const falta = Math.max(0, saldoVenda(v));
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
      <p style={{ textAlign: "center", fontSize: "13pt", fontWeight: 900 }}>{EMPRESA.nome.toUpperCase()}</p>
      {EMPRESA.documento && <p style={{ textAlign: "center", fontSize: "10pt", fontWeight: 700 }}>CNPJ {EMPRESA.documento}</p>}
      <p style={{ textAlign: "center", fontSize: "10pt", fontWeight: 700 }}>{EMPRESA.endereco}</p>
      <p style={{ textAlign: "center", fontSize: "10pt", fontWeight: 700 }}>{EMPRESA.cidade}</p>
      <p style={{ textAlign: "center", fontSize: "10pt", fontWeight: 700 }}>Tel {EMPRESA.telefone}</p>
      {sep}
      <p style={{ textAlign: "center", fontSize: "11pt", fontWeight: 900 }}>
        {aberta ? "CONFERÊNCIA DE CONTA" : "COMPROVANTE DE VENDA"}
      </p>
      <p style={{ textAlign: "center", fontSize: "10pt", fontWeight: 700 }}>NÃO É DOCUMENTO FISCAL</p>
      {sep}
      <p style={{ fontSize: "10pt" }}>
        {v.tipo === "COMANDA" ? "Comanda" : "Venda"} {numeroVenda(v.numero)}
      </p>
      <p style={{ fontSize: "10pt" }}>{dataHora(v.finalizadaEm ?? new Date().toISOString())}</p>
      {(v.mesa || v.clienteNome) && <p style={{ fontSize: "10pt", fontWeight: 700 }}>{nomeComanda(v)}</p>}
      {v.garcom && <p style={{ fontSize: "10pt" }}>Garçom: {v.garcom}</p>}
      {sep}
      {v.itens.map((it, i) => (
        <div key={i} style={{ marginBottom: "1mm" }}>
          <p style={{ fontSize: "10pt", fontWeight: 700, textTransform: "uppercase" }}>{it.nome}</p>
          <Linha esq={`  ${it.qtd} x ${fmt(it.precoUn)}`} dir={fmt(it.qtd * it.precoUn)} />
        </div>
      ))}
      {sep}
      <Linha esq={`Itens: ${v.itens.reduce((s, i) => s + i.qtd, 0)}`} dir="" />
      {v.desconto > 0 && (
        <>
          <Linha esq="Subtotal" dir={fmt(subtotal)} />
          <Linha esq="Desconto" dir={`-${fmt(v.desconto)}`} />
        </>
      )}
      <Linha esq="TOTAL R$" dir={fmt(total)} forte grande />
      {v.pagamentos.length > 0 && (
        <>
          {sep}
          {v.pagamentos.map((p) => (
            <Linha key={p.id} esq={`${p.obs ? `${p.obs} - ` : ""}${ROTULO_FORMA[p.forma]}`} dir={fmt(p.valor)} />
          ))}
        </>
      )}
      {falta > 0.005 && (
        <>
          {pago > 0 && <Linha esq="Já pago" dir={fmt(pago)} />}
          <Linha esq={aberta ? "A PAGAR R$" : "EM ABERTO R$"} dir={fmt(falta)} forte grande />
        </>
      )}
      {sep}
      <p style={{ textAlign: "center", fontSize: "10pt", fontWeight: 700 }}>Obrigado pela preferência!</p>
      {EMPRESA.instagram && <p style={{ textAlign: "center", fontSize: "10pt", fontWeight: 700 }}>{EMPRESA.instagram}</p>}
    </div>
  );
}

/** Imprime o cupom da venda: põe num bloco escondido, chama a impressão e limpa. */
export function useImprimirVenda() {
  const [fila, setFila] = useState<Venda[]>([]);
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

  const imprimir = useCallback((v: Venda) => setFila([v]), []);

  const area =
    montado && fila.length > 0
      ? createPortal(
          <div className="so-impressao">
            {fila.map((v) => (
              <CupomUnico key={v.id} venda={v} />
            ))}
          </div>,
          document.body,
        )
      : null;

  return { imprimir, area };
}

/** Botão pronto: "Imprimir cupom" (ou "Imprimir conta" com a comanda aberta). */
export function BotaoImprimirVenda({ venda, className = "btn-secundario" }: { venda: Venda; className?: string }) {
  const { imprimir, area } = useImprimirVenda();
  return (
    <>
      <button type="button" className={className} onClick={() => imprimir(venda)}>
        <Printer className="h-4 w-4" />
        {venda.status === "ABERTA" ? "Imprimir conta" : "Imprimir cupom"}
      </button>
      {area}
    </>
  );
}

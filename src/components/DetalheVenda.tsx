"use client";

import { useState } from "react";
import { Modal } from "@/components/ui";
import { ListaItens, ModalPagamento, useAcoesVenda } from "@/components/Vendas";
import { BotaoImprimirVenda } from "@/components/CupomVenda";
import { useAuth } from "@/lib/auth";
import { useDados } from "@/lib/store";
import { brl, dataBR, dataHoraBR, hojeISO } from "@/lib/format";
import {
  ROTULO_FORMA,
  numeroVenda,
  pagoVenda,
  saldoVenda,
  subtotalItens,
  totalVenda,
} from "@/lib/vendas";
import type { Venda } from "@/lib/types";

export function ChipStatusVenda({ venda }: { venda: Venda }) {
  const saldo = saldoVenda(venda);
  const [classe, texto] =
    venda.status === "CANCELADA"
      ? ["bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", "Cancelada"]
      : venda.status === "ABERTA"
        ? ["bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300", "Aberta"]
        : saldo > 0.005
          ? venda.vencimento && venda.vencimento < hojeISO()
            ? ["bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300", "Vencida"]
            : ["bg-ouro-100 text-ouro-900 dark:bg-ouro-900/40 dark:text-ouro-200", "A receber"]
          : ["bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", "Paga"];
  return <span className={`chip ${classe}`}>{texto}</span>;
}

/** Folha com o resumo de uma venda: itens, pagamentos e ações. */
export function DetalheVenda({
  venda,
  aoFechar,
  aoAbrirComanda,
}: {
  venda: Venda;
  aoFechar: () => void;
  aoAbrirComanda?: (v: Venda) => void;
}) {
  const { permissoes } = useAuth();
  const { receber, cancelar } = useAcoesVenda();
  const { removerVenda } = useDados();
  const cancelada = venda.status === "CANCELADA";
  const [recebendo, setRecebendo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const total = totalVenda(venda);
  const saldo = saldoVenda(venda);
  const podeReceber = venda.status === "FINALIZADA" && saldo > 0.005;

  return (
    <>
      <Modal
        aberto
        aoFechar={aoFechar}
        titulo={`${venda.tipo === "COMANDA" ? "Comanda" : "Venda"} ${numeroVenda(venda.numero)}`}
        rodape={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {permissoes.excluir ? (
              <button
                className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400"
                onClick={() => setCancelando(true)}
              >
                {cancelada ? "Excluir de vez" : "Cancelar venda"}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {!cancelada && <BotaoImprimirVenda venda={venda} />}
              {venda.status === "ABERTA" && aoAbrirComanda && (
                <button className="btn-primario" onClick={() => aoAbrirComanda(venda)}>
                  Abrir comanda
                </button>
              )}
              {podeReceber && (
                <button className="btn-primario" onClick={() => setRecebendo(true)}>
                  Receber
                </button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <ChipStatusVenda venda={venda} />
            <span className="text-sm font-semibold">{venda.clienteNome ?? "Consumidor final"}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-texto-suave">
            <dt>Aberta em</dt>
            <dd className="text-right">{dataHoraBR(venda.abertaEm)}</dd>
            {venda.finalizadaEm && (
              <>
                <dt>Finalizada em</dt>
                <dd className="text-right">{dataHoraBR(venda.finalizadaEm)}</dd>
              </>
            )}
            {venda.vencimento && saldo > 0.005 && (
              <>
                <dt>Vencimento</dt>
                <dd className="text-right font-semibold text-texto">{dataBR(venda.vencimento)}</dd>
              </>
            )}
            {venda.operador && (
              <>
                <dt>Operador</dt>
                <dd className="truncate text-right">{venda.operador}</dd>
              </>
            )}
          </dl>

          <div className="card overflow-hidden">
            <ListaItens itens={venda.itens} somenteLeitura />
          </div>

          <div className="space-y-1 text-sm">
            {venda.desconto > 0 && (
              <>
                <Linha rotulo="Subtotal" valor={brl(subtotalItens(venda.itens))} />
                <Linha rotulo="Desconto" valor={`− ${brl(venda.desconto)}`} />
              </>
            )}
            <Linha rotulo="Total" valor={brl(total)} forte />
            {venda.pagamentos.map((p) => (
              <Linha
                key={p.id}
                rotulo={`${ROTULO_FORMA[p.forma]} · ${dataHoraBR(p.data)}`}
                valor={brl(p.valor)}
                suave
              />
            ))}
            {venda.status !== "CANCELADA" && venda.pagamentos.length > 0 && (
              <Linha rotulo="Pago" valor={brl(pagoVenda(venda))} />
            )}
            {saldo > 0.005 && venda.status === "FINALIZADA" && (
              <Linha rotulo="Falta receber" valor={brl(saldo)} forte destaque />
            )}
          </div>
        </div>
      </Modal>

      <ModalPagamento
        aberto={recebendo}
        titulo={`Receber de ${venda.clienteNome ?? "cliente"}`}
        aPagar={saldo}
        permitePrazo
        textoConfirmar="Registrar recebimento"
        aoFechar={() => setRecebendo(false)}
        aoConfirmar={async (r) => {
          await receber(venda, r);
          setRecebendo(false);
        }}
      />

      <Modal
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        titulo={cancelada ? "Excluir de vez" : "Cancelar venda"}
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
                  if (cancelada) await removerVenda(venda.id);
                  else await cancelar(venda);
                  setCancelando(false);
                  aoFechar();
                } finally {
                  setOcupado(false);
                }
              }}
            >
              {cancelada ? "Excluir" : "Cancelar venda"}
            </button>
          </>
        }
      >
        <p className="text-sm text-texto-suave">
          {cancelada
            ? "Apaga esta venda cancelada do sistema. O estoque já foi devolvido quando ela foi cancelada."
            : venda.status === "FINALIZADA"
            ? "Os itens voltam pro estoque e a venda sai dos relatórios. Os recebimentos ficam registrados na venda cancelada."
            : "A comanda é fechada sem mexer no estoque."}
        </p>
      </Modal>
    </>
  );
}

function Linha({
  rotulo,
  valor,
  forte,
  suave,
  destaque,
}: {
  rotulo: string;
  valor: string;
  forte?: boolean;
  suave?: boolean;
  destaque?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-3 ${suave ? "text-xs text-texto-suave" : ""} ${
        forte ? "font-black" : ""
      } ${destaque ? "text-acento" : ""}`}
    >
      <span>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

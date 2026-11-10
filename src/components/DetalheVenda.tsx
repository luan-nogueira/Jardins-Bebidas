"use client";

import { useState } from "react";
import { Modal } from "@/components/ui";
import { ListaItens, ModalPagamento, SeletorProdutos, useAcoesVenda } from "@/components/Vendas";
import { Pencil, Trash2 } from "lucide-react";
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
import { adicionarItem, adicionarMaco } from "@/lib/vendas";
import type { Venda, VendaItem } from "@/lib/types";

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
  const { receber, cancelar, editarItens } = useAcoesVenda();
  const { removerVenda } = useDados();
  const cancelada = venda.status === "CANCELADA";
  const [recebendo, setRecebendo] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  /** Itens sendo editados (null = fora da edição). */
  const [rascunho, setRascunho] = useState<VendaItem[] | null>(null);
  const [aviso, setAviso] = useState("");
  // Mexer numa venda já fechada é como cancelar: precisa da permissão de excluir.
  const podeEditar = !cancelada && (venda.status === "ABERTA" || permissoes.excluir);

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
            <div className="flex flex-wrap gap-2">
              {permissoes.excluir && (
                <button className="btn-secundario text-red-600 dark:text-red-400" onClick={() => setCancelando(true)}>
                  <Trash2 className="h-4 w-4" />
                  {cancelada ? "Excluir de vez" : venda.tipo === "COMANDA" ? "Cancelar comanda" : "Cancelar venda"}
                </button>
              )}
              {podeEditar && (
                <button className="btn-secundario" onClick={() => setRascunho(venda.itens.map((i) => ({ ...i })))}>
                  <Pencil className="h-4 w-4" />
                  Editar itens
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
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
          {aviso && (
            <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
              {aviso}
            </p>
          )}
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

      <EditarItens
        venda={venda}
        itens={rascunho}
        aoMudar={setRascunho}
        aoFechar={() => setRascunho(null)}
        aoSalvar={async (itens) => {
          const { venda: nova, devolver } = await editarItens(venda, itens);
          setRascunho(null);
          const falta = saldoVenda(nova);
          setAviso(
            devolver > 0.005
              ? `Itens alterados. Devolva ${brl(devolver)} ao cliente.`
              : nova.status === "FINALIZADA" && falta > 0.005
                ? `Itens alterados. Falta receber ${brl(falta)} — toque em Receber.`
                : "Itens alterados.",
          );
        }}
      />

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

/** Trocar quantidades, tirar e pôr produtos numa venda (o estoque acompanha ao salvar). */
function EditarItens({
  venda,
  itens,
  aoMudar,
  aoFechar,
  aoSalvar,
}: {
  venda: Venda;
  itens: VendaItem[] | null;
  aoMudar: (itens: VendaItem[]) => void;
  aoFechar: () => void;
  aoSalvar: (itens: VendaItem[]) => Promise<void>;
}) {
  const [salvando, setSalvando] = useState(false);
  const novoTotal = itens ? Math.max(0, subtotalItens(itens) - Math.min(venda.desconto, subtotalItens(itens))) : 0;
  const pago = pagoVenda(venda);
  const diferenca = novoTotal - pago;
  return (
    <Modal
      aberto={!!itens}
      aoFechar={() => !salvando && aoFechar()}
      titulo={`Editar itens · ${numeroVenda(venda.numero)}`}
      largura="max-w-2xl"
      rodape={
        <>
          <button className="btn-secundario" onClick={aoFechar} disabled={salvando}>
            Voltar
          </button>
          <button
            className="btn-primario"
            disabled={salvando || !itens || itens.length === 0}
            onClick={async () => {
              if (!itens) return;
              setSalvando(true);
              try {
                await aoSalvar(itens.filter((i) => i.qtd > 0));
              } finally {
                setSalvando(false);
              }
            }}
          >
            {salvando ? "Salvando…" : "Salvar alteração"}
          </button>
        </>
      }
    >
      {itens && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <ListaItens itens={itens} aoMudar={aoMudar} />
          </div>
          <div className="space-y-1 rounded-xl border border-borda p-3 text-sm">
            <Linha rotulo="Total antes" valor={brl(totalVenda(venda))} suave />
            <Linha rotulo="Total novo" valor={brl(novoTotal)} forte />
            {venda.status === "FINALIZADA" && diferenca > 0.005 && (
              <Linha rotulo="Vai faltar receber" valor={brl(diferenca)} destaque />
            )}
            {diferenca < -0.005 && <Linha rotulo="Devolver ao cliente" valor={brl(-diferenca)} destaque />}
            {venda.status === "FINALIZADA" && (
              <p className="pt-1 text-xs text-texto-suave">O estoque é corrigido sozinho ao salvar.</p>
            )}
          </div>
          {itens.length === 0 && (
            <p className="text-xs font-semibold text-amber-600">
              Sem itens não dá pra salvar — pra desfazer a venda toda, use Cancelar.
            </p>
          )}
          <div>
            <h3 className="mb-2 text-sm font-bold">Adicionar produtos</h3>
            <SeletorProdutos
              retirada={!!venda.retirada}
              aoEscolher={(p, qtd) => aoMudar(adicionarItem(itens, p, qtd, !!venda.retirada))}
              aoEscolherMaco={(p) => aoMudar(adicionarMaco(itens, p))}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { Minus, Plus, Users } from "lucide-react";
import { Modal } from "@/components/ui";
import { ModalPagamento, novaVenda, useAcoesVenda } from "@/components/Vendas";
import { useDados } from "@/lib/store";
import { brl } from "@/lib/format";
import { nomeComanda } from "@/lib/pedidos";
import type { Venda, VendaItem } from "@/lib/types";

/*
 * Pagar separado: um cliente da mesa escolhe só o que consumiu e paga.
 * Esses itens viram uma venda própria (finalizada, baixa o estoque e entra
 * no caixa) e saem da conta da mesa, que continua aberta pros outros.
 */

export function BotaoPagarSeparado({ venda, aoPagar }: { venda: Venda; aoPagar?: (v: Venda) => void }) {
  const { vendaPorId, salvarVenda, proximoNumeroVenda } = useDados();
  const { finalizar } = useAcoesVenda();
  const [escolhendo, setEscolhendo] = useState(false);
  const [pagando, setPagando] = useState(false);
  /** Quantas unidades de cada linha da conta (pelo índice) essa pessoa vai pagar. */
  const [sel, setSel] = useState<number[]>([]);

  const itens = venda.itens;
  const escolhidos: VendaItem[] = itens
    .map((it, i) => ({ ...it, qtd: Math.min(sel[i] ?? 0, it.qtd) }))
    .filter((it) => it.qtd > 0);
  const valor = escolhidos.reduce((s, i) => s + i.qtd * i.precoUn, 0);
  const unidades = escolhidos.reduce((s, i) => s + i.qtd, 0);
  const totalUnidades = itens.reduce((s, i) => s + i.qtd, 0);
  const tudo = unidades > 0 && unidades === totalUnidades;

  function mudar(i: number, qtd: number) {
    setSel((s) => {
      const novo = [...s];
      novo[i] = Math.max(0, Math.min(itens[i].qtd, qtd));
      return novo;
    });
  }

  function abrir() {
    setSel([]);
    setEscolhendo(true);
  }

  return (
    <>
      <button className="btn-secundario w-full" disabled={itens.length < 1 || totalUnidades < 2} onClick={abrir}>
        <Users className="h-4 w-4" />
        Pagar separado
      </button>

      <Modal
        aberto={escolhendo}
        aoFechar={() => setEscolhendo(false)}
        titulo={`Pagar separado · ${nomeComanda(venda)}`}
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setEscolhendo(false)}>
              Voltar
            </button>
            <button
              className="btn-primario"
              disabled={unidades === 0 || tudo}
              onClick={() => {
                setEscolhendo(false);
                setPagando(true);
              }}
            >
              Pagar {brl(valor)}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-texto-suave">
          Marque só o que essa pessoa consumiu. O resto continua na conta da mesa.
        </p>
        <ul className="divide-y divide-borda">
          {itens.map((it, i) => {
            const q = sel[i] ?? 0;
            return (
              <li key={i} className="flex items-center gap-2 py-2.5">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => mudar(i, q > 0 ? 0 : it.qtd)}
                >
                  <span className={`block truncate font-semibold ${q > 0 ? "text-acento" : ""}`}>{it.nome}</span>
                  <span className="text-xs text-texto-suave tabular-nums">
                    {it.qtd}× {brl(it.precoUn)}
                  </span>
                </button>
                <button
                  className="grid h-9 w-9 place-items-center rounded-lg border border-borda disabled:opacity-40"
                  onClick={() => mudar(i, q - 1)}
                  disabled={q === 0}
                  aria-label="Menos"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-10 text-center font-black tabular-nums">
                  {q}
                  <span className="text-xs font-normal text-texto-suave">/{it.qtd}</span>
                </span>
                <button
                  className="grid h-9 w-9 place-items-center rounded-lg border border-borda disabled:opacity-40"
                  onClick={() => mudar(i, q + 1)}
                  disabled={q >= it.qtd}
                  aria-label="Mais"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-baseline justify-between border-t border-borda pt-3">
          <span className="text-sm text-texto-suave">{unidades} item(ns) dessa pessoa</span>
          <span className="text-2xl font-black text-acento tabular-nums">{brl(valor)}</span>
        </div>
        {tudo && (
          <p className="mt-2 text-xs font-semibold text-amber-600">
            Marcou a conta toda — pra isso use &quot;Fechar conta&quot;.
          </p>
        )}
      </Modal>

      <ModalPagamento
        aberto={pagando}
        titulo={`Pagar separado · ${nomeComanda(venda)}`}
        aPagar={valor}
        permitePrazo={false}
        textoConfirmar="Receber"
        aoFechar={() => setPagando(false)}
        aoConfirmar={async (r) => {
          const atual = vendaPorId(venda.id) ?? venda;
          // Tira da mesa só o que ainda está lá (alguém pode ter mexido na conta).
          const restantes = atual.itens.map((it) => ({ ...it }));
          const pagos: VendaItem[] = [];
          for (const e of escolhidos) {
            let falta = e.qtd;
            for (const it of restantes) {
              if (falta <= 0) break;
              if (it.produtoId !== e.produtoId || it.precoUn !== e.precoUn || it.qtd <= 0) continue;
              const tira = Math.min(falta, it.qtd);
              it.qtd -= tira;
              falta -= tira;
            }
            if (e.qtd - falta > 0) pagos.push({ ...e, qtd: e.qtd - falta });
          }
          if (pagos.length === 0) {
            setPagando(false);
            return;
          }
          const separada = novaVenda(
            {
              tipo: atual.tipo,
              itens: pagos,
              mesa: atual.mesa,
              garcom: atual.garcom,
              // Aparece como "Mesa 5 · Pago separado".
              clienteNome: atual.mesa ? "Pago separado" : `${nomeComanda(atual)} (separado)`,
              retirada: atual.retirada,
              obs: `Pago separado da comanda ${atual.numero}`,
            },
            proximoNumeroVenda(),
          );
          const final = await finalizar(separada, r);
          await salvarVenda({
            ...atual,
            itens: restantes.filter((it) => it.qtd > 0),
            atualizadoEm: new Date().toISOString(),
          });
          setPagando(false);
          aoPagar?.(final);
        }}
      />
    </>
  );
}

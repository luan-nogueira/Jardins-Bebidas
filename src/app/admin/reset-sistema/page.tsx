"use client";

import { useState } from "react";
import { Cabecalho } from "@/components/ui";
import { SomenteAdmin } from "@/components/Protegido";
import { useDados } from "@/lib/store";

/**
 * Zera o movimento (vendas, entradas, contas) mantendo os cadastros —
 * pra começar a usar de verdade depois do período de testes.
 */
export default function ResetSistemaPage() {
  return (
    <SomenteAdmin>
      <ResetInterno />
    </SomenteAdmin>
  );
}

function ResetInterno() {
  const {
    vendas,
    movimentos,
    contasPagar,
    produtos,
    removerVenda,
    removerMovimento,
    removerContaPagar,
    atualizarProduto,
  } = useDados();
  const [progresso, setProgresso] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  async function zerar() {
    if (confirmacao !== "ZERAR") return;
    setProgresso("Apagando vendas e comandas...");
    for (const v of vendas) await removerVenda(v.id);
    setProgresso("Apagando histórico de estoque...");
    for (const m of movimentos) await removerMovimento(m.id);
    setProgresso("Apagando contas a pagar...");
    for (const c of contasPagar) await removerContaPagar(c.id);
    setProgresso("Zerando estoque dos produtos...");
    for (const p of produtos) await atualizarProduto(p.id, { estoqueUn: 0 });
    setProgresso("Pronto! Sistema zerado. Produtos, clientes e fornecedores foram mantidos.");
    setConfirmacao("");
  }

  return (
    <>
      <Cabecalho titulo="Zerar movimento" subtitulo="Começar do zero depois dos testes" />
      <div className="max-w-xl space-y-4 px-4 md:px-6">
        <div className="card space-y-2 p-4 text-sm">
          <p className="font-bold">Isso apaga:</p>
          <ul className="list-disc pl-5 text-texto-suave">
            <li>Todas as vendas e comandas ({vendas.length})</li>
            <li>Todo o histórico de estoque ({movimentos.length})</li>
            <li>Todas as contas a pagar ({contasPagar.length})</li>
            <li>O estoque de todos os produtos volta pra 0</li>
          </ul>
          <p className="text-texto-suave">Produtos, clientes, fornecedores e equipe ficam.</p>
        </div>
        <label className="rotulo" htmlFor="conf">Digite ZERAR pra confirmar</label>
        <input id="conf" className="campo" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
        <button className="btn-perigo w-full" disabled={confirmacao !== "ZERAR"} onClick={zerar}>
          Zerar movimento
        </button>
        {progresso && <p className="text-sm font-semibold">{progresso}</p>}
      </div>
    </>
  );
}

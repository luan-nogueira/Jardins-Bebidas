"use client";

import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui";
import {
  CampoFornecedor,
  CamposPagamento,
  criarContasPrazo,
  resolverFornecedor,
  type FormaCompra,
} from "@/components/Compras";
import { useDados, novoId } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { brl, hojeISO, normalizar, paraNumero, temPalavras, somarDias } from "@/lib/format";
import type { EstoqueMovimento, Produto } from "@/lib/types";

/*
 * Entrada de mercadoria por nota: vários produtos de uma vez, cada um com
 * quantidade (caixas + unidades), custo e validade do lote. A nota pode ser
 * paga à vista ou a prazo — a prazo vira conta(s) a pagar com vencimento.
 */

interface LinhaEntrada {
  produtoId: string;
  cx: string;
  un: string;
  custoUn: string;
  validade: string;
}

/**
 * Custo médio do produto depois da compra: esta compra + as 2 compras com
 * custo mais recentes, ponderado pela quantidade (mesma regra do lançamento
 * avulso).
 */
function custoMedio(movimentos: EstoqueMovimento[], produtoId: string, qtd: number, custoUn: number) {
  const anteriores = movimentos
    .filter((m) => m.produtoId === produtoId && m.origem === "COMPRA" && m.custoUn)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
    .slice(0, 2);
  let soma = qtd * custoUn;
  let total = qtd;
  for (const m of anteriores) {
    soma += m.quantidadeUn * m.custoUn!;
    total += m.quantidadeUn;
  }
  return total > 0 ? soma / total : custoUn;
}

export function ModalEntrada({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Nova entrada (compra)" largura="max-w-2xl">
      {aberto && <FormEntrada aoFechar={aoFechar} />}
    </Modal>
  );
}

function FormEntrada({ aoFechar }: { aoFechar: () => void }) {
  const { permissoes } = useAuth();
  const {
    produtos,
    fornecedores,
    movimentos,
    produtoPorId,
    salvarFornecedor,
    salvarContaPagar,
    salvarMovimento,
    somarEstoque,
  } = useDados();

  const [fornecedorId, setFornecedorId] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [data, setData] = useState(hojeISO);
  const [linhas, setLinhas] = useState<LinhaEntrada[]>([]);
  const [busca, setBusca] = useState("");
  const [pagamento, setPagamento] = useState<FormaCompra>("AVISTA");
  const [vencimentos, setVencimentos] = useState<string[]>(() => [somarDias(hojeISO(), 30)]);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const sugestoes = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return [];
    return produtos
      .filter((p) => p.ativo && temPalavras(p.nome, termo))
      .slice(0, 8);
  }, [produtos, busca]);

  function adicionar(p: Produto) {
    setLinhas((ls) => [
      ...ls,
      {
        produtoId: p.id,
        cx: "",
        un: "",
        custoUn: p.precoCusto ? String(Math.round(p.precoCusto * 100) / 100).replace(".", ",") : "",
        validade: "",
      },
    ]);
    setBusca("");
  }

  function mudar(i: number, campo: Partial<LinhaEntrada>) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...campo } : l)));
  }

  const calculadas = linhas.map((l) => {
    const p = produtoPorId(l.produtoId);
    const porCx = Math.max(1, p?.unPorCaixa ?? 1);
    const qtd = paraNumero(l.cx) * porCx + paraNumero(l.un);
    const custo = paraNumero(l.custoUn);
    return { ...l, produto: p, porCx, qtd, custo, subtotal: qtd * custo };
  });
  const total = calculadas.reduce((s, l) => s + l.subtotal, 0);
  const valido = calculadas.length > 0 && calculadas.every((l) => l.qtd > 0 && l.produto);

  async function salvar() {
    if (!valido || salvando) return;
    setSalvando(true);
    try {
      const compraId = novoId();
      const fornecedor = await resolverFornecedor(fornecedores, salvarFornecedor, fornecedorId, novoFornecedor);
      const descricao = `Entrada${fornecedor.nome ? `: ${fornecedor.nome}` : ""}${nota ? ` NF ${nota}` : ""}`;

      let contaPagarIds: string[] | undefined;
      if (pagamento === "PRAZO" && total > 0) {
        contaPagarIds = await criarContasPrazo(salvarContaPagar, {
          valorTotal: Math.round(total * 100) / 100,
          vencimentos,
          descricao,
          fornecedor,
          obs: obs || undefined,
          compraId,
        });
      }

      for (const l of calculadas) {
        const p = l.produto!;
        await salvarMovimento({
          id: novoId(),
          produtoId: p.id,
          produtoNome: p.nome,
          tipo: "ENTRADA",
          origem: "COMPRA",
          quantidadeUn: l.qtd,
          custoUn: l.custo || undefined,
          fornecedorId: fornecedor.id,
          pagamento,
          contaPagarIds,
          referenciaId: compraId,
          nota: nota.trim() || undefined,
          validade: l.validade || undefined,
          data,
          obs: obs.trim() || undefined,
          criadoEm: new Date().toISOString(),
        });
        await somarEstoque(
          p.id,
          l.qtd,
          l.custo ? { precoCusto: custoMedio(movimentos, p.id, l.qtd, l.custo) } : {},
        );
      }
      aoFechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-5">
      <CampoFornecedor
        fornecedores={fornecedores}
        fornecedorId={fornecedorId}
        novoNome={novoFornecedor}
        podeCadastrar={permissoes.fornecedores || permissoes.estoque}
        aoMudar={(id, nome) => {
          setFornecedorId(id);
          setNovoFornecedor(nome);
        }}
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className="rotulo" htmlFor="ent-nota">Nº da nota</label>
          <input id="ent-nota" className="campo" placeholder="opcional" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        <div className="min-w-0">
          <label className="rotulo" htmlFor="ent-data">Data da entrada</label>
          <input id="ent-data" type="date" className="campo" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="rotulo">Produtos</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-texto-suave" />
          <input
            className="campo pl-9"
            placeholder="Digite pra adicionar um produto…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {sugestoes.length > 0 && (
            <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-borda bg-superficie shadow-xl">
              {sugestoes.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full border-b border-borda px-4 py-2.5 text-left text-sm last:border-0 hover:bg-superficie-2"
                    onClick={() => adicionar(p)}
                  >
                    <span className="font-semibold">{p.nome}</span>
                    <span className="ml-2 text-xs text-texto-suave">estoque {p.estoqueUn} un</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {calculadas.length > 0 && (
          <ul className="mt-3 space-y-2">
            {calculadas.map((l, i) => (
              <li key={i} className="rounded-xl border border-borda p-3">
                <div className="mb-2 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">
                    {l.produto?.nome}
                    {l.porCx > 1 && <span className="ml-1 text-xs font-normal text-texto-suave">({l.porCx} un/cx)</span>}
                  </p>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{brl(l.subtotal)}</span>
                  <button
                    type="button"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-texto-suave hover:text-red-600"
                    onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                    aria-label="Tirar produto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Campo rotulo="Caixas" valor={l.cx} desativado={l.porCx <= 1} aoMudar={(v) => mudar(i, { cx: v })} />
                  <Campo rotulo="Unidades" valor={l.un} aoMudar={(v) => mudar(i, { un: v })} />
                  <Campo rotulo="Custo / un" valor={l.custoUn} decimal aoMudar={(v) => mudar(i, { custoUn: v })} />
                  <div className="min-w-0">
                    <label className="mb-0.5 block text-[10px] font-semibold text-texto-suave uppercase">Validade</label>
                    <input
                      type="date"
                      className="campo h-9 px-2 py-1 text-sm"
                      value={l.validade}
                      onChange={(e) => mudar(i, { validade: e.target.value })}
                    />
                  </div>
                </div>
                {l.qtd > 0 && l.porCx > 1 && (
                  <p className="mt-1 text-[11px] text-texto-suave">Total: {l.qtd} un</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-baseline justify-between border-t border-borda pt-3">
        <span className="text-sm text-texto-suave">Total da nota</span>
        <span className="text-2xl font-black text-acento tabular-nums">{brl(total)}</span>
      </div>

      {total > 0 && (
        <CamposPagamento
          podePrazo
          pagamento={pagamento}
          setPagamento={setPagamento}
          vencimentos={vencimentos}
          setVencimentos={setVencimentos}
          valorTotal={Math.round(total * 100) / 100}
        />
      )}

      <div>
        <label className="rotulo" htmlFor="ent-obs">Observação</label>
        <input id="ent-obs" className="campo" placeholder="opcional" value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 border-t border-borda pt-4">
        <button className="btn-secundario" onClick={aoFechar} disabled={salvando}>
          Cancelar
        </button>
        <button className="btn-primario" onClick={salvar} disabled={!valido || salvando}>
          {salvando ? "Salvando…" : "Dar entrada no estoque"}
        </button>
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  decimal = false,
  desativado = false,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  decimal?: boolean;
  desativado?: boolean;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-0.5 block text-[10px] font-semibold text-texto-suave uppercase">{rotulo}</label>
      <input
        className="campo h-9 px-2 py-1 text-sm tabular-nums disabled:opacity-50"
        inputMode={decimal ? "decimal" : "numeric"}
        placeholder="0"
        value={valor}
        disabled={desativado}
        onChange={(e) => aoMudar(e.target.value)}
      />
    </div>
  );
}

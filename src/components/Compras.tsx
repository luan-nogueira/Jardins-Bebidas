"use client";

import { useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Modal } from "@/components/ui";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { novoId } from "@/lib/db";
import { brl, caixasEUnidades, dataBR, hojeISO, normalizar } from "@/lib/format";
import { paraCaixas } from "@/lib/calc";
import type {
  ContaPagar,
  EstoqueMovimento,
  EstoqueOrigem,
  Fornecedor,
  Produto,
} from "@/lib/types";

/*
 * Lançamento e edição de compra — usados no Estoque (junto com ajuste e
 * perda) e na aba Compras.
 */

/** Soma dias a uma data YYYY-MM-DD, sem passar por UTC. */
function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export type FormaCompra = "AVISTA" | "PRAZO";

/** Divide em parcelas de centavos inteiros; a última leva a sobra do arredondamento. */
function dividirParcelas(valor: number, n: number): number[] {
  const centavos = Math.round(valor * 100);
  const base = Math.floor(centavos / n);
  return Array.from({ length: n }, (_, i) =>
    (i === n - 1 ? centavos - base * (n - 1) : base) / 100,
  );
}

/** Contas a pagar de uma compra — aceita o formato antigo (uma conta só). */
export function idsDasContas(m: EstoqueMovimento): string[] {
  return m.contaPagarIds ?? (m.contaPagarId ? [m.contaPagarId] : []);
}

/**
 * Devolve o fornecedor escolhido; se foi digitado um nome novo, cadastra
 * (ou reaproveita um já existente com o mesmo nome).
 */
export async function resolverFornecedor(
  fornecedores: Fornecedor[],
  salvarFornecedor: (f: Fornecedor) => Promise<void>,
  fornecedorId: string,
  novoNome: string | null,
): Promise<{ id?: string; nome?: string }> {
  const nome = novoNome?.trim();
  if (nome) {
    const existente = fornecedores.find((f) => normalizar(f.nome) === normalizar(nome));
    if (existente) return { id: existente.id, nome: existente.nome };
    const id = novoId();
    await salvarFornecedor({ id, nome, ativo: true, criadoEm: new Date().toISOString() });
    return { id, nome };
  }
  const f = fornecedores.find((x) => x.id === fornecedorId);
  return f ? { id: f.id, nome: f.nome } : {};
}

/** Cria uma conta a pagar por parcela, uma para cada data de vencimento. */
export async function criarContasPrazo(
  salvarContaPagar: (c: ContaPagar) => Promise<void>,
  dados: {
    valorTotal: number;
    vencimentos: string[];
    descricao: string;
    fornecedor: { id?: string; nome?: string };
    obs?: string;
    compraId?: string;
  },
): Promise<string[]> {
  const n = dados.vencimentos.length;
  const valores = dividirParcelas(dados.valorTotal, n);
  const ids: string[] = [];
  for (let i = 0; i < valores.length; i++) {
    const id = novoId();
    await salvarContaPagar({
      id,
      descricao:
        n > 1
          ? `${dados.descricao} (${i + 1}/${n})`
          : dados.descricao,
      fornecedorId: dados.fornecedor.id,
      fornecedorNome: dados.fornecedor.nome,
      valor: valores[i],
      vencimento: dados.vencimentos[i] || hojeISO(),
      obs: dados.obs || undefined,
      compraId: dados.compraId,
      pago: false,
      criadoEm: new Date().toISOString(),
    });
    ids.push(id);
  }
  return ids;
}

export function CampoFornecedor({
  fornecedores,
  fornecedorId,
  novoNome,
  aoMudar,
  podeCadastrar,
}: {
  fornecedores: Fornecedor[];
  fornecedorId: string;
  /** Sem a permissão "fornecedores" o Firestore recusa o cadastro. */
  podeCadastrar: boolean;
  /** null = escolhendo da lista; string = digitando um fornecedor novo. */
  novoNome: string | null;
  aoMudar: (fornecedorId: string, novoNome: string | null) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold">Fornecedor (Opcional)</label>
      {novoNome === null ? (
        <select
          value={fornecedorId}
          onChange={(e) =>
            e.target.value === "__novo__" ? aoMudar("", "") : aoMudar(e.target.value, null)
          }
          className="campo block w-full"
        >
          <option value="">Nenhum fornecedor vinculado</option>
          {fornecedores
            .filter((f) => f.ativo !== false)
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          {podeCadastrar && <option value="__novo__">+ Cadastrar novo fornecedor</option>}
        </select>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              autoFocus
              className="campo min-w-0 flex-1"
              placeholder="Nome do fornecedor"
              value={novoNome}
              onChange={(e) => aoMudar("", e.target.value)}
            />
            <button type="button" className="btn-secundario shrink-0" onClick={() => aoMudar("", null)}>
              Cancelar
            </button>
          </div>
          <p className="mt-1 text-xs text-texto-suave">
            Será cadastrado ao confirmar. Telefone e outros dados dá pra completar
            depois em Fornecedores.
          </p>
        </>
      )}
    </div>
  );
}

/** "MES" = todo mês no mesmo dia; número = a cada N dias. */
type Intervalo = "MES" | number;

const INTERVALOS: { valor: Intervalo; rotulo: string }[] = [
  { valor: "MES", rotulo: "Todo mês" },
  { valor: 7, rotulo: "A cada 7 dias" },
  { valor: 10, rotulo: "A cada 10 dias" },
  { valor: 14, rotulo: "A cada 14 dias" },
  { valor: 15, rotulo: "A cada 15 dias" },
  { valor: 21, rotulo: "A cada 21 dias" },
  { valor: 28, rotulo: "A cada 28 dias" },
  { valor: 30, rotulo: "A cada 30 dias" },
];

function gerarVencimentos(primeiro: string, n: number, intervalo: Intervalo): string[] {
  const base = primeiro || hojeISO();
  return Array.from({ length: n }, (_, i) =>
    intervalo === "MES" ? somarMeses(base, i) : somarDias(base, intervalo * i),
  );
}

export function CamposPagamento({
  pagamento,
  setPagamento,
  vencimentos,
  setVencimentos,
  valorTotal,
  bloqueado,
  podePrazo,
}: {
  /** A prazo cria contas a pagar — exige a permissão "financeiro". */
  podePrazo: boolean;
  pagamento: FormaCompra;
  setPagamento: (p: FormaCompra) => void;
  /** Uma data por parcela — a quantidade de parcelas é o tamanho da lista. */
  vencimentos: string[];
  setVencimentos: (v: string[]) => void;
  valorTotal: number;
  /** Mensagem quando não dá pra mudar (ex.: já tem parcela paga). */
  bloqueado?: string;
}) {
  const [intervalo, setIntervalo] = useState<Intervalo>("MES");
  const parcelas = vencimentos.length;
  const primeiro = vencimentos[0] ?? "";
  const valores = valorTotal > 0 ? dividirParcelas(valorTotal, parcelas) : [];

  // Mudar parcelas, intervalo ou 1º vencimento recalcula as datas; editar a
  // data de uma parcela específica mexe só nela.
  function mudarDataParcela(i: number, data: string) {
    if (i === 0) {
      setVencimentos(gerarVencimentos(data, parcelas, intervalo));
      return;
    }
    const novas = [...vencimentos];
    novas[i] = data;
    setVencimentos(novas);
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold">Pagamento</label>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-superficie-2 p-1">
        {(["AVISTA", "PRAZO"] as const).map((op) => (
          <button
            key={op}
            type="button"
            disabled={!!bloqueado || (op === "PRAZO" && !podePrazo)}
            onClick={() => setPagamento(op)}
            className={`rounded-lg py-2 text-sm font-bold transition disabled:opacity-60 ${
              pagamento === op ? "bg-superficie shadow-sm" : "text-texto-suave"
            }`}
          >
            {op === "AVISTA" ? "À vista" : "A prazo"}
          </button>
        ))}
      </div>
      {bloqueado && <p className="mt-1 text-xs text-texto-suave">{bloqueado}</p>}
      {!podePrazo && !bloqueado && (
        <p className="mt-1 text-xs text-texto-suave">
          Compra a prazo só pra quem tem acesso ao Financeiro (ela cria contas a pagar).
        </p>
      )}
      {pagamento === "PRAZO" && !bloqueado && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="mb-1.5 block text-sm font-semibold" htmlFor="parcelas-compra">
                Parcelas
              </label>
              <select
                id="parcelas-compra"
                value={parcelas}
                onChange={(e) =>
                  setVencimentos(gerarVencimentos(primeiro, Number(e.target.value), intervalo))
                }
                className="campo block w-full"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "1x (única)" : `${n}x`}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="mb-1.5 block text-sm font-semibold" htmlFor="vencimento-compra">
                {parcelas > 1 ? "1º vencimento" : "Vencimento"}
              </label>
              <input
                id="vencimento-compra"
                type="date"
                required
                value={primeiro}
                onChange={(e) => mudarDataParcela(0, e.target.value)}
                className="campo block w-full"
              />
            </div>
          </div>

          {parcelas > 1 && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-semibold" htmlFor="intervalo-compra">
                  Intervalo entre parcelas
                </label>
                <select
                  id="intervalo-compra"
                  value={String(intervalo)}
                  onChange={(e) => {
                    const novo: Intervalo =
                      e.target.value === "MES" ? "MES" : Number(e.target.value);
                    setIntervalo(novo);
                    setVencimentos(gerarVencimentos(primeiro, parcelas, novo));
                  }}
                  className="campo block w-full"
                >
                  {INTERVALOS.map((op) => (
                    <option key={String(op.valor)} value={String(op.valor)}>
                      {op.rotulo}
                    </option>
                  ))}
                </select>
              </div>

              <ul className="divide-y divide-borda rounded-xl border border-borda text-sm">
                {vencimentos.map((data, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="w-9 shrink-0 text-xs text-texto-suave tabular-nums">
                      {i + 1}/{parcelas}
                    </span>
                    <input
                      type="date"
                      aria-label={`Vencimento da parcela ${i + 1}`}
                      value={data}
                      onChange={(e) => mudarDataParcela(i, e.target.value)}
                      className="campo h-auto min-h-0 min-w-0 flex-1 px-2 py-1 text-sm"
                    />
                    <span className="w-24 shrink-0 text-right font-semibold tabular-nums">
                      {valores[i] !== undefined ? brl(valores[i]) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-texto-suave">
            {parcelas > 1
              ? "Toque numa data pra mudar só aquela parcela. Cada parcela entra em Financeiro → Contas a pagar."
              : "Vai entrar em Financeiro → Contas a pagar com o valor total da compra."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Mesmo dia N meses depois (parcela mensal). Se o mês não tem esse dia
 * (ex.: 31), cai no último dia do mês.
 */
function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const ultimoDia = new Date(a, m - 1 + meses + 1, 0).getDate();
  const dt = new Date(a, m - 1 + meses, Math.min(d, ultimoDia));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** Primeiro dia do mês atual, formato YYYY-MM-DD. */
export function inicioDoMes(): string {
  const hoje = new Date();
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
}

/** Lançamento manual de estoque: compra, ajuste por contagem ou perda. */
export function ModalNovoMovimento({
  aberto,
  aoFechar,
  tipos = ["COMPRA", "AJUSTE", "PERDA"],
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** Só um tipo = esconde a escolha (a aba Compras só lança compra). */
  tipos?: EstoqueOrigem[];
}) {
  const { permissoes } = useAuth();
  const {
    movimentos,
    produtos,
    fornecedores,
    salvarMovimento,
    somarEstoque,
    atualizarProduto,
    salvarFornecedor,
    salvarContaPagar,
    produtoPorId,
  } = useDados();
  const [salvando, setSalvando] = useState(false);

  // Form do lançamento manual
  const [tipoMovimento, setTipoMovimento] = useState<EstoqueOrigem>(tipos[0]);
  const [produtoId, setProdutoId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  // Cadastro rápido de fornecedor direto na compra, só com o nome.
  const [novoFornecedor, setNovoFornecedor] = useState<string | null>(null);
  const [pagamento, setPagamento] = useState<FormaCompra>("AVISTA");
  const [vencimentos, setVencimentos] = useState<string[]>(() => [somarDias(hojeISO(), 30)]);
  const [quantidadeUn, setQuantidadeUn] = useState("");
  // Contagem do galpão em caixas (as unidades soltas vão em quantidadeUn).
  const [contagemCx, setContagemCx] = useState("");
  const [custoTotal, setCustoTotal] = useState("");
  const [custoUn, setCustoUn] = useState("");
  const [obs, setObs] = useState("");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [focoBusca, setFocoBusca] = useState(false);

  const produtoSelecionado = produtoId ? produtoPorId(produtoId) : undefined;

  // Ajuste = "contei X no galpão". O sistema lança só a diferença pro
  // estoque bater com a contagem, em vez de a pessoa ter que fazer a conta.
  const contagem = useMemo(() => {
    if (quantidadeUn === "" && contagemCx === "") return null;
    const porCaixa = produtoSelecionado?.unPorCaixa ?? 1;
    return Number(contagemCx || 0) * porCaixa + Number(quantidadeUn || 0);
  }, [quantidadeUn, contagemCx, produtoSelecionado]);

  // Quanto o histórico diz que o produto selecionado tem: tudo que entrou
  // menos o que saiu. Deveria ser igual ao estoqueUn — quando não é, o
  // número do estoque se perdeu em algum lançamento (ex.: compra editada na
  // versão que ainda não mexia no estoque). Lançamento de pedido excluído
  // fica de fora: o estoque dele já foi devolvido na exclusão.
  const historicoSelecionado = useMemo(() => {
    if (!produtoSelecionado) return 0;
    return movimentos.reduce((soma, m) => {
      if (m.produtoId !== produtoSelecionado.id) return soma;
      return soma + (m.tipo === "SAIDA" ? -m.quantidadeUn : m.quantidadeUn);
    }, 0);
  }, [produtoSelecionado, movimentos]);

  const qtdCalculada = useMemo(() => {
    const porCaixa = produtoSelecionado?.unPorCaixa ?? 1;
    return Number(contagemCx || 0) * porCaixa + Number(quantidadeUn || 0);
  }, [quantidadeUn, contagemCx, produtoSelecionado]);

  const produtosOrdenados = [...produtos].filter((p) => p.ativo);
  const produtosFiltrados = produtosOrdenados.filter((p) =>
    p.nome.toLowerCase().includes(buscaProduto.toLowerCase()),
  );

  function limparFormulario() {
    aoFechar();
    setProdutoId("");
    setBuscaProduto("");
    setFornecedorId("");
    setNovoFornecedor(null);
    setPagamento("AVISTA");
    setVencimentos([somarDias(hojeISO(), 30)]);
    setQuantidadeUn("");
    setContagemCx("");
    setCustoTotal("");
    setCustoUn("");
    setObs("");
    setTipoMovimento(tipos[0]);
  }

  async function lancarAjuste(produto: Produto) {
    if (contagem === null || contagem < 0) return;
    // O lançamento é a diferença pro histórico, não pro estoqueUn. Quando o
    // estoque estava errado mas o histórico certo (84 no sistema, 120 de
    // compra, 120 contados), lançar "+36" fazia o histórico somar 156 com
    // 120 no estoque. Assim, depois de um ajuste o histórico sempre fecha
    // com o estoque.
    const historico = historicoSelecionado;
    const diferenca = contagem - historico;
    if (diferenca === 0 && contagem === produto.estoqueUn) {
      window.alert("A contagem bate com o estoque do sistema — nada a ajustar.");
      return;
    }
    if (diferenca !== 0) {
      const antes =
        historico === produto.estoqueUn
          ? `sistema tinha ${produto.estoqueUn}`
          : `sistema tinha ${produto.estoqueUn}, histórico somava ${historico}`;
      await salvarMovimento({
        id: novoId(),
        produtoId: produto.id,
        produtoNome: produto.nome,
        tipo: diferenca > 0 ? "ENTRADA" : "SAIDA",
        origem: "AJUSTE",
        quantidadeUn: Math.abs(diferenca),
        data: hojeISO(),
        obs: [`Contagem: ${contagem} un (${antes})`, obs].filter(Boolean).join(" · "),
        criadoEm: new Date().toISOString(),
      });
    }
    if (contagem !== produto.estoqueUn) {
      // Ajuste é a contagem do galpão: grava o número, não uma soma.
      await atualizarProduto(produto.id, { estoqueUn: contagem });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const produto = produtoSelecionado;
    if (!produto) return;

    if (tipoMovimento === "AJUSTE") {
      setSalvando(true);
      try {
        await lancarAjuste(produto);
        limparFormulario();
      } finally {
        setSalvando(false);
      }
      return;
    }

    const qtd = qtdCalculada;
    if (qtd <= 0) return;
    const compra = tipoMovimento === "COMPRA";

    setSalvando(true);
    try {
      const fornecedor = compra
        ? await resolverFornecedor(fornecedores, salvarFornecedor, fornecedorId, novoFornecedor)
        : {};

      let textoLancado = "";
      if (contagemCx && quantidadeUn) {
        textoLancado = `Lançado: ${contagemCx}cx e ${quantidadeUn}un`;
      } else if (contagemCx) {
        textoLancado = `Lançado: ${contagemCx}cx`;
      } else if (quantidadeUn) {
        textoLancado = `Lançado: ${quantidadeUn}un`;
      }
      const obsFinal = [textoLancado, obs].filter(Boolean).join(" · ");

      // Compra a prazo vira conta(s) a pagar no Financeiro, uma por parcela.
      let contaPagarIds: string[] | undefined;
      if (compra && pagamento === "PRAZO" && permissoes.financeiro && Number(custoTotal) > 0) {
        contaPagarIds = await criarContasPrazo(salvarContaPagar, {
          valorTotal: Number(custoTotal),
          vencimentos,
          descricao: `Compra: ${qtd} un de ${produto.nome}`,
          fornecedor,
          obs: obsFinal,
        });
      }

      let custoUn: number | undefined = undefined;
      if (compra && custoTotal) {
        custoUn = Number(custoTotal) / qtd;
      }

      await salvarMovimento({
        id: novoId(),
        produtoId: produto.id,
        produtoNome: produto.nome,
        tipo: compra ? "ENTRADA" : "SAIDA",
        origem: tipoMovimento,
        quantidadeUn: qtd,
        custoUn,
        fornecedorId: fornecedor.id,
        pagamento: compra ? pagamento : undefined,
        contaPagarIds,
        // Data local (não toISOString) — depois das 21h no fuso do Brasil,
        // o timestamp UTC já vira o dia seguinte e a movimentação aparecia
        // com a data errada no histórico.
        data: hojeISO(),
        obs: obsFinal || undefined,
        criadoEm: new Date().toISOString(),
      });

      let novoPrecoCusto = produto.precoCusto;
      if (compra && custoUn !== undefined) {
        const comprasAnteriores = movimentos
          .filter((m) => m.produtoId === produto.id && m.origem === "COMPRA" && m.custoUn !== undefined)
          .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
          .slice(0, 2);

        let totalSoma = qtd * custoUn;
        let totalQtd = qtd;

        for (const c of comprasAnteriores) {
          totalSoma += c.quantidadeUn * c.custoUn!;
          totalQtd += c.quantidadeUn;
        }

        novoPrecoCusto = totalSoma / totalQtd;
      }

      // Sem clamp em 0: negativo avisa que o lançado não bate com a
      // realidade, em vez de esconder o problema.
      await somarEstoque(produto.id, compra ? qtd : -qtd, { precoCusto: novoPrecoCusto });

      limparFormulario();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={() => !salvando && aoFechar()}
      titulo={
        tipos.length === 1
          ? { COMPRA: "Nova compra", AJUSTE: "Contar estoque", PERDA: "Registrar perda ou quebra", VENDA: "", ESTORNO: "" }[tipos[0]]
          : "Lançar no estoque"
      }
      rodape={
        <>
          <button
            type="button"
            disabled={salvando}
            onClick={aoFechar}
            className="btn-secundario px-4 py-2"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="form-movimento"
            disabled={
              salvando ||
              !produtoId ||
              (tipoMovimento === "AJUSTE" ? contagem === null : qtdCalculada <= 0)
            }
            className="btn-primario px-6 py-2"
          >
            {salvando
              ? "Salvando..."
              : tipoMovimento === "AJUSTE"
                ? "Salvar contagem"
                : tipoMovimento === "PERDA"
                  ? "Registrar perda"
                  : "Dar entrada"}
          </button>
        </>
      }
    >
      <form id="form-movimento" onSubmit={handleSubmit} className="space-y-5">
        {tipos.length > 1 && (
          <div className="flex gap-2 p-1 bg-superficie-2 rounded-xl overflow-x-auto">
            {tipos.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipoMovimento(t)}
                className={`flex-1 min-w-[100px] rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition ${
                  tipoMovimento === t
                    ? "bg-superficie text-texto shadow-sm border border-borda"
                    : "text-texto-suave hover:text-texto"
                }`}
              >
                {{ COMPRA: "Compra", AJUSTE: "Contagem", PERDA: "Perda", VENDA: "Venda", ESTORNO: "Estorno" }[t]}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <label className="mb-1.5 block text-sm font-semibold">Produto</label>
          <input
            type="text"
            value={produtoId ? produtos.find((p) => p.id === produtoId)?.nome || "" : buscaProduto}
            onChange={(e) => {
              setBuscaProduto(e.target.value);
              setProdutoId("");
            }}
            onFocus={() => setFocoBusca(true)}
            onBlur={() => setTimeout(() => setFocoBusca(false), 200)}
            required
            placeholder="Digite o nome do produto..."
            className="campo block w-full"
          />
          {focoBusca && !produtoId && (
            <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-borda bg-superficie shadow-xl">
              {produtosFiltrados.length > 0 ? (
                produtosFiltrados.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => {
                      setProdutoId(p.id);
                      setBuscaProduto(p.nome);
                      setFocoBusca(false);
                    }}
                    className="cursor-pointer px-4 py-3 hover:bg-superficie-2 text-sm border-b border-borda last:border-0 transition-colors"
                  >
                    <span className="font-semibold">{p.nome}</span>
                    <span className="text-texto-suave text-xs ml-2">(Estoque atual: {p.estoqueUn} un)</span>
                  </li>
                ))
              ) : (
                <li className="px-4 py-3 text-texto-suave text-sm text-center">Nenhum produto encontrado</li>
              )}
            </ul>
          )}
        </div>

        {tipoMovimento === "COMPRA" && (
          <CampoFornecedor
            fornecedores={fornecedores}
            fornecedorId={fornecedorId}
            novoNome={novoFornecedor}
            podeCadastrar={permissoes.fornecedores}
            aoMudar={(id, nome) => {
              setFornecedorId(id);
              setNovoFornecedor(nome);
            }}
          />
        )}

        {tipoMovimento === "AJUSTE" ? (
          <div>
            <label className="mb-1.5 block text-sm font-semibold">
              Quanto tem na loja agora
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative min-w-0">
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={contagemCx}
                  onChange={(e) => setContagemCx(e.target.value)}
                  placeholder="0"
                  disabled={(produtoSelecionado?.unPorCaixa ?? 1) <= 1}
                  className="campo block w-full pr-10 disabled:opacity-50"
                />
                <span className="pointer-events-none absolute top-2.5 right-4 text-sm text-texto-suave">cx</span>
              </div>
              <div className="relative min-w-0">
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={quantidadeUn}
                  onChange={(e) => setQuantidadeUn(e.target.value)}
                  placeholder="0"
                  className="campo block w-full pr-10"
                />
                <span className="pointer-events-none absolute top-2.5 right-4 text-sm text-texto-suave">un</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-texto-suave">
              Digite o total que tem na loja agora (não o quanto somar).
            </p>
            {produtoSelecionado && contagem !== null && (
              <div className="mt-2 rounded-xl border border-borda bg-superficie-2 px-3 py-2 text-sm">
                <p>
                  Estoque vai ficar em{" "}
                  <strong className="tabular-nums">{contagem} un</strong>
                  {produtoSelecionado.unPorCaixa > 1 && (
                    <span className="text-texto-suave">
                      {" "}({caixasEUnidades(contagem, produtoSelecionado.unPorCaixa)})
                    </span>
                  )}
                </p>
                <p className="text-xs text-texto-suave">
                  Hoje o sistema mostra {produtoSelecionado.estoqueUn} un — a correção é de{" "}
                  <strong
                    className={
                      contagem - produtoSelecionado.estoqueUn < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }
                  >
                    {contagem - produtoSelecionado.estoqueUn > 0 ? "+" : ""}
                    {contagem - produtoSelecionado.estoqueUn} un
                  </strong>
                  .
                </p>
                {historicoSelecionado !== produtoSelecionado.estoqueUn && (
                  <p className="text-xs text-texto-suave">
                    {contagem === historicoSelecionado
                      ? `O histórico já soma ${contagem} un — só o número do estoque é corrigido.`
                      : `O histórico soma ${historicoSelecionado} un — o lançamento vai ser de ${
                          contagem - historicoSelecionado > 0 ? "+" : ""
                        }${contagem - historicoSelecionado} un.`}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                {tipoMovimento === "PERDA" ? "Quanto perdeu / quebrou" : "Quantidade que chegou"}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative min-w-0">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={contagemCx}
                    onChange={(e) => {
                      setContagemCx(e.target.value);
                      if (custoUn) {
                        const novaQtd = Number(e.target.value || 0) * (produtoSelecionado?.unPorCaixa ?? 1) + Number(quantidadeUn || 0);
                        if (novaQtd > 0) setCustoTotal((Number(custoUn) * novaQtd).toFixed(2));
                      }
                    }}
                    placeholder="0"
                    disabled={(produtoSelecionado?.unPorCaixa ?? 1) <= 1}
                    className="campo block w-full pr-10 disabled:opacity-50"
                  />
                  <span className="pointer-events-none absolute top-2.5 right-4 text-sm text-texto-suave">cx</span>
                </div>
                <div className="relative min-w-0">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={quantidadeUn}
                    onChange={(e) => {
                      setQuantidadeUn(e.target.value);
                      if (custoUn) {
                        const novaQtd = Number(contagemCx || 0) * (produtoSelecionado?.unPorCaixa ?? 1) + Number(e.target.value || 0);
                        if (novaQtd > 0) setCustoTotal((Number(custoUn) * novaQtd).toFixed(2));
                      }
                    }}
                    placeholder="0"
                    className="campo block w-full pr-10"
                  />
                  <span className="pointer-events-none absolute top-2.5 right-4 text-sm text-texto-suave">un</span>
                </div>
              </div>
              {produtoSelecionado && qtdCalculada > 0 && (produtoSelecionado?.unPorCaixa ?? 1) > 1 && (
                <p className="mt-1 text-xs text-texto-suave">
                  Total: <strong className="text-texto">{qtdCalculada} un</strong>
                </p>
              )}
            </div>

            {tipoMovimento === "COMPRA" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Custo Un (R$)</label>
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    value={custoUn}
                    onChange={(e) => {
                       setCustoUn(e.target.value);
                       if (e.target.value && qtdCalculada > 0) {
                         setCustoTotal((Number(e.target.value) * qtdCalculada).toFixed(2));
                       } else if (!e.target.value) {
                         setCustoTotal("");
                       }
                    }}
                    placeholder="0,00"
                    className="campo block w-full"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Custo Total (R$)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={custoTotal}
                    onChange={(e) => {
                       setCustoTotal(e.target.value);
                       if (e.target.value && qtdCalculada > 0) {
                         setCustoUn((Number(e.target.value) / qtdCalculada).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''));
                       } else if (!e.target.value) {
                         setCustoUn("");
                       }
                    }}
                    required
                    placeholder="0,00"
                    className="campo block w-full"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {tipoMovimento === "COMPRA" && (
          <CamposPagamento
            podePrazo={permissoes.financeiro}
            pagamento={pagamento}
            setPagamento={setPagamento}
            vencimentos={vencimentos}
            setVencimentos={setVencimentos}
            valorTotal={Number(custoTotal) || 0}
          />
        )}

        {tipoMovimento === "COMPRA" && qtdCalculada > 0 && custoTotal && (
          <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-3">
            <div className="bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400 p-2 rounded-lg shrink-0">
              <RefreshCcw className="w-5 h-5" />
            </div>
            <p className="text-xs text-emerald-800 dark:text-emerald-300">
              Isso atualizará o <strong>Custo Médio Ponderado</strong> do produto. <br />
              O custo unitário dessa compra saiu a{" "}
              <strong>{brl(Number(custoTotal) / qtdCalculada)}</strong>.
            </p>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-semibold">Observação (Opcional)</label>
          <input
            type="text"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder={tipoMovimento === "PERDA" ? "Ex: garrafa quebrou na entrega" : "Ex: contagem de sexta"}
            className="campo block w-full"
          />
        </div>
      </form>
    </Modal>
  );
}

/** "a prazo, 3x · 1 paga · vence 10/11/2026" a partir das contas da compra. */
export function resumoPrazo(m: EstoqueMovimento, contasPagar: ContaPagar[]): string {
  const contas = idsDasContas(m)
    .map((id) => contasPagar.find((c) => c.id === id))
    .filter((c): c is ContaPagar => !!c);
  if (contas.length === 0) return "a prazo";
  const partes = ["a prazo" + (contas.length > 1 ? `, ${contas.length}x` : "")];
  const pagas = contas.filter((c) => c.pago).length;
  if (pagas === contas.length) {
    partes.push("pago");
  } else {
    if (pagas > 0) partes.push(`${pagas} paga${pagas > 1 ? "s" : ""}`);
    const proxima = contas
      .filter((c) => !c.pago)
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
    partes.push(`vence ${dataBR(proxima.vencimento)}`);
  }
  return partes.join(" · ");
}

/**
 * Troca o "Lançado: 2cx e 3un" do começo da observação pela quantidade
 * corrigida, mantendo o resto do que foi escrito.
 */
function obsComLancado(obs: string | undefined, cx: string, un: string): string | undefined {
  const resto = (obs ?? "").replace(/^Lançado: [^·]*(· )?/, "").trim();
  const nCx = Number(cx || 0);
  const nUn = Number(un || 0);
  const lancado =
    nCx && nUn
      ? `Lançado: ${nCx}cx e ${nUn}un`
      : nCx
        ? `Lançado: ${nCx}cx`
        : nUn
          ? `Lançado: ${nUn}un`
          : "";
  return [lancado, resto].filter(Boolean).join(" · ") || undefined;
}

/**
 * Corrige fornecedor, quantidade, valor e forma de pagamento de uma compra já lançada.
 * Se já tem parcela paga, a forma de pagamento e parcelas não são recriadas.
 */
export function ModalEditarCompra({
  movimento,
  aoFechar,
}: {
  movimento: EstoqueMovimento;
  aoFechar: () => void;
}) {
  const { permissoes } = useAuth();
  const {
    fornecedores,
    contasPagar,
    salvarFornecedor,
    salvarContaPagar,
    removerContaPagar,
    salvarMovimento,
    produtoPorId,
    somarEstoque,
    atualizarProduto,
    removerMovimento,
    movimentos,
  } = useDados();

  const produto = produtoPorId(movimento.produtoId);
  const unPorCaixa = Math.max(1, produto?.unPorCaixa ?? 1);

  const contas = useMemo(
    () =>
      idsDasContas(movimento)
        .map((id) => contasPagar.find((c) => c.id === id))
        .filter((c): c is ContaPagar => !!c)
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    [movimento, contasPagar],
  );
  const algumaPaga = contas.some((c) => c.pago);

  const inicial = {
    pagamento: (movimento.pagamento ?? "AVISTA") as FormaCompra,
    vencimentos:
      contas.length > 0
        ? contas.map((c) => c.vencimento)
        : [somarDias(movimento.data.slice(0, 10), 30)],
  };

  const [fornecedorId, setFornecedorId] = useState(movimento.fornecedorId ?? "");
  const [novoNome, setNovoNome] = useState<string | null>(null);
  const [pagamento, setPagamento] = useState<FormaCompra>(inicial.pagamento);
  const [vencimentos, setVencimentos] = useState<string[]>(inicial.vencimentos);
  const [salvando, setSalvando] = useState(false);

  const valorTotalInicial = movimento.custoUn
    ? Math.round(movimento.custoUn * movimento.quantidadeUn * 100) / 100
    : 0;

  // Mesmo formato do lançamento: caixas + unidades soltas, custo por
  // unidade e total (um recalcula o outro).
  const qtdInicial = paraCaixas(movimento.quantidadeUn, unPorCaixa);
  const [cx, setCx] = useState(qtdInicial.cx ? String(qtdInicial.cx) : "");
  const [un, setUn] = useState(qtdInicial.un ? String(qtdInicial.un) : "");
  const [custoUn, setCustoUn] = useState(
    movimento.custoUn ? String(Math.round(movimento.custoUn * 10000) / 10000) : "",
  );
  const [valorTotal, setValorTotal] = useState(valorTotalInicial ? String(valorTotalInicial) : "");

  const numQtd = Number(cx || 0) * unPorCaixa + Number(un || 0);
  const numValorTotal = Number(valorTotal) || 0;

  function mudarQtd(novoCx: string, novoUn: string) {
    setCx(novoCx);
    setUn(novoUn);
    const qtd = Number(novoCx || 0) * unPorCaixa + Number(novoUn || 0);
    if (custoUn && qtd > 0) setValorTotal((Number(custoUn) * qtd).toFixed(2));
  }

  function mudarCustoUn(valor: string) {
    setCustoUn(valor);
    if (valor && numQtd > 0) setValorTotal((Number(valor) * numQtd).toFixed(2));
    else if (!valor) setValorTotal("");
  }

  function mudarValorTotal(valor: string) {
    setValorTotal(valor);
    if (valor && numQtd > 0) {
      setCustoUn((Number(valor) / numQtd).toFixed(4).replace(/0+$/, "").replace(/\.$/, ""));
    } else if (!valor) {
      setCustoUn("");
    }
  }

  /**
   * Custo médio do produto, refeito com esta compra corrigida — mesma regra
   * do lançamento (esta + as 2 compras com custo mais recentes). Só muda se
   * esta compra ainda está entre as 3 últimas; senão ela já não pesava.
   */
  function custoMedioCorrigido(novoCustoUn: number): number | undefined {
    const ultimas = movimentos
      .filter((m) => m.produtoId === movimento.produtoId && m.origem === "COMPRA" && m.custoUn !== undefined)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .slice(0, 3);
    if (!ultimas.some((m) => m.id === movimento.id)) return undefined;
    let soma = 0;
    let qtd = 0;
    for (const m of ultimas) {
      const q = m.id === movimento.id ? numQtd : m.quantidadeUn;
      const c = m.id === movimento.id ? novoCustoUn : m.custoUn!;
      if (!c) continue;
      soma += q * c;
      qtd += q;
    }
    return qtd > 0 ? soma / qtd : undefined;
  }

  async function salvar() {
    if (numQtd <= 0) return;

    setSalvando(true);
    try {
      const fornecedor = await resolverFornecedor(
        fornecedores,
        salvarFornecedor,
        fornecedorId,
        novoNome,
      );

      const mudouPagamentoOuValor =
        pagamento !== inicial.pagamento ||
        (pagamento === "PRAZO" && vencimentos.join() !== inicial.vencimentos.join()) ||
        numValorTotal !== valorTotalInicial;

      let ids = contas.map((c) => c.id);
      if (mudouPagamentoOuValor && !algumaPaga && !movimento.referenciaId) {
        // Refaz as parcelas do zero conforme a escolha nova ou o novo valor.
        for (const id of ids) await removerContaPagar(id);
        ids = [];
        if (pagamento === "PRAZO" && numValorTotal > 0) {
          ids = await criarContasPrazo(salvarContaPagar, {
            valorTotal: numValorTotal,
            vencimentos,
            descricao: `Compra: ${numQtd} un de ${movimento.produtoNome}`,
            fornecedor,
            obs: movimento.obs,
          });
        }
      } else {
        // Só o fornecedor mudou ou valor/pagamento mudou mas algumaPaga é true.
        for (const c of permissoes.financeiro && !movimento.referenciaId ? contas : []) {
          await salvarContaPagar({
            ...c,
            fornecedorId: fornecedor.id,
            fornecedorNome: fornecedor.nome,
          });
        }
      }

      await salvarMovimento({
        ...movimento,
        fornecedorId: fornecedor.id,
        pagamento: algumaPaga ? movimento.pagamento : pagamento,
        contaPagarId: undefined,
        contaPagarIds: ids.length > 0 ? ids : undefined,
        quantidadeUn: numQtd,
        custoUn: numValorTotal > 0 ? numValorTotal / numQtd : 0,
        obs: obsComLancado(movimento.obs, cx, un),
      });

      // Antes, mudar a quantidade aqui só alterava o lançamento — o estoque
      // do produto ficava com o número antigo e o custo médio também.
      if (produto) {
        const novoCustoUn = numValorTotal > 0 ? numValorTotal / numQtd : 0;
        const mudouCusto = numQtd !== movimento.quantidadeUn || numValorTotal !== valorTotalInicial;
        const precoCusto = mudouCusto ? custoMedioCorrigido(novoCustoUn) : undefined;
        if (numQtd !== movimento.quantidadeUn || precoCusto !== undefined) {
          await somarEstoque(produto.id, numQtd - movimento.quantidadeUn, {
            precoCusto: precoCusto ?? produto.precoCusto,
          });
        }
      }
      aoFechar();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      aoFechar={() => !salvando && aoFechar()}
      titulo="Editar compra"
      rodape={
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            className="text-sm font-semibold text-red-600 hover:underline dark:text-red-400"
            onClick={async () => {
              if (algumaPaga) {
                if (!window.confirm("Essa compra tem parcelas já pagas no financeiro. Tem certeza que quer excluir o lançamento do estoque? As contas a pagar NÃO serão apagadas.")) return;
              } else {
                if (!window.confirm("Tem certeza que deseja excluir esta compra? O estoque vai ser ajustado de volta e as contas a pagar canceladas.")) return;
              }
              setSalvando(true);
              try {
                const produto = produtoPorId(movimento.produtoId);
                if (produto) {
                  const sinal = movimento.tipo === "SAIDA" ? 1 : -1;
                  await somarEstoque(produto.id, movimento.quantidadeUn * sinal);
                }
                if (!algumaPaga && !movimento.referenciaId) {
                  for (const c of contas) {
                    await removerContaPagar(c.id);
                  }
                }
                await removerMovimento(movimento.id);
                aoFechar();
              } catch (e) {
                alert("Erro ao excluir: " + (e as Error).message);
              } finally {
                setSalvando(false);
              }
            }}
            disabled={salvando}
          >
            Excluir
          </button>
          <div className="flex gap-2">
            <button className="btn-secundario" onClick={aoFechar} disabled={salvando}>
              Cancelar
            </button>
            <button className="btn-primario" onClick={salvar} disabled={salvando || numQtd <= 0}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-texto-suave">
          Lançada em {dataBR(movimento.data)} · <strong className="text-texto">{movimento.produtoNome}</strong>
        </p>

        <div>
          <label className="mb-1.5 block text-sm font-semibold">Quantidade</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative min-w-0">
              <input
                type="number"
                min="0"
                step="1"
                value={cx}
                onChange={(e) => mudarQtd(e.target.value, un)}
                placeholder="0"
                disabled={unPorCaixa <= 1}
                className="campo block w-full pr-10 disabled:opacity-50"
                aria-label="Caixas"
              />
              <span className="pointer-events-none absolute top-2.5 right-4 text-sm text-texto-suave">cx</span>
            </div>
            <div className="relative min-w-0">
              <input
                type="number"
                min="0"
                step="1"
                value={un}
                onChange={(e) => mudarQtd(cx, e.target.value)}
                placeholder="0"
                className="campo block w-full pr-10"
                aria-label="Unidades"
              />
              <span className="pointer-events-none absolute top-2.5 right-4 text-sm text-texto-suave">un</span>
            </div>
          </div>
          {unPorCaixa > 1 && numQtd > 0 && (
            <p className="mt-1 text-xs text-texto-suave">
              Total: <strong className="text-texto">{numQtd} un</strong> ({unPorCaixa} un/cx)
            </p>
          )}
          {numQtd !== movimento.quantidadeUn && numQtd > 0 && (
            <p className="mt-1 text-xs text-texto-suave">
              O estoque do produto vai {numQtd > movimento.quantidadeUn ? "ganhar" : "perder"}{" "}
              <strong className="text-texto">{Math.abs(numQtd - movimento.quantidadeUn)} un</strong>.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="mb-1.5 block text-sm font-semibold">Custo Un (R$)</label>
            <input
              type="number"
              min="0"
              step="any"
              className="campo block w-full"
              value={custoUn}
              onChange={(e) => mudarCustoUn(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1.5 block text-sm font-semibold">Custo Total (R$)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="campo block w-full"
              value={valorTotal}
              onChange={(e) => mudarValorTotal(e.target.value)}
              placeholder="0,00"
            />
          </div>
        </div>

        <CampoFornecedor
          fornecedores={fornecedores}
          fornecedorId={fornecedorId}
          novoNome={novoNome}
          podeCadastrar={permissoes.fornecedores}
          aoMudar={(id, nome) => {
            setFornecedorId(id);
            setNovoNome(nome);
          }}
        />

        {movimento.referenciaId ? (
          <p className="rounded-xl bg-superficie-2 px-3 py-2 text-xs text-texto-suave">
            Este item faz parte da nota{movimento.nota ? ` ${movimento.nota}` : ""} — o
            pagamento e as parcelas são da nota inteira e se ajustam em Financeiro → Contas a pagar.
          </p>
        ) : numValorTotal > 0 ? (
          <CamposPagamento
            podePrazo={permissoes.financeiro}
            pagamento={pagamento}
            setPagamento={setPagamento}
            vencimentos={vencimentos}
            setVencimentos={setVencimentos}
            valorTotal={numValorTotal}
            bloqueado={
              algumaPaga
                ? "Já tem parcela paga no Financeiro — a forma de pagamento não pode mais mudar por aqui."
                : !permissoes.financeiro && movimento.pagamento === "PRAZO"
                  ? "Mudar o pagamento de uma compra a prazo exige acesso ao Financeiro."
                  : undefined
            }
          />
        ) : (
          <p className="text-xs text-texto-suave">
            Essa compra está sendo lançada sem custo, então não dá pra gerar conta a pagar.
          </p>
        )}
      </div>
    </Modal>
  );
}
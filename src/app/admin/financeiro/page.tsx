"use client";

import { apagarComprovante } from "@/lib/gastos";
import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Pencil,
  Plus,
  Scale,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Cabecalho, Modal } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { DetalheVenda } from "@/components/DetalheVenda";
import { BarrasHorizontais, CartaoGrafico } from "@/components/Graficos";
import { useDados, novoId } from "@/lib/store";
import { brl, dataBR, hojeISO, paraCampo, paraNumero, somarDias } from "@/lib/format";
import {
  ROTULO_FORMA,
  diaLocal,
  numeroVenda,
  saldoVenda,
  totalVenda,
  vendaEmAberto,
} from "@/lib/vendas";
import type { ContaPagar, FormaPagamento, Venda } from "@/lib/types";

type Formulario = {
  descricao: string;
  fornecedorId: string;
  valor: string;
  vencimento: string;
  obs: string;
};

const FORM_VAZIO: Formulario = {
  descricao: "",
  fornecedorId: "",
  valor: "",
  vencimento: hojeISO(),
  obs: "",
};

type FiltroContas = "pendentes" | "pagas" | "todas";

export default function FinanceiroPage() {
  return (
    <Protegido chave="financeiro">
      <FinanceiroPageInterno />
    </Protegido>
  );
}

function FinanceiroPageInterno() {
  const { vendas, fornecedores, contasPagar, salvarContaPagar, removerContaPagar, carregando } =
    useDados();

  const hoje = hojeISO();
  const [de, setDe] = useState(() => hoje.slice(0, 8) + "01");
  const [ate, setAte] = useState(hoje);
  const [filtroContas, setFiltroContas] = useState<FiltroContas>("pendentes");
  const [vendo, setVendo] = useState<Venda | null>(null);

  /** Tudo que entrou no caixa: pagamentos de vendas não canceladas. */
  const recebimentos = useMemo(
    () =>
      vendas
        .filter((v) => v.status !== "CANCELADA")
        .flatMap((v) => v.pagamentos.map((p) => ({ ...p, dia: diaLocal(p.data) }))),
    [vendas],
  );
  const recebidoPeriodo = useMemo(
    () => recebimentos.filter((r) => r.dia >= de && r.dia <= ate),
    [recebimentos, de, ate],
  );
  const totalRecebido = recebidoPeriodo.reduce((s, r) => s + r.valor, 0);
  const recebidoPorForma = useMemo(() => {
    const mapa = new Map<FormaPagamento, number>();
    for (const r of recebidoPeriodo) mapa.set(r.forma, (mapa.get(r.forma) ?? 0) + r.valor);
    return [...mapa.entries()]
      .map(([f, valor]) => ({ chave: f, rotulo: ROTULO_FORMA[f], valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [recebidoPeriodo]);

  const diaPagamento = (c: ContaPagar) => (c.pagoEm ? diaLocal(c.pagoEm) : c.vencimento);
  const pagasPeriodo = useMemo(
    () =>
      contasPagar.filter((c) => {
        if (!c.pago) return false;
        const d = diaPagamento(c);
        return d >= de && d <= ate;
      }),
    [contasPagar, de, ate],
  );
  const totalPago = pagasPeriodo.reduce((s, c) => s + c.valor, 0);

  const aReceber = useMemo(
    () =>
      vendas
        .filter(vendaEmAberto)
        .sort((a, b) => (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999")),
    [vendas],
  );
  const totalAReceber = aReceber.reduce((s, v) => s + saldoVenda(v), 0);
  const receberVencido = aReceber.filter((v) => v.vencimento && v.vencimento < hoje);

  const contasPendentes = contasPagar.filter((c) => !c.pago);
  const aPagar = contasPendentes.reduce((s, c) => s + c.valor, 0);
  const contasVencidas = contasPendentes.filter((c) => c.vencimento < hoje);
  const proximos7 = contasPendentes
    .filter((c) => c.vencimento >= hoje && c.vencimento <= somarDias(hoje, 7))
    .reduce((s, c) => s + c.valor, 0);

  /** Fluxo de caixa: entradas (recebido) e saídas (contas pagas) por dia. */
  const fluxo = useMemo(() => {
    const mapa = new Map<string, { entrada: number; saida: number }>();
    for (const r of recebidoPeriodo) {
      const atual = mapa.get(r.dia) ?? { entrada: 0, saida: 0 };
      atual.entrada += r.valor;
      mapa.set(r.dia, atual);
    }
    for (const c of pagasPeriodo) {
      const dia = diaPagamento(c);
      const atual = mapa.get(dia) ?? { entrada: 0, saida: 0 };
      atual.saida += c.valor;
      mapa.set(dia, atual);
    }
    return [...mapa.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [recebidoPeriodo, pagasPeriodo]);

  const contasOrdenadas = useMemo(
    () =>
      contasPagar
        .filter((c) => (filtroContas === "todas" ? true : filtroContas === "pagas" ? c.pago : !c.pago))
        .sort((a, b) => {
          if (a.pago !== b.pago) return a.pago ? 1 : -1;
          return a.pago
            ? (b.pagoEm ?? "").localeCompare(a.pagoEm ?? "")
            : a.vencimento.localeCompare(b.vencimento);
        }),
    [contasPagar, filtroContas],
  );

  // ------------------------- Modal de contas a pagar -------------------------
  const [editando, setEditando] = useState<ContaPagar | null>(null);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [aberto, setAberto] = useState(false);
  const [salvandoConta, setSalvandoConta] = useState(false);
  const [excluindo, setExcluindo] = useState<ContaPagar | null>(null);

  function abrirNova() {
    setEditando(null);
    setForm({ ...FORM_VAZIO, vencimento: hojeISO() });
    setAberto(true);
  }

  function abrirEdicao(c: ContaPagar) {
    setEditando(c);
    setForm({
      descricao: c.descricao,
      fornecedorId: c.fornecedorId ?? "",
      valor: paraCampo(c.valor),
      vencimento: c.vencimento,
      obs: c.obs ?? "",
    });
    setAberto(true);
  }

  async function salvar() {
    if (salvandoConta) return;
    const descricao = form.descricao.trim();
    const valor = paraNumero(form.valor);
    if (!descricao || valor <= 0) return;
    setSalvandoConta(true);
    try {
      const fornecedor = fornecedores.find((f) => f.id === form.fornecedorId);
      await salvarContaPagar({
        ...editando,
        id: editando?.id ?? novoId(),
        descricao,
        fornecedorId: fornecedor?.id,
        fornecedorNome: fornecedor?.nome,
        valor,
        vencimento: form.vencimento || hojeISO(),
        obs: form.obs.trim() || undefined,
        pago: editando?.pago ?? false,
        pagoEm: editando?.pagoEm,
        criadoEm: editando?.criadoEm ?? new Date().toISOString(),
      });
      setAberto(false);
    } finally {
      setSalvandoConta(false);
    }
  }

  async function alternarPago(c: ContaPagar) {
    await salvarContaPagar({
      ...c,
      pago: !c.pago,
      pagoEm: !c.pago ? new Date().toISOString() : undefined,
    });
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    if (excluindo.temComprovante) await apagarComprovante(excluindo.id).catch(() => {});
    await removerContaPagar(excluindo.id);
    setExcluindo(null);
  }

  return (
    <>
      <Cabecalho
        titulo="Financeiro"
        subtitulo={carregando ? "Carregando…" : "Caixa, contas a receber e contas a pagar"}
      />

      <div className="space-y-6 px-4 pb-8 md:px-6">
        <div className="grid max-w-md grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="rotulo" htmlFor="f-de">De</label>
            <input id="f-de" type="date" className="campo" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="min-w-0">
            <label className="rotulo" htmlFor="f-ate">Até</label>
            <input id="f-ate" type="date" className="campo" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Bloco
            Icone={TrendingUp}
            rotulo="Recebido no período"
            valor={brl(totalRecebido)}
            detalhe={`${recebidoPeriodo.length} recebimento(s)`}
          />
          <Bloco
            Icone={TrendingDown}
            rotulo="Pago no período"
            valor={brl(totalPago)}
            detalhe={`${pagasPeriodo.length} conta(s)`}
          />
          <Bloco
            Icone={Scale}
            rotulo="Saldo do período"
            valor={brl(totalRecebido - totalPago)}
            destaque
            negativo={totalRecebido - totalPago < 0}
          />
          <Bloco
            Icone={Wallet}
            rotulo="A receber (fiado)"
            valor={brl(totalAReceber)}
            detalhe={
              receberVencido.length
                ? `${receberVencido.length} vencida(s)`
                : `${aReceber.length} comanda(s)`
            }
            negativo={receberVencido.length > 0}
          />
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          <CartaoGrafico titulo="Recebido por forma de pagamento">
            <BarrasHorizontais barras={recebidoPorForma} />
          </CartaoGrafico>

          <section className="card overflow-hidden">
            <div className="border-b border-borda px-4 py-3">
              <h2 className="text-sm font-bold">Resumo das contas a pagar</h2>
            </div>
            <div className="grid grid-cols-3 divide-x divide-borda text-center">
              <div className="px-2 py-5">
                <p className="text-[11px] font-semibold text-texto-suave uppercase">Em aberto</p>
                <p className="mt-1 text-lg font-black tabular-nums">{brl(aPagar)}</p>
              </div>
              <div className="px-2 py-5">
                <p className="text-[11px] font-semibold text-texto-suave uppercase">Próx. 7 dias</p>
                <p className="mt-1 text-lg font-black text-acento tabular-nums">{brl(proximos7)}</p>
              </div>
              <div className="px-2 py-5">
                <p className="text-[11px] font-semibold text-texto-suave uppercase">Vencidas</p>
                <p
                  className={`mt-1 text-lg font-black tabular-nums ${
                    contasVencidas.length ? "text-red-600 dark:text-red-400" : ""
                  }`}
                >
                  {brl(contasVencidas.reduce((s, c) => s + c.valor, 0))}
                </p>
              </div>
            </div>
          </section>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-bold">Contas a receber (comandas a prazo)</h2>
          {aReceber.length === 0 ? (
            <div className="card px-6 py-8 text-center text-sm text-texto-suave">
              Nenhum cliente devendo 🎉
            </div>
          ) : (
            <ul className="card divide-y divide-borda overflow-hidden">
              {aReceber.map((v) => {
                const vencida = !!v.vencimento && v.vencimento < hoje;
                return (
                  <li key={v.id}>
                    <button
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-superficie-2"
                      onClick={() => setVendo(v)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{v.clienteNome}</p>
                        <p
                          className={`text-xs ${
                            vencida ? "font-semibold text-red-600 dark:text-red-400" : "text-texto-suave"
                          }`}
                        >
                          {numeroVenda(v.numero)} ·{" "}
                          {v.vencimento ? `vence ${dataBR(v.vencimento)}` : "sem vencimento"}
                          {vencida && " · vencida"}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-black text-acento tabular-nums">{brl(saldoVenda(v))}</p>
                        <p className="text-[11px] text-texto-suave tabular-nums">de {brl(totalVenda(v))}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold">Contas a pagar</h2>
            <div className="flex items-center gap-2">
              <select
                className="campo h-9 py-1 text-sm"
                value={filtroContas}
                onChange={(e) => setFiltroContas(e.target.value as FiltroContas)}
                aria-label="Filtrar contas"
              >
                <option value="pendentes">Pendentes</option>
                <option value="pagas">Pagas</option>
                <option value="todas">Todas</option>
              </select>
              <button className="btn-secundario shrink-0" onClick={abrirNova}>
                <Plus className="h-4 w-4" />
                Nova conta
              </button>
            </div>
          </div>
          {contasOrdenadas.length === 0 ? (
            <div className="card px-6 py-10 text-center text-sm text-texto-suave">
              Nenhuma conta aqui. As entradas (compras) a prazo aparecem sozinhas; aluguel,
              luz e outras despesas você lança em &quot;Nova conta&quot;.
            </div>
          ) : (
            <ul className="card divide-y divide-borda overflow-hidden">
              {contasOrdenadas.map((c) => {
                const vencida = !c.pago && c.vencimento < hoje;
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => alternarPago(c)}
                      className="shrink-0 text-texto-suave transition hover:text-acento"
                      aria-label={c.pago ? "Marcar como pendente" : "Marcar como paga"}
                    >
                      {c.pago ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-semibold ${c.pago ? "text-texto-suave line-through" : ""}`}>
                        {c.descricao}
                      </p>
                      <p
                        className={`text-xs ${
                          vencida ? "font-semibold text-red-600 dark:text-red-400" : "text-texto-suave"
                        }`}
                      >
                        {c.fornecedorNome ? `${c.fornecedorNome} · ` : ""}
                        {c.pago
                          ? `paga em ${dataBR(diaPagamento(c))}`
                          : `vence ${dataBR(c.vencimento)}`}
                        {vencida && " · vencida"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-black tabular-nums ${
                        c.pago ? "text-texto-suave" : vencida ? "text-red-600 dark:text-red-400" : ""
                      }`}
                    >
                      {brl(c.valor)}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <button
                        className="grid h-8 w-8 place-items-center rounded-lg text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                        onClick={() => abrirEdicao(c)}
                        aria-label={`Editar ${c.descricao}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="grid h-8 w-8 place-items-center rounded-lg text-texto-suave transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        onClick={() => setExcluindo(c)}
                        aria-label={`Excluir ${c.descricao}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-borda px-4 py-3">
            <h2 className="text-sm font-bold">Fluxo de caixa por dia</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-superficie-2 text-[11px] tracking-wide text-texto-suave uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Dia</th>
                  <th className="px-3 py-2 text-right">Entradas</th>
                  <th className="px-3 py-2 text-right">Saídas</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {fluxo.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-texto-suave">
                      Sem movimento no período.
                    </td>
                  </tr>
                )}
                {fluxo.map(([dia, f]) => (
                  <tr key={dia}>
                    <td className="px-3 py-2 font-semibold">{dataBR(dia)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400">
                      {brl(f.entrada)}
                    </td>
                    <td className="px-3 py-2 text-right text-red-600 dark:text-red-400">
                      {f.saida ? `− ${brl(f.saida)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">{brl(f.entrada - f.saida)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {vendo && (
        <DetalheVenda
          venda={vendas.find((v) => v.id === vendo.id) ?? vendo}
          aoFechar={() => setVendo(null)}
        />
      )}

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={editando ? "Editar conta a pagar" : "Nova conta a pagar"}
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setAberto(false)} disabled={salvandoConta}>
              Cancelar
            </button>
            <button
              className="btn-primario"
              onClick={salvar}
              disabled={salvandoConta || !form.descricao.trim() || paraNumero(form.valor) <= 0}
            >
              {salvandoConta ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="rotulo" htmlFor="cp-desc">Descrição</label>
            <input
              id="cp-desc"
              className="campo"
              autoFocus
              placeholder="Ex: Aluguel, luz, fornecedor…"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>

          <div>
            <label className="rotulo" htmlFor="cp-fornecedor">Fornecedor (opcional)</label>
            <select
              id="cp-fornecedor"
              className="campo"
              value={form.fornecedorId}
              onChange={(e) => setForm({ ...form, fornecedorId: e.target.value })}
            >
              <option value="">Sem fornecedor</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="rotulo" htmlFor="cp-valor">Valor</label>
              <input
                id="cp-valor"
                className="campo"
                inputMode="decimal"
                placeholder="0,00"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="cp-venc">Vencimento</label>
              <input
                id="cp-venc"
                type="date"
                className="campo"
                value={form.vencimento}
                onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="rotulo" htmlFor="cp-obs">Observações</label>
            <textarea
              id="cp-obs"
              className="campo min-h-20"
              value={form.obs}
              onChange={(e) => setForm({ ...form, obs: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      <Modal
        aberto={!!excluindo}
        aoFechar={() => setExcluindo(null)}
        titulo="Excluir conta a pagar"
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setExcluindo(null)}>
              Cancelar
            </button>
            <button className="btn-perigo" onClick={confirmarExclusao}>
              Excluir
            </button>
          </>
        }
      >
        <p className="text-sm text-texto-suave">
          {excluindo && `Tem certeza que deseja excluir a conta "${excluindo.descricao}"?`}
        </p>
      </Modal>
    </>
  );
}

function Bloco({
  Icone,
  rotulo,
  valor,
  detalhe,
  destaque = false,
  negativo = false,
}: {
  Icone: React.ComponentType<{ className?: string }>;
  rotulo: string;
  valor: string;
  detalhe?: string;
  destaque?: boolean;
  negativo?: boolean;
}) {
  return (
    <div className={`card px-4 py-3 ${destaque ? "border-acento/40 bg-acento/5" : ""}`}>
      <div className="flex items-center gap-1.5 text-texto-suave">
        <Icone className="h-3.5 w-3.5" />
        <p className="text-[11px] font-semibold tracking-wide uppercase">{rotulo}</p>
      </div>
      <p
        className={`mt-1.5 text-xl font-black tabular-nums md:text-2xl ${
          negativo ? "text-red-600 dark:text-red-400" : destaque ? "text-acento" : ""
        }`}
      >
        {valor}
      </p>
      {detalhe && <p className="mt-0.5 text-xs text-texto-suave">{detalhe}</p>}
    </div>
  );
}

"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Pencil, Plus, Search, ShoppingBag } from "lucide-react";
import { Cabecalho, Vazio } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { idsDasContas, ModalEditarCompra, resumoPrazo } from "@/components/Compras";
import { ModalEntrada } from "@/components/Entrada";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { brl, caixasEUnidades, dataBR, hojeISO, normalizar } from "@/lib/format";
import type { ContaPagar, EstoqueMovimento } from "@/lib/types";

/** Valor do select de fornecedor pra "compras sem fornecedor". */
const SEM_FORNECEDOR = "__sem__";

/** Data local YYYY-MM-DD (toISOString passaria pro UTC). */
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Atalhos de período; "Tudo" deixa as duas datas vazias (sem limite). */
function periodos() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  return [
    { rotulo: "Este mês", de: isoLocal(new Date(ano, mes, 1)), ate: hojeISO() },
    { rotulo: "Mês passado", de: isoLocal(new Date(ano, mes - 1, 1)), ate: isoLocal(new Date(ano, mes, 0)) },
    { rotulo: "Este ano", de: `${ano}-01-01`, ate: hojeISO() },
    { rotulo: "Tudo", de: "", ate: "" },
  ];
}

/** Quanto a compra custou (custo un × quantidade). */
function valorCompra(m: EstoqueMovimento): number {
  return Math.round((m.custoUn ?? 0) * m.quantidadeUn * 100) / 100;
}

/** Observação sem o "Lançado: 2cx e 3un" que o lançamento põe no começo. */
function obsLivre(obs?: string): string {
  return (obs ?? "").replace(/^Lançado: [^·]*(· )?/, "").trim();
}

export default function ComprasPage() {
  return (
    <Protegido chave="estoque">
      <Suspense>
        <ComprasPageInterno />
      </Suspense>
    </Protegido>
  );
}

function ComprasPageInterno() {
  const { movimentos, fornecedores, contasPagar, carregando } = useDados();
  const { permissoes } = useAuth();

  const [de, setDe] = useState(() => periodos()[0].de);
  const [ate, setAte] = useState(() => periodos()[0].ate);
  const [fornecedorId, setFornecedorId] = useState("");
  const [busca, setBusca] = useState("");
  const params = useSearchParams();
  const [novaAberta, setNovaAberta] = useState(() => params.get("nova") === "1");
  const [editando, setEditando] = useState<EstoqueMovimento | null>(null);

  const nomeFornecedor = useMemo(
    () => new Map(fornecedores.map((f) => [f.id, f.nome])),
    [fornecedores],
  );

  const compras = useMemo(() => {
    const termo = normalizar(busca);
    return movimentos
      .filter((m) => {
        if (m.origem !== "COMPRA") return false;
        const d = m.data.slice(0, 10);
        if ((de && d < de) || (ate && d > ate)) return false;
        if (fornecedorId === SEM_FORNECEDOR) {
          if (m.fornecedorId) return false;
        } else if (fornecedorId && m.fornecedorId !== fornecedorId) {
          return false;
        }
        if (!termo) return true;
        return (
          normalizar(m.produtoNome).includes(termo) ||
          normalizar(nomeFornecedor.get(m.fornecedorId ?? "") ?? "").includes(termo) ||
          normalizar(m.obs ?? "").includes(termo) ||
          normalizar(m.nota ?? "").includes(termo)
        );
      })
      .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));
  }, [movimentos, de, ate, fornecedorId, busca, nomeFornecedor]);

  const resumo = useMemo(() => {
    const contas = new Map(contasPagar.map((c) => [c.id, c]));
    let total = 0;
    let avista = 0;
    let prazo = 0;
    let semValor = 0;
    let faltaPagar = 0;
    // Os itens de uma mesma nota apontam pra mesma conta: soma cada conta uma vez.
    const contadas = new Set<string>();
    for (const m of compras) {
      const valor = valorCompra(m);
      total += valor;
      if (m.pagamento === "PRAZO") prazo += valor;
      else avista += valor;
      if (valor <= 0) semValor += 1;
      for (const id of idsDasContas(m)) {
        if (contadas.has(id)) continue;
        contadas.add(id);
        const c = contas.get(id);
        if (c && !c.pago) faltaPagar += c.valor;
      }
    }
    return { total, avista, prazo, semValor, faltaPagar };
  }, [compras, contasPagar]);

  // Agrupa por dia, mantendo a ordem (mais recente primeiro).
  const dias = useMemo(() => {
    const mapa = new Map<string, EstoqueMovimento[]>();
    for (const m of compras) {
      const dia = m.data.slice(0, 10);
      if (!mapa.has(dia)) mapa.set(dia, []);
      mapa.get(dia)!.push(m);
    }
    return Array.from(mapa.entries());
  }, [compras]);

  const verValores = permissoes.verCusto;

  return (
    <>
      <Cabecalho
        titulo="Entradas (compras)"
        subtitulo={
          carregando
            ? "Carregando…"
            : `${compras.length} ${compras.length === 1 ? "compra" : "compras"} no período`
        }
        acao={
          <button className="btn-primario" onClick={() => setNovaAberta(true)}>
            <Plus className="h-4 w-4" />
            Nova entrada
          </button>
        }
      />

      <div className="px-4 md:px-6">
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          {periodos().map((p) => {
            const ativo = p.de === de && p.ate === ate;
            return (
              <button
                key={p.rotulo}
                onClick={() => {
                  setDe(p.de);
                  setAte(p.ate);
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  ativo
                    ? "bg-acento text-acento-texto"
                    : "border border-borda bg-superficie text-texto-suave hover:bg-superficie-2"
                }`}
              >
                {p.rotulo}
              </button>
            );
          })}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className="rotulo" htmlFor="compras-de">
              De
            </label>
            <input
              id="compras-de"
              type="date"
              className="campo w-full min-w-0"
              value={de}
              onChange={(e) => setDe(e.target.value)}
            />
          </div>
          <div className="min-w-0">
            <label className="rotulo" htmlFor="compras-ate">
              Até
            </label>
            <input
              id="compras-ate"
              type="date"
              className="campo w-full min-w-0"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-texto-suave" />
            <input
              className="campo pl-9"
              placeholder="Buscar produto, fornecedor ou nº da nota…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <select
            className="campo"
            aria-label="Fornecedor"
            value={fornecedorId}
            onChange={(e) => setFornecedorId(e.target.value)}
          >
            <option value="">Todos os fornecedores</option>
            {[...fornecedores]
              .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            <option value={SEM_FORNECEDOR}>Sem fornecedor</option>
          </select>
        </div>

        {!carregando && verValores && compras.length > 0 && (
          <div className="card mb-4 border-acento/40 bg-acento/5 px-4 py-3">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-wide text-texto-suave uppercase">
                  Comprado no período
                </p>
                <p className="mt-1 text-2xl font-black text-acento tabular-nums">
                  {brl(resumo.total)}
                </p>
                <p className="mt-0.5 text-xs text-texto-suave">
                  {compras.length} {compras.length === 1 ? "compra" : "compras"}
                </p>
              </div>
              <div className="shrink-0 space-y-0.5 text-right text-xs text-texto-suave">
                <p>
                  À vista{" "}
                  <span className="font-bold text-texto tabular-nums">{brl(resumo.avista)}</span>
                </p>
                <p>
                  A prazo{" "}
                  <span className="font-bold text-texto tabular-nums">{brl(resumo.prazo)}</span>
                </p>
              </div>
            </div>
            {resumo.faltaPagar > 0.005 && (
              <p className="mt-2 text-[11px] text-texto-suave">
                Ainda falta pagar{" "}
                <strong className="text-texto">{brl(resumo.faltaPagar)}</strong> de parcelas
                dessas compras
                {permissoes.financeiro && (
                  <>
                    {" — "}
                    <Link
                      href="/admin/financeiro"
                      className="font-semibold text-acento underline-offset-2 hover:underline"
                    >
                      ver no Financeiro
                    </Link>
                  </>
                )}
                .
              </p>
            )}
            {resumo.semValor > 0 && (
              <p className="mt-1 text-[11px] text-texto-suave">
                {resumo.semValor} {resumo.semValor === 1 ? "compra lançada" : "compras lançadas"} sem
                valor — toque nela pra completar.
              </p>
            )}
          </div>
        )}
      </div>

      {!carregando && compras.length === 0 && (
        <Vazio
          Icone={ShoppingBag}
          titulo="Nenhuma entrada nesse período"
          descricao="Lance a nota de compra aqui — o estoque, o custo e as contas a pagar são atualizados juntos."
          acao={
            <button className="btn-primario" onClick={() => setNovaAberta(true)}>
              <Plus className="h-4 w-4" />
              Nova entrada
            </button>
          }
        />
      )}

      <div className="space-y-5 px-4 md:px-6">
        {dias.map(([dia, itens]) => (
          <section key={dia}>
            <h2 className="mb-2 flex items-baseline justify-between gap-3 text-xs font-bold tracking-wide text-texto-suave uppercase">
              <span>{dataBR(dia)}</span>
              {verValores && (
                <span className="tabular-nums">
                  {brl(itens.reduce((s, m) => s + valorCompra(m), 0))}
                </span>
              )}
            </h2>
            <ul className="card divide-y divide-borda overflow-hidden">
              {itens.map((m) => (
                <LinhaCompra
                  key={m.id}
                  compra={m}
                  fornecedor={m.fornecedorId ? nomeFornecedor.get(m.fornecedorId) : undefined}
                  contasPagar={contasPagar}
                  verValores={verValores}
                  aoEditar={() => setEditando(m)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <ModalEntrada aberto={novaAberta} aoFechar={() => setNovaAberta(false)} />

      {editando && (
        <ModalEditarCompra movimento={editando} aoFechar={() => setEditando(null)} />
      )}
    </>
  );
}

function LinhaCompra({
  compra: m,
  fornecedor,
  contasPagar,
  verValores,
  aoEditar,
}: {
  compra: EstoqueMovimento;
  fornecedor?: string;
  contasPagar: ContaPagar[];
  verValores: boolean;
  aoEditar: () => void;
}) {
  const { produtoPorId } = useDados();
  const unPorCaixa = produtoPorId(m.produtoId)?.unPorCaixa ?? 1;
  const valor = valorCompra(m);
  const obs = obsLivre(m.obs);

  const contas = idsDasContas(m)
    .map((id) => contasPagar.find((c) => c.id === id))
    .filter((c): c is ContaPagar => !!c);
  const prazoQuitado = contas.length > 0 && contas.every((c) => c.pago);

  return (
    <li>
      <button
        type="button"
        onClick={aoEditar}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-superficie-2"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{m.produtoNome}</p>
          <p className="mt-0.5 truncate text-xs text-texto-suave">
            {caixasEUnidades(m.quantidadeUn, unPorCaixa)}
            {unPorCaixa > 1 && ` (${m.quantidadeUn} un)`} · {fornecedor ?? "sem fornecedor"}
            {m.nota && ` · NF ${m.nota}`}
          </p>
          {m.validade && (
            <p
              className={`mt-0.5 text-xs font-semibold ${
                m.validade < hojeISO() ? "text-red-600 dark:text-red-400" : "text-texto-suave"
              }`}
            >
              Validade {dataBR(m.validade)}
            </p>
          )}
          {m.pagamento && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {m.pagamento === "AVISTA" ? (
                <span className="chip bg-superficie-2 text-texto-suave">à vista</span>
              ) : prazoQuitado ? (
                <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  a prazo · pago
                </span>
              ) : (
                <span className="chip bg-ouro-100 text-marrom-800 dark:bg-ouro-900/30 dark:text-ouro-300">
                  {resumoPrazo(m, contasPagar)}
                </span>
              )}
            </div>
          )}
          {obs && <p className="mt-1 truncate text-xs text-texto-suave">{obs}</p>}
        </div>
        {verValores && (
          <div className="shrink-0 text-right">
            <p className={`font-black tabular-nums ${valor > 0 ? "" : "text-texto-suave"}`}>
              {valor > 0 ? brl(valor) : "sem valor"}
            </p>
            {valor > 0 && (
              <p className="text-[11px] text-texto-suave tabular-nums">
                {brl(m.custoUn ?? 0)}/un
              </p>
            )}
          </div>
        )}
        <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-texto-suave" />
      </button>
    </li>
  );
}

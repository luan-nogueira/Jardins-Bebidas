"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { Modal } from "@/components/ui";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { colecao } from "@/lib/db";
import { brl, dataBR } from "@/lib/format";
import {
  ROTULO_FORMA_FECH,
  idEntrada,
  idSaida,
  lerPlanilhaFechamento,
  montarEntradas,
  montarSaidas,
  type Fechamento,
} from "@/lib/importarFechamento";
import type { ContaPagar, FormaPagamento, Venda } from "@/lib/types";

const FORMAS_FECH: FormaPagamento[] = ["CREDITO", "DEBITO", "PIX", "DINHEIRO"];

/**
 * Botão + folha pra trazer a planilha "FECHAMENTO DE CAIXA" pro Fluxo:
 * escolhe o arquivo, confere a prévia e só então grava.
 */
export function ImportarFechamento() {
  const { vendas, contasPagar, proximoNumeroVenda } = useDados();
  const { usuario } = useAuth();
  const campo = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState("");
  const [dados, setDados] = useState<Fechamento | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [completar, setCompletar] = useState<Set<string>>(new Set());

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro("");
    setFeito("");
    setLendo(true);
    try {
      const lido = await lerPlanilhaFechamento(arquivo);
      if (lido.dias.length === 0) throw new Error("Não achei nenhum dia na aba de fechamento.");
      setDados(lido);
      setNomeArquivo(arquivo.name);
      setCompletar(new Set(lido.dias.filter((d) => d.sugestao).map((d) => d.dia)));
    } catch (e) {
      setDados(null);
      setErro(e instanceof Error ? e.message : "Não deu pra ler a planilha.");
    } finally {
      setLendo(false);
      if (campo.current) campo.current.value = "";
    }
  }

  const resumo = useMemo(() => {
    if (!dados) return null;
    const porForma = Object.fromEntries(FORMAS_FECH.map((f) => [f, 0])) as Record<FormaPagamento, number>;
    for (const d of dados.dias) {
      for (const f of FORMAS_FECH) {
        porForma[f] += d.sugestao && completar.has(d.dia) && d.sugestao.forma === f ? d.sugestao.valor : d.formas[f];
      }
    }
    const entradas = FORMAS_FECH.reduce((s, f) => s + porForma[f], 0);
    const sistema = dados.dias.reduce((s, d) => s + d.sistema, 0);
    const saidas = dados.saidas.reduce((s, x) => s + x.valor, 0);
    const porCategoria = new Map<string, number>();
    for (const s of dados.saidas) porCategoria.set(s.categoria, (porCategoria.get(s.categoria) ?? 0) + s.valor);
    const idsVenda = new Set(vendas.map((v) => v.id));
    const idsConta = new Set(contasPagar.map((c) => c.id));
    const jaTinha =
      dados.dias.filter((d) => idsVenda.has(idEntrada(d.dia))).length +
      dados.saidas.filter((s) => idsConta.has(idSaida(s.dia, s.linha))).length;
    return {
      porForma,
      entradas,
      sistema,
      saidas,
      categorias: [...porCategoria.entries()].sort((a, b) => b[1] - a[1]),
      jaTinha,
      diferencas: dados.dias
        .map((d) => {
          const ap = FORMAS_FECH.reduce(
            (s, f) => s + (d.sugestao && completar.has(d.dia) && d.sugestao.forma === f ? d.sugestao.valor : d.formas[f]),
            0,
          );
          return { dia: d.dia, dif: ap - d.sistema };
        })
        .filter((x) => Math.abs(x.dif) >= 5),
    };
  }, [dados, completar, vendas, contasPagar]);

  async function gravar() {
    if (!dados) return;
    setGravando(true);
    setErro("");
    try {
      // Reimportar mantém o número que a entrada já tinha.
      let proximo = proximoNumeroVenda();
      const numeroDe = (id: string) => vendas.find((v) => v.id === id)?.numero ?? proximo++;
      const quem = usuario?.email ?? undefined;
      const entradas = montarEntradas(dados.dias, completar, numeroDe, quem);
      const saidas = montarSaidas(dados.saidas, quem);
      await colecao<Venda>("vendas").salvarLote(entradas);
      await colecao<ContaPagar>("contasPagar").salvarLote(saidas);
      setFeito(`${entradas.length} dia(s) de entrada e ${saidas.length} saída(s) importados.`);
      setDados(null);
    } catch {
      setErro("Não gravou. Confira a internet e tente de novo — importar de novo não duplica nada.");
    } finally {
      setGravando(false);
    }
  }

  const periodo = dados ? `${dataBR(dados.dias[0].dia)} a ${dataBR(dados.dias[dados.dias.length - 1].dia)}` : "";

  return (
    <>
      <button className="btn-secundario" onClick={() => setAberto(true)}>
        <FileSpreadsheet className="h-4 w-4" />
        Importar fechamento
      </button>

      <Modal
        aberto={aberto}
        aoFechar={() => !gravando && setAberto(false)}
        titulo="Importar planilha de fechamento"
        largura="max-w-2xl"
        rodape={
          dados ? (
            <>
              <button className="btn-secundario" onClick={() => setDados(null)} disabled={gravando}>
                Trocar arquivo
              </button>
              <button className="btn-primario" onClick={gravar} disabled={gravando}>
                <Upload className="h-4 w-4" />
                {gravando ? "Importando…" : "Importar pro sistema"}
              </button>
            </>
          ) : undefined
        }
      >
        <input
          ref={campo}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => escolher(e.target.files?.[0])}
        />

        {erro && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">{erro}</p>
        )}
        {feito && (
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            {feito}
          </p>
        )}

        {!dados || !resumo ? (
          <div className="space-y-3 text-sm text-texto-suave">
            <p>
              Escolha a planilha <strong className="text-texto">FECHAMENTO DE CAIXA</strong> (.xlsx). Cada dia da aba de
              fechamento entra como <strong className="text-texto">entrada</strong> (crédito, débito, Pix e dinheiro
              apurados) e cada linha da saída de dinheiro vira um <strong className="text-texto">gasto em dinheiro</strong>{" "}
              pago pelo caixa da loja.
            </p>
            <p>Você confere tudo antes de gravar. Importar o mesmo arquivo de novo substitui, não duplica.</p>
            <button className="btn-primario w-full" onClick={() => campo.current?.click()} disabled={lendo}>
              <FileSpreadsheet className="h-4 w-4" />
              {lendo ? "Lendo planilha…" : "Escolher planilha"}
            </button>
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-texto-suave">
              <strong className="text-texto">{nomeArquivo}</strong> · {periodo} · {dados.dias.length} dias ·{" "}
              {dados.saidas.length} saídas
            </p>

            {resumo.jaTinha > 0 && (
              <p className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                {resumo.jaTinha} lançamento(s) desse período já foram importados antes — serão substituídos.
              </p>
            )}

            <section className="rounded-xl border border-borda p-3">
              <h3 className="mb-2 font-bold">Entradas</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                {FORMAS_FECH.map((f) => (
                  <div key={f}>
                    <dt className="text-xs text-texto-suave">{ROTULO_FORMA_FECH[f]}</dt>
                    <dd className="font-bold tabular-nums">{brl(resumo.porForma[f])}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 flex justify-between border-t border-borda pt-2">
                <span>Total apurado</span>
                <strong className="text-acento tabular-nums">{brl(resumo.entradas)}</strong>
              </p>
              <p className="flex justify-between text-xs text-texto-suave">
                <span>Venda no sistema antigo</span>
                <span className="tabular-nums">{brl(resumo.sistema)}</span>
              </p>

              {dados.dias
                .filter((d) => d.sugestao)
                .map((d) => (
                  <label
                    key={d.dia}
                    className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs dark:bg-amber-950/40"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={completar.has(d.dia)}
                      onChange={() =>
                        setCompletar((s) => {
                          const n = new Set(s);
                          if (n.has(d.dia)) n.delete(d.dia);
                          else n.add(d.dia);
                          return n;
                        })
                      }
                    />
                    <span>
                      <strong>{dataBR(d.dia)}:</strong> {ROTULO_FORMA_FECH[d.sugestao!.forma]} está zerado na planilha e o dia
                      fica {brl(d.sugestao!.valor)} abaixo do sistema (erro de fórmula). Lançar{" "}
                      <strong>{brl(d.sugestao!.valor)}</strong> em {ROTULO_FORMA_FECH[d.sugestao!.forma].toLowerCase()}?
                    </span>
                  </label>
                ))}

              {resumo.diferencas.length > 0 && (
                <p className="mt-2 text-xs text-texto-suave">
                  Diferença apurado × sistema:{" "}
                  {resumo.diferencas.map((x) => `${dataBR(x.dia)} ${x.dif > 0 ? "+" : ""}${brl(x.dif)}`).join(" · ")}
                </p>
              )}
            </section>

            <section className="rounded-xl border border-borda p-3">
              <h3 className="mb-2 font-bold">Saídas em dinheiro (caixa da loja)</h3>
              <ul className="space-y-0.5">
                {resumo.categorias.map(([cat, v]) => (
                  <li key={cat} className="flex justify-between">
                    <span>{cat}</span>
                    <span className="tabular-nums">{brl(v)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t border-borda pt-2">
                <span>Total de saídas</span>
                <strong className="tabular-nums">{brl(resumo.saidas)}</strong>
              </p>
              <p className="flex justify-between text-xs text-texto-suave">
                <span>Dinheiro que entrou − saídas em dinheiro</span>
                <span className="tabular-nums">{brl(resumo.porForma.DINHEIRO - resumo.saidas)}</span>
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-acento">Ver as {dados.saidas.length} saídas</summary>
                <ul className="mt-2 max-h-64 divide-y divide-borda overflow-y-auto text-xs">
                  {dados.saidas.map((s) => (
                    <li key={s.linha} className="flex gap-2 py-1">
                      <span className="w-12 shrink-0 tabular-nums text-texto-suave">{dataBR(s.dia).slice(0, 5)}</span>
                      <span className="min-w-0 flex-1 truncate">{s.descricao}</span>
                      <span className="shrink-0 text-texto-suave">{s.categoria}</span>
                      <span className="w-20 shrink-0 text-right tabular-nums">{brl(s.valor)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>

            {dados.avisos.map((a) => (
              <p key={a} className="flex gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {a}
              </p>
            ))}
            <p className="text-xs text-texto-suave">
              As entradas aparecem nas vendas como “Fechamento de caixa dd/mm/aaaa”. Dá pra corrigir uma saída depois em
              Gastos.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  FileDown,
  Lock,
  LockOpen,
  Trash2,
} from "lucide-react";
import { Cabecalho, Modal } from "@/components/ui";
import { useDados, novoId } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { useNomePessoa, useQuemSou } from "@/components/Pedidos";
import { brl, dataHoraBR, horaBR, paraNumero, hojeISO } from "@/lib/format";
import { ROTULO_FORMA, numeroVenda, totalVenda } from "@/lib/vendas";
import { nomeComanda } from "@/lib/pedidos";
import { FORMAS, calcularCaixa, numeroCaixa, useCaixas } from "@/lib/caixa";
import { baixarPdfCaixa } from "@/lib/relatorioCaixa";
import { CAIXA_DA_LOJA, CATEGORIAS_GASTO } from "@/lib/gastos";
import type { Caixa, CaixaMovimento, ContaPagar } from "@/lib/types";

/*
 * Caixa: abre com o fundo de troco, registra sangria (tirar dinheiro, com
 * motivo obrigatório) e reforço (pôr dinheiro), mostra tudo ao vivo e só
 * fecha quando alguém aperta "Fechar caixa" — conta a gaveta, mostra
 * sobra/falta e gera o relatório em PDF.
 */

export default function CaixaPage() {
  const { permissoes } = useAuth();
  if (!permissoes.vendas && !permissoes.financeiro) {
    return <p className="p-6 text-sm text-texto-suave">Você não tem acesso ao caixa.</p>;
  }
  return <CaixaInterno />;
}

const MOTIVOS_SANGRIA = [
  { rotulo: "Compra pra loja", categoria: "Mantimentos" },
  { rotulo: "Pagar fornecedor", categoria: "Fornecedores" },
  { rotulo: "Gelo", categoria: "Gelo" },
  { rotulo: "Carvão e gás", categoria: "Carvão e gás" },
  { rotulo: "Pagar funcionário", categoria: "Funcionários" },
  { rotulo: "Depósito no banco", categoria: "Depósito no banco" },
  { rotulo: "Retirada do dono", categoria: "Retirada de sócio" },
  { rotulo: "Outro", categoria: "Outros" },
];

function CaixaInterno() {
  const { vendas, carregando: carregandoDados, salvarContaPagar, removerContaPagar } = useDados();
  const { permissoes } = useAuth();
  const { caixas, aberto, carregando, salvar } = useCaixas();
  const quem = useQuemSou();
  const nomePessoa = useNomePessoa();

  // Relógio: os números do caixa aberto andam sozinhos.
  const [agora, setAgora] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date().toISOString()), 20_000);
    return () => clearInterval(t);
  }, []);

  const [abrindo, setAbrindo] = useState(false);
  const [movendo, setMovendo] = useState<"SANGRIA" | "REFORCO" | null>(null);
  const [fechando, setFechando] = useState(false);
  const [desfazendo, setDesfazendo] = useState<CaixaMovimento | null>(null);
  const [gerando, setGerando] = useState("");

  const detalhe = useMemo(() => (aberto ? calcularCaixa(aberto, vendas, agora) : null), [aberto, vendas, agora]);
  const fechados = caixas.filter((c) => c.status === "FECHADO");

  async function pdf(c: Caixa) {
    setGerando(c.id);
    try {
      await baixarPdfCaixa(c, vendas, nomePessoa);
    } finally {
      setGerando("");
    }
  }

  if (carregando || carregandoDados) return <p className="p-6 text-sm text-texto-suave">Carregando…</p>;

  return (
    <>
      <Cabecalho
        titulo="Caixa"
        subtitulo={
          aberto
            ? `${numeroCaixa(aberto.numero)} aberto desde ${dataHoraBR(aberto.abertoEm)} · ${nomePessoa(aberto.abertoPor)}`
            : "Caixa fechado"
        }
        acao={
          aberto ? (
            <button className="btn-primario" onClick={() => setFechando(true)}>
              <Lock className="h-4 w-4" />
              Fechar caixa
            </button>
          ) : (
            <button className="btn-primario" onClick={() => setAbrindo(true)}>
              <LockOpen className="h-4 w-4" />
              Abrir caixa
            </button>
          )
        }
      />

      <div className="space-y-4 px-4 pb-10 md:px-6">
        {!aberto && (
          <div className="card flex flex-col items-center gap-3 p-8 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-acento/10 text-acento">
              <Banknote className="h-7 w-7" />
            </span>
            <div>
              <p className="text-lg font-black">O caixa está fechado</p>
              <p className="text-sm text-texto-suave">
                Abra o caixa no começo do expediente, informando o dinheiro de troco que já está na gaveta.
              </p>
            </div>
            <button className="btn-primario" onClick={() => setAbrindo(true)}>
              <LockOpen className="h-4 w-4" />
              Abrir caixa
            </button>
          </div>
        )}

        {aberto && detalhe && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Bloco rotulo="Vendido no turno" valor={brl(detalhe.resumo.totalVendido)} detalhe={`${detalhe.resumo.vendas} venda(s)`} />
              <Bloco
                rotulo="Dinheiro na gaveta (esperado)"
                valor={brl(detalhe.resumo.dinheiroEsperado)}
                detalhe={`troco inicial ${brl(aberto.fundoTroco)}`}
                destaque
              />
              <Bloco rotulo="Total recebido" valor={brl(detalhe.resumo.totalRecebido)} detalhe="todas as formas" />
              <Bloco
                rotulo="Sangrias"
                valor={brl(detalhe.resumo.sangrias)}
                detalhe={`${aberto.movimentos.filter((m) => m.tipo === "SANGRIA").length} retirada(s)`}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="btn-secundario" onClick={() => setMovendo("SANGRIA")}>
                <ArrowUpCircle className="h-4 w-4 text-red-600" />
                Sangria (tirar dinheiro)
              </button>
              <button className="btn-secundario" onClick={() => setMovendo("REFORCO")}>
                <ArrowDownCircle className="h-4 w-4 text-emerald-600" />
                Reforço (colocar dinheiro)
              </button>
              <button className="btn-secundario" disabled={!!gerando} onClick={() => pdf(aberto)}>
                <FileDown className="h-4 w-4" />
                {gerando === aberto.id ? "Gerando…" : "Relatório parcial (PDF)"}
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="card p-4">
                <h2 className="mb-2 font-bold">Recebido por forma</h2>
                {FORMAS.map((f) => (
                  <Par key={f} rotulo={ROTULO_FORMA[f]} valor={brl(detalhe.resumo.porForma[f] ?? 0)} />
                ))}
                <Par rotulo="Total" valor={brl(detalhe.resumo.totalRecebido)} forte />
                {detalhe.resumo.aPrazo > 0 && <Par rotulo="Ficou a prazo (fiado)" valor={brl(detalhe.resumo.aPrazo)} />}
                {detalhe.resumo.descontos > 0 && <Par rotulo="Descontos dados" valor={brl(detalhe.resumo.descontos)} />}
                {detalhe.resumo.canceladas > 0 && (
                  <Par rotulo={`Canceladas (${detalhe.resumo.canceladas})`} valor={brl(detalhe.resumo.totalCancelado)} />
                )}
              </section>

              <section className="card p-4">
                <h2 className="mb-2 font-bold">Dinheiro na gaveta</h2>
                <Par rotulo="Troco inicial" valor={brl(aberto.fundoTroco)} />
                <Par rotulo="+ Vendas em dinheiro" valor={brl(detalhe.resumo.porForma.DINHEIRO ?? 0)} />
                <Par rotulo="+ Reforços" valor={brl(detalhe.resumo.reforcos)} />
                <Par rotulo="− Sangrias" valor={brl(detalhe.resumo.sangrias)} />
                <Par rotulo="= Deve ter na gaveta" valor={brl(detalhe.resumo.dinheiroEsperado)} forte />
              </section>
            </div>

            <section className="card overflow-hidden">
              <h2 className="border-b border-borda px-4 py-3 font-bold">Sangrias e reforços</h2>
              {aberto.movimentos.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-texto-suave">Nenhuma retirada ou reforço ainda.</p>
              ) : (
                <ul className="divide-y divide-borda">
                  {[...aberto.movimentos].reverse().map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                      {m.tipo === "SANGRIA" ? (
                        <ArrowUpCircle className="h-5 w-5 shrink-0 text-red-600" />
                      ) : (
                        <ArrowDownCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{m.motivo}</p>
                        <p className="text-xs text-texto-suave">
                          {horaBR(m.data)} · {m.tipo === "SANGRIA" ? "retirado" : "colocado"} por {nomePessoa(m.quem)}
                          {m.categoria && ` · ${m.categoria}`}
                          {m.gastoId && " · lançado em Gastos"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 font-black tabular-nums ${m.tipo === "SANGRIA" ? "text-red-600" : "text-emerald-600"}`}
                      >
                        {m.tipo === "SANGRIA" ? "− " : "+ "}
                        {brl(m.valor)}
                      </span>
                      {permissoes.excluir && (
                        <button
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-texto-suave hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          onClick={() => setDesfazendo(m)}
                          aria-label="Desfazer lançamento"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card overflow-hidden">
              <h2 className="border-b border-borda px-4 py-3 font-bold">Vendas do turno ({detalhe.vendas.length})</h2>
              {detalhe.vendas.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-texto-suave">Nenhuma venda ainda neste caixa.</p>
              ) : (
                <ul className="max-h-96 divide-y divide-borda overflow-y-auto">
                  {[...detalhe.vendas].reverse().map((v) => (
                    <li key={v.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="w-12 shrink-0 text-xs text-texto-suave tabular-nums">
                        {horaBR(v.finalizadaEm ?? v.abertaEm)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {numeroVenda(v.numero)} · {v.mesa || v.clienteNome ? nomeComanda(v) : "Consumidor final"}
                      </span>
                      <span className="shrink-0 text-xs text-texto-suave">
                        {[...new Set(v.pagamentos.map((p) => ROTULO_FORMA[p.forma]))].join(" + ") || "A prazo"}
                      </span>
                      <span className="w-24 shrink-0 text-right font-bold tabular-nums">{brl(totalVenda(v))}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <section className="card overflow-hidden">
          <h2 className="border-b border-borda px-4 py-3 font-bold">Caixas fechados</h2>
          {fechados.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-texto-suave">Nenhum fechamento ainda.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {fechados.map((c) => {
                const dif = c.contado !== undefined && c.resumo ? c.contado - c.resumo.dinheiroEsperado : 0;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">
                        {numeroCaixa(c.numero)} · {dataHoraBR(c.abertoEm)} → {dataHoraBR(c.fechadoEm ?? "")}
                      </p>
                      <p className="text-xs text-texto-suave">
                        {c.resumo?.vendas ?? 0} venda(s) · {brl(c.resumo?.totalVendido ?? 0)} · fechado por{" "}
                        {nomePessoa(c.fechadoPor)}
                      </p>
                    </div>
                    <span
                      className={`chip ${
                        Math.abs(dif) < 0.005
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : dif > 0
                            ? "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                            : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                      }`}
                    >
                      {Math.abs(dif) < 0.005 ? "Bateu" : dif > 0 ? `Sobrou ${brl(dif)}` : `Faltou ${brl(-dif)}`}
                    </span>
                    <button className="btn-secundario px-3 py-1.5 text-sm" disabled={!!gerando} onClick={() => pdf(c)}>
                      <FileDown className="h-4 w-4" />
                      {gerando === c.id ? "Gerando…" : "PDF"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <ModalAbrir
        aberto={abrindo}
        aoFechar={() => setAbrindo(false)}
        aoAbrir={async (fundo) => {
          if (aberto) return;
          const numero = caixas.reduce((m, c) => Math.max(m, c.numero || 0), 0) + 1;
          await salvar({
            id: novoId(),
            numero,
            status: "ABERTO",
            abertoEm: new Date().toISOString(),
            abertoPor: quem,
            fundoTroco: fundo,
            movimentos: [],
          });
          setAbrindo(false);
        }}
      />

      {aberto && detalhe && (
        <ModalMovimento
          tipo={movendo}
          naGaveta={detalhe.resumo.dinheiroEsperado}
          podeLancarGasto={permissoes.financeiro}
          quem={quem}
          aoFechar={() => setMovendo(null)}
          aoConfirmar={async (m, lancarGasto) => {
            let gastoId: string | undefined;
            if (m.tipo === "SANGRIA" && lancarGasto && m.categoria) {
              gastoId = novoId();
              const conta: ContaPagar = {
                id: gastoId,
                descricao: m.motivo,
                valor: m.valor,
                vencimento: hojeISO(),
                pago: true,
                pagoEm: m.data,
                categoria: m.categoria,
                forma: "DINHEIRO",
                pagoPor: CAIXA_DA_LOJA,
                lancadoPor: quem,
                obs: `Sangria do ${numeroCaixa(aberto.numero)} (retirado por ${m.quem})`,
                criadoEm: m.data,
              };
              await salvarContaPagar(conta);
            }
            await salvar({ ...aberto, movimentos: [...aberto.movimentos, { ...m, ...(gastoId && { gastoId }) }] });
            setMovendo(null);
          }}
        />
      )}

      <Modal
        aberto={!!desfazendo}
        aoFechar={() => setDesfazendo(null)}
        titulo="Desfazer lançamento"
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setDesfazendo(null)}>
              Voltar
            </button>
            <button
              className="btn-perigo"
              onClick={async () => {
                if (!aberto || !desfazendo) return;
                if (desfazendo.gastoId) await removerContaPagar(desfazendo.gastoId).catch(() => {});
                await salvar({ ...aberto, movimentos: aberto.movimentos.filter((m) => m.id !== desfazendo.id) });
                setDesfazendo(null);
              }}
            >
              Desfazer
            </button>
          </>
        }
      >
        <p className="text-sm text-texto-suave">
          {desfazendo?.tipo === "SANGRIA" ? "A sangria" : "O reforço"} de{" "}
          <strong className="text-texto">{brl(desfazendo?.valor ?? 0)}</strong> ({desfazendo?.motivo}) sai do caixa
          {desfazendo?.gastoId ? " e o gasto lançado junto também é apagado" : ""}. Use só se foi lançado por engano.
        </p>
      </Modal>

      {aberto && detalhe && (
        <ModalFechar
          aberto={fechando}
          caixa={aberto}
          esperado={detalhe.resumo.dinheiroEsperado}
          porForma={detalhe.resumo.porForma}
          aoFechar={() => setFechando(false)}
          aoConfirmar={async (contado, obs) => {
            const fechadoEm = new Date().toISOString();
            const resumo = calcularCaixa(aberto, vendas, fechadoEm).resumo;
            const fechado: Caixa = {
              ...aberto,
              status: "FECHADO",
              fechadoEm,
              fechadoPor: quem,
              contado,
              ...(obs && { obsFechamento: obs }),
              resumo,
            };
            await salvar(fechado);
            setFechando(false);
            await pdf(fechado);
          }}
        />
      )}
    </>
  );
}

function Bloco({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <div className={`card p-4 ${destaque ? "border-acento/50 bg-acento/5" : ""}`}>
      <p className="text-xs font-semibold text-texto-suave">{rotulo}</p>
      <p className={`mt-1 text-2xl font-black tabular-nums ${destaque ? "text-acento" : ""}`}>{valor}</p>
      {detalhe && <p className="text-xs text-texto-suave">{detalhe}</p>}
    </div>
  );
}

function Par({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className={`flex justify-between py-1 text-sm ${forte ? "mt-1 border-t border-borda pt-2 font-black" : ""}`}>
      <span className={forte ? "" : "text-texto-suave"}>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

function ModalAbrir({
  aberto,
  aoFechar,
  aoAbrir,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoAbrir: (fundo: number) => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Abrir caixa"
      rodape={
        <>
          <button className="btn-secundario" onClick={aoFechar}>
            Voltar
          </button>
          <button
            className="btn-primario"
            disabled={salvando}
            onClick={async () => {
              setSalvando(true);
              try {
                await aoAbrir(Math.max(0, paraNumero(texto)));
                setTexto("");
              } finally {
                setSalvando(false);
              }
            }}
          >
            <LockOpen className="h-4 w-4" />
            Abrir caixa
          </button>
        </>
      }
    >
      <label className="rotulo" htmlFor="fundo">
        Troco na gaveta (R$)
      </label>
      <input
        id="fundo"
        className="campo text-2xl font-black tabular-nums"
        inputMode="decimal"
        placeholder="0,00"
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <p className="mt-2 text-xs text-texto-suave">
        Conte o dinheiro que já está na gaveta antes de começar. A partir de agora, tudo que for vendido e recebido entra
        neste caixa até alguém apertar &quot;Fechar caixa&quot; — não fecha sozinho à meia-noite.
      </p>
    </Modal>
  );
}

function ModalMovimento({
  tipo,
  naGaveta,
  podeLancarGasto,
  quem,
  aoFechar,
  aoConfirmar,
}: {
  tipo: "SANGRIA" | "REFORCO" | null;
  naGaveta: number;
  podeLancarGasto: boolean;
  quem: string;
  aoFechar: () => void;
  aoConfirmar: (m: CaixaMovimento, lancarGasto: boolean) => Promise<void>;
}) {
  const sangria = tipo === "SANGRIA";
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [lancarGasto, setLancarGasto] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!tipo) return;
    setValor("");
    setMotivo("");
    setCategoria("");
    setPessoa(quem);
    setLancarGasto(true);
    setConfirmando(false);
  }, [tipo, quem]);

  const v = Math.round(paraNumero(valor) * 100) / 100;
  const faltaInfo = v <= 0 ? "Informe o valor." : motivo.trim().length < 3 ? "Escreva o motivo." : sangria && !categoria ? "Escolha pra que foi." : !pessoa.trim() ? "Informe quem." : "";
  const passaDaGaveta = sangria && v > naGaveta + 0.005;

  async function confirmar() {
    setSalvando(true);
    try {
      await aoConfirmar(
        {
          id: novoId(),
          tipo: tipo!,
          valor: v,
          motivo: motivo.trim(),
          ...(sangria && categoria && { categoria }),
          quem: pessoa.trim(),
          registradoPor: quem,
          data: new Date().toISOString(),
        },
        sangria && podeLancarGasto && lancarGasto,
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto={!!tipo}
      aoFechar={() => !salvando && aoFechar()}
      titulo={sangria ? "Sangria — tirar dinheiro do caixa" : "Reforço — colocar dinheiro no caixa"}
      rodape={
        confirmando ? (
          <>
            <button className="btn-secundario" onClick={() => setConfirmando(false)} disabled={salvando}>
              Corrigir
            </button>
            <button className={sangria ? "btn-perigo" : "btn-primario"} onClick={confirmar} disabled={salvando}>
              {salvando ? "Salvando…" : sangria ? `Confirmar retirada de ${brl(v)}` : `Confirmar reforço de ${brl(v)}`}
            </button>
          </>
        ) : (
          <>
            <button className="btn-secundario" onClick={aoFechar}>
              Voltar
            </button>
            <button className="btn-primario" disabled={!!faltaInfo} onClick={() => setConfirmando(true)}>
              Continuar
            </button>
          </>
        )
      }
    >
      {confirmando ? (
        <div className="space-y-2 text-sm">
          <p className="text-texto-suave">Confira antes de {sangria ? "tirar" : "colocar"} o dinheiro:</p>
          <div className="space-y-1 rounded-xl border border-borda p-3">
            <Par rotulo="Valor" valor={brl(v)} forte />
            <Par rotulo="Motivo" valor={motivo.trim()} />
            {sangria && <Par rotulo="Pra que foi" valor={categoria} />}
            <Par rotulo={sangria ? "Quem retirou" : "Quem colocou"} valor={pessoa.trim()} />
            {sangria && <Par rotulo="Fica na gaveta" valor={brl(naGaveta - v)} />}
          </div>
          {sangria && podeLancarGasto && lancarGasto && (
            <p className="text-xs text-texto-suave">Também vai pra Gastos (Fluxo de caixa) como &quot;{categoria}&quot;.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="rotulo" htmlFor="mov-valor">
              Valor (R$)
            </label>
            <input
              id="mov-valor"
              className="campo text-2xl font-black tabular-nums"
              inputMode="decimal"
              placeholder="0,00"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
            {sangria && (
              <p className={`mt-1 text-xs ${passaDaGaveta ? "font-bold text-red-600" : "text-texto-suave"}`}>
                Na gaveta agora (esperado): {brl(naGaveta)}
                {passaDaGaveta && " — o valor passa do que deveria ter!"}
              </p>
            )}
          </div>

          {sangria && (
            <div>
              <p className="rotulo">Pra que é o dinheiro?</p>
              <div className="flex flex-wrap gap-1.5">
                {MOTIVOS_SANGRIA.map((m) => (
                  <button
                    key={m.rotulo}
                    type="button"
                    onClick={() => setCategoria(m.categoria)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      categoria === m.categoria ? "bg-acento text-acento-texto" : "border border-borda text-texto-suave"
                    }`}
                  >
                    {m.rotulo}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="rotulo" htmlFor="mov-motivo">
              {sangria ? "Motivo / o que vai comprar" : "Motivo"} <span className="text-red-600">*</span>
            </label>
            <input
              id="mov-motivo"
              className="campo"
              placeholder={sangria ? "Ex.: 2 sacos de gelo no mercado" : "Ex.: troco extra pra noite"}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          <div>
            <label className="rotulo" htmlFor="mov-quem">
              {sangria ? "Quem está retirando" : "Quem está colocando"} <span className="text-red-600">*</span>
            </label>
            <input id="mov-quem" className="campo" value={pessoa} onChange={(e) => setPessoa(e.target.value)} />
          </div>

          {sangria && podeLancarGasto && (
            <label className="flex items-center gap-2 rounded-xl border border-borda px-3 py-2.5 text-sm font-semibold">
              <input
                type="checkbox"
                checked={lancarGasto}
                onChange={(e) => setLancarGasto(e.target.checked)}
                className="h-4 w-4 accent-[var(--acento)]"
              />
              Lançar também em Gastos (aparece no Fluxo de caixa)
            </label>
          )}

          {faltaInfo && valor && <p className="text-xs font-semibold text-amber-600">{faltaInfo}</p>}
        </div>
      )}
    </Modal>
  );
}

function ModalFechar({
  aberto,
  caixa,
  esperado,
  porForma,
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean;
  caixa: Caixa;
  esperado: number;
  porForma: Partial<Record<(typeof FORMAS)[number], number>>;
  aoFechar: () => void;
  aoConfirmar: (contado: number, obs: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (aberto) {
      setTexto("");
      setObs("");
    }
  }, [aberto]);
  const contado = Math.round(paraNumero(texto) * 100) / 100;
  const dif = Math.round((contado - esperado) * 100) / 100;
  const preenchido = texto.trim() !== "";

  return (
    <Modal
      aberto={aberto}
      aoFechar={() => !salvando && aoFechar()}
      titulo={`Fechar ${numeroCaixa(caixa.numero)}`}
      rodape={
        <>
          <button className="btn-secundario" onClick={aoFechar} disabled={salvando}>
            Voltar
          </button>
          <button
            className="btn-primario"
            disabled={!preenchido || salvando || (Math.abs(dif) >= 0.005 && obs.trim().length < 3)}
            onClick={async () => {
              setSalvando(true);
              try {
                await aoConfirmar(contado, obs.trim());
              } finally {
                setSalvando(false);
              }
            }}
          >
            <Lock className="h-4 w-4" />
            {salvando ? "Fechando…" : "Fechar caixa e gerar PDF"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-0.5 rounded-xl border border-borda p-3">
          {FORMAS.map((f) => (
            <Par key={f} rotulo={`Recebido em ${ROTULO_FORMA[f]}`} valor={brl(porForma[f] ?? 0)} />
          ))}
          <Par rotulo="Dinheiro que deve ter na gaveta" valor={brl(esperado)} forte />
        </div>
        <div>
          <label className="rotulo" htmlFor="contado">
            Dinheiro contado na gaveta (R$) <span className="text-red-600">*</span>
          </label>
          <input
            id="contado"
            className="campo text-2xl font-black tabular-nums"
            inputMode="decimal"
            placeholder="0,00"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        {preenchido && (
          <p
            className={`rounded-xl px-3 py-2 text-sm font-black ${
              Math.abs(dif) < 0.005
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : dif > 0
                  ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
            }`}
          >
            {Math.abs(dif) < 0.005 ? "Bateu certinho!" : dif > 0 ? `Sobrou ${brl(dif)}` : `Faltou ${brl(-dif)}`}
          </p>
        )}
        <div>
          <label className="rotulo" htmlFor="obs-fech">
            Observação {preenchido && Math.abs(dif) >= 0.005 && <span className="text-red-600">* (explique a diferença)</span>}
          </label>
          <input
            id="obs-fech"
            className="campo"
            placeholder="Ex.: troco a mais pro cliente da mesa 4"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </div>
        <p className="text-xs text-texto-suave">
          Ao fechar, o relatório em PDF é baixado na hora. Ele também fica na lista &quot;Caixas fechados&quot; pra baixar
          de novo.
        </p>
      </div>
    </Modal>
  );
}

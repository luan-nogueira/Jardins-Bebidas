"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, Download, History, Upload } from "lucide-react";
import { Modal } from "@/components/ui";
import { useDados, novoId } from "@/lib/store";
import { hojeISO } from "@/lib/format";
import {
  compararComCadastro,
  exportarPlanilha,
  lerPlanilha,
  type Alteracao,
} from "@/lib/planilha";
import type { EstoqueMovimento, Produto } from "@/lib/types";

/**
 * Central de planilha dos produtos: baixar pra editar no Excel, subir de
 * volta (com prévia do que muda) e os outros jeitos de importar.
 */
export function ModalPlanilha({
  aberto,
  aoFechar,
  aoColarLista,
  aoSistemaAntigo,
}: {
  aberto: boolean;
  aoFechar: () => void;
  /** Sem eles (tela Estoque) some o bloco "Outros jeitos de cadastrar". */
  aoColarLista?: () => void;
  aoSistemaAntigo?: () => void;
}) {
  const { produtos, salvarProdutosLote, salvarMovimentosLote, atualizarProduto } = useDados();
  const arquivo = useRef<HTMLInputElement>(null);
  const [gerando, setGerando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [alteracoes, setAlteracoes] = useState<Alteracao[] | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState("");

  function fechar() {
    if (aplicando) return;
    setAlteracoes(null);
    setAvisos([]);
    setResultado("");
    aoFechar();
  }

  async function baixar() {
    setGerando(true);
    try {
      await exportarPlanilha(produtos);
    } finally {
      setGerando(false);
    }
  }

  async function ler(file: File) {
    setLendo(true);
    setResultado("");
    try {
      const { linhas, avisos } = await lerPlanilha(file);
      setAvisos(avisos);
      setAlteracoes(compararComCadastro(linhas, produtos));
    } catch (e) {
      setAvisos([`Não consegui ler o arquivo: ${(e as Error).message}`]);
      setAlteracoes([]);
    } finally {
      setLendo(false);
      if (arquivo.current) arquivo.current.value = "";
    }
  }

  async function aplicar() {
    if (!alteracoes) return;
    setAplicando(true);
    try {
      const agora = new Date().toISOString();
      const novos: Produto[] = [];
      const ajustes: EstoqueMovimento[] = [];
      for (const a of alteracoes) {
        const l = a.linha;
        if (!a.produto) {
          const id = novoId();
          novos.push({
            id,
            nome: l.nome,
            categoria: l.categoria,
            unPorCaixa: l.unPorCaixa,
            precoUn: l.precoUn,
            precoRetirada: l.precoRetirada || undefined,
            precoCusto: l.precoCusto,
            estoqueUn: l.semEstoque ? 0 : l.estoqueUn,
            estoqueMinimo: l.estoqueMinimo,
            semEstoque: l.semEstoque || undefined,
            codigo: l.codigo,
            codigoBarras: l.codigoBarras,
            ativo: l.ativo,
            visivelCatalogo: false,
            criadoEm: agora,
            atualizadoEm: agora,
          });
          if (!l.semEstoque && l.estoqueUn > 0) {
            ajustes.push(movimentoAjuste(id, l.nome, l.estoqueUn, "Estoque inicial (planilha)", agora));
          }
          continue;
        }
        const campos = { ...a.campos };
        if (a.deltaEstoque !== 0) {
          campos.estoqueUn = l.estoqueUn;
          ajustes.push(
            movimentoAjuste(
              a.produto.id,
              l.nome,
              a.deltaEstoque,
              `Planilha: estoque ${a.produto.estoqueUn} → ${l.estoqueUn}`,
              agora,
            ),
          );
        }
        if (Object.keys(campos).length) await atualizarProduto(a.produto.id, campos);
      }
      if (novos.length) await salvarProdutosLote(novos);
      if (ajustes.length) await salvarMovimentosLote(ajustes);
      const alterados = alteracoes.length - novos.length;
      setResultado(`Pronto! ${novos.length} produto(s) novo(s) e ${alterados} atualizado(s).`);
      setAlteracoes(null);
    } catch (e) {
      setResultado(`Deu erro: ${(e as Error).message}. Pode importar a planilha de novo.`);
    } finally {
      setAplicando(false);
    }
  }

  const novos = alteracoes?.filter((a) => !a.produto) ?? [];
  const mudados = alteracoes?.filter((a) => a.produto) ?? [];

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      titulo={alteracoes ? "Conferir antes de gravar" : "Planilha de produtos"}
      largura="max-w-xl"
      rodape={
        alteracoes ? (
          <>
            <button className="btn-secundario" onClick={() => setAlteracoes(null)} disabled={aplicando}>
              Voltar
            </button>
            <button className="btn-primario" onClick={aplicar} disabled={aplicando || alteracoes.length === 0}>
              {aplicando ? "Gravando…" : `Gravar ${alteracoes.length} alteração(ões)`}
            </button>
          </>
        ) : undefined
      }
    >
      {alteracoes ? (
        <div className="space-y-3 text-sm">
          {alteracoes.length === 0 ? (
            <p className="rounded-xl bg-superficie-2 px-4 py-3">
              Nada mudou — a planilha está igual ao cadastro.
            </p>
          ) : (
            <p>
              <strong>{novos.length}</strong> produto(s) novo(s) e <strong>{mudados.length}</strong> com
              alteração. Os outros ficam como estão.
            </p>
          )}
          {avisos.length > 0 && (
            <ul className="rounded-xl border border-ouro-300 bg-ouro-50 dark:border-ouro-800 px-4 py-2 text-xs dark:bg-ouro-900/20">
              {avisos.slice(0, 8).map((a) => (
                <li key={a}>{a}</li>
              ))}
              {avisos.length > 8 && <li>… e mais {avisos.length - 8}</li>}
            </ul>
          )}
          <ul className="card max-h-[50dvh] divide-y divide-borda overflow-y-auto">
            {alteracoes.map((a) => (
              <li key={a.linha.linha} className="px-3 py-2">
                <p className="flex items-center gap-2 font-semibold">
                  <span className="min-w-0 flex-1 truncate">{a.linha.nome}</span>
                  <span
                    className={`chip shrink-0 ${
                      a.produto
                        ? "bg-ouro-100 text-ouro-900 dark:bg-ouro-900/40 dark:text-ouro-200"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    }`}
                  >
                    {a.produto ? "altera" : "novo"}
                  </span>
                </p>
                {a.produto && (
                  <p className="text-xs text-texto-suave">{a.mudancas.join(" · ")}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-3">
          {resultado && (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              {resultado}
            </p>
          )}

          <Opcao
            Icone={Download}
            titulo={gerando ? "Gerando planilha…" : "Baixar planilha (Excel)"}
            texto={`Todos os ${produtos.length} produtos organizados por categoria, com listas de escolha. Edite no Excel ou no Google Planilhas.`}
            destaque
            desativado={gerando}
            aoClicar={baixar}
          />
          <Opcao
            Icone={Upload}
            titulo={lendo ? "Lendo planilha…" : "Importar planilha editada"}
            texto="Sobe o arquivo de volta. Antes de gravar, mostra o que vai mudar em cada produto."
            desativado={lendo}
            aoClicar={() => arquivo.current?.click()}
          />
          <input
            ref={arquivo}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void ler(f);
            }}
          />

          {aoColarLista && aoSistemaAntigo && (
          <div className="pt-2">
            <p className="rotulo">Outros jeitos de cadastrar</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Opcao Icone={ClipboardPaste} titulo="Colar lista de preços" texto="Do WhatsApp ou de outra planilha." aoClicar={aoColarLista} pequeno />
              <Opcao Icone={History} titulo="Sistema antigo (LC)" texto="Os 548 produtos da conferência de 27/10." aoClicar={aoSistemaAntigo} pequeno />
            </div>
          </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function movimentoAjuste(
  produtoId: string,
  produtoNome: string,
  delta: number,
  obs: string,
  agora: string,
): EstoqueMovimento {
  return {
    id: novoId(),
    produtoId,
    produtoNome,
    tipo: delta > 0 ? "ENTRADA" : "SAIDA",
    origem: "AJUSTE",
    quantidadeUn: Math.abs(delta),
    data: hojeISO(),
    obs,
    criadoEm: agora,
  };
}

function Opcao({
  Icone,
  titulo,
  texto,
  aoClicar,
  destaque = false,
  desativado = false,
  pequeno = false,
}: {
  Icone: React.ComponentType<{ className?: string }>;
  titulo: string;
  texto: string;
  aoClicar: () => void;
  destaque?: boolean;
  desativado?: boolean;
  pequeno?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={desativado}
      onClick={aoClicar}
      className={`card flex w-full items-start gap-3 text-left transition hover:bg-superficie-2 disabled:opacity-60 ${
        pequeno ? "px-3 py-2.5" : "px-4 py-3.5"
      } ${destaque ? "border-acento/40 bg-acento/5" : ""}`}
    >
      <span
        className={`grid shrink-0 place-items-center rounded-xl ${
          pequeno ? "h-8 w-8" : "h-10 w-10"
        } ${destaque ? "bg-acento text-acento-texto" : "bg-superficie-2 text-acento"}`}
      >
        <Icone className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className={`block font-bold ${pequeno ? "text-sm" : ""}`}>{titulo}</span>
        <span className="block text-xs text-texto-suave">{texto}</span>
      </span>
    </button>
  );
}


"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui";
import { useDados } from "@/lib/store";
import { brl, hojeISO, normalizar } from "@/lib/format";
import catalogo from "@/lib/db/catalogo-lc.json";
import type { EstoqueMovimento, Produto } from "@/lib/types";

/**
 * Produtos da "Conferência de estoque" do sistema antigo (LC Sistemas,
 * impressa em 27/10/2026). Categoria e "sem estoque" foram deduzidos pelo
 * nome; estoque negativo no sistema antigo entra como 0 (precisa contar).
 */
interface ItemLC {
  /** Nome como estava no sistema antigo, antes da padronização. */
  nomeOriginal: string;
  codigo: string;
  barras: string;
  nome: string;
  estoque: number;
  estoqueOriginal: number;
  preco: number;
  categoria: string;
  semEstoque: boolean;
}

export const CATALOGO_LC = catalogo as ItemLC[];

export function ModalSistemaAntigo({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const { produtos, salvarProdutosLote, salvarMovimentosLote, atualizarProduto } = useDados();
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);
  const [terminou, setTerminou] = useState("");

  /** Acha o produto já cadastrado: pelo código antigo, depois pelo nome. */
  const existente = useMemo(() => {
    const porCodigo = new Map(produtos.filter((p) => p.codigo).map((p) => [p.codigo!, p]));
    const porNome = new Map(produtos.map((p) => [normalizar(p.nome), p]));
    return (i: ItemLC): Produto | undefined =>
      porCodigo.get(i.codigo) ?? porNome.get(normalizar(i.nome)) ?? porNome.get(normalizar(i.nomeOriginal));
  }, [produtos]);

  const resumo = useMemo(() => {
    const categorias = new Map<string, number>();
    let novos = 0;
    let comEstoque = 0;
    let negativos = 0;
    let semEstoque = 0;
    for (const i of CATALOGO_LC) {
      categorias.set(i.categoria, (categorias.get(i.categoria) ?? 0) + 1);
      if (!existente(i)) novos++;
      if (i.estoque > 0) comEstoque++;
      if (i.estoqueOriginal < 0 && !i.semEstoque) negativos++;
      if (i.semEstoque) semEstoque++;
    }
    return {
      categorias: [...categorias.entries()].sort((a, b) => b[1] - a[1]),
      novos,
      atualizados: CATALOGO_LC.length - novos,
      comEstoque,
      negativos,
      semEstoque,
    };
  }, [existente]);

  async function importar() {
    setTerminou("");
    setProgresso({ feito: 0, total: CATALOGO_LC.length });
    const agora = new Date().toISOString();
    const novosProdutos: Produto[] = [];
    const movimentosIniciais: EstoqueMovimento[] = [];
    const atualizar: { id: string; campos: Partial<Produto> }[] = [];

    for (const i of CATALOGO_LC) {
      const ja = existente(i);
      if (ja) {
        // Já cadastrado: atualiza preço e códigos, sem mexer no estoque
        // (ele já pode ter vendas e entradas lançadas aqui).
        atualizar.push({
          id: ja.id,
          campos: {
            precoUn: i.preco,
            codigo: i.codigo,
            codigoBarras: i.barras || ja.codigoBarras,
            categoria: ja.categoria || i.categoria,
          },
        });
        continue;
      }
      const id = `lc-${i.codigo}`;
      novosProdutos.push({
        id,
        nome: i.nome,
        categoria: i.categoria,
        unPorCaixa: 1,
        precoUn: i.preco,
        precoCusto: 0,
        estoqueUn: i.estoque,
        estoqueMinimo: 0,
        semEstoque: i.semEstoque || undefined,
        codigo: i.codigo,
        codigoBarras: i.barras || undefined,
        ativo: true,
        visivelCatalogo: false,
        criadoEm: agora,
        atualizadoEm: agora,
      });
      // Estoque inicial no histórico, pra soma do histórico bater com o estoque.
      if (i.estoque > 0) {
        movimentosIniciais.push({
          id: `lc-inicial-${i.codigo}`,
          produtoId: id,
          produtoNome: i.nome,
          tipo: "ENTRADA",
          origem: "AJUSTE",
          quantidadeUn: i.estoque,
          data: hojeISO(),
          obs: "Estoque inicial — conferência do sistema antigo (27/10)",
          criadoEm: agora,
        });
      }
    }

    try {
      await salvarProdutosLote(novosProdutos);
      setProgresso({ feito: novosProdutos.length, total: CATALOGO_LC.length });
      await salvarMovimentosLote(movimentosIniciais);
      let feitos = novosProdutos.length;
      for (const { id, campos } of atualizar) {
        await atualizarProduto(id, campos);
        feitos++;
        if (feitos % 10 === 0) setProgresso({ feito: feitos, total: CATALOGO_LC.length });
      }
      setTerminou(`Pronto! ${novosProdutos.length} produto(s) novo(s) e ${atualizar.length} atualizado(s).`);
    } catch (e) {
      setTerminou(
        `Deu erro: ${(e as Error).message}. Pode importar de novo — ele não duplica os produtos.`,
      );
    } finally {
      setProgresso(null);
    }
  }

  const rodando = progresso !== null;

  return (
    <Modal
      aberto={aberto}
      aoFechar={() => !rodando && aoFechar()}
      titulo="Produtos do sistema antigo"
      largura="max-w-xl"
      rodape={
        <>
          <button className="btn-secundario" onClick={aoFechar} disabled={rodando}>
            {terminou ? "Fechar" : "Cancelar"}
          </button>
          {!terminou && (
            <button className="btn-primario" onClick={importar} disabled={rodando}>
              {rodando
                ? `Importando ${progresso.feito}/${progresso.total}…`
                : `Importar ${CATALOGO_LC.length} produtos`}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-sm">
        {terminou ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {terminou}
          </p>
        ) : (
          <>
            <ul className="space-y-1 text-texto-suave">
              <li>
                <strong className="text-texto">{resumo.novos}</strong> novos ·{" "}
                <strong className="text-texto">{resumo.atualizados}</strong> já cadastrados (só
                atualiza preço e códigos, o estoque fica como está)
              </li>
              <li>
                <strong className="text-texto">{resumo.comEstoque}</strong> entram com o estoque da
                conferência
              </li>
              <li>
                <strong className="text-texto">{resumo.negativos}</strong> estavam{" "}
                <strong className="text-red-600">negativos</strong> no sistema antigo e entram com 0 —
                conte e faça um Ajuste no Estoque
              </li>
              <li>
                <strong className="text-texto">{resumo.semEstoque}</strong> porções, doses e serviços
                entram sem controle de estoque
              </li>
              <li>Preço de custo não vem no relatório — cadastre depois pra ver o lucro.</li>
            </ul>

            <div>
              <p className="rotulo">Categorias (dá pra renomear depois em Categorias)</p>
              <div className="flex flex-wrap gap-1.5">
                {resumo.categorias.map(([c, n]) => (
                  <span key={c} className="chip bg-superficie-2 text-texto-suave">
                    {c} <strong className="text-texto">{n}</strong>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="rotulo">Alguns exemplos</p>
              <ul className="card max-h-48 divide-y divide-borda overflow-y-auto">
                {CATALOGO_LC.slice(0, 40).map((i) => (
                  <li key={i.codigo} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate">{i.nome}</span>
                    <span className="shrink-0 text-texto-suave">{i.categoria}</span>
                    <span className="w-14 shrink-0 text-right tabular-nums">
                      {i.semEstoque ? "—" : `${i.estoque} un`}
                    </span>
                    <span className="w-16 shrink-0 text-right font-semibold tabular-nums">{brl(i.preco)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

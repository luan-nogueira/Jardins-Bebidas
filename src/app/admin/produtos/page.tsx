"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Boxes,
  FileSpreadsheet,
  Package,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  Upload,
} from "lucide-react";
import { Cabecalho, Modal, Vazio } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { useDados, novoId } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { firebaseConfigurado } from "@/lib/firebase";
import { brl, dataBR, normalizar, paraCampo, paraNumero } from "@/lib/format";
import { compararCategorias, estoqueNegativo, semCustoNoEstoque } from "@/lib/calc";
import { CATEGORIAS_PADRAO } from "@/lib/db/seed";
import { ModalSistemaAntigo } from "@/components/ImportarSistemaAntigo";
import { ModalPlanilha } from "@/components/ModalPlanilha";
import type { Produto } from "@/lib/types";

type Formulario = {
  nome: string;
  categoria: string;
  unPorCaixa: string;
  precoUn: string;
  precoRetirada: string;
  precoPacote: string;
  precoTabela2: string;
  precoTabela3: string;
  precoCusto: string;
  estoqueMinimo: string;
  imagemUrl: string;
  imagemCenario: boolean;
  ativo: boolean;
  visivelCatalogo: boolean;
  controlaEstoque: boolean;
  codigoBarras: string;
  codigo: string;
};

const FORM_VAZIO: Formulario = {
  nome: "",
  categoria: CATEGORIAS_PADRAO[0],
  unPorCaixa: "1",
  precoUn: "",
  precoRetirada: "",
  precoPacote: "",
  precoTabela2: "",
  precoTabela3: "",
  precoCusto: "",
  estoqueMinimo: "0",
  imagemUrl: "",
  imagemCenario: false,
  ativo: true,
  visivelCatalogo: true,
  controlaEstoque: true,
  codigoBarras: "",
  codigo: "",
};

export default function ProdutosPage() {
  // O Suspense é exigido pelo useSearchParams (?semCusto=1) numa página estática.
  return (
    <Protegido chave="produtos">
      <Suspense fallback={<p className="p-6 text-sm text-texto-suave">Carregando…</p>}>
        <ProdutosPageInterno />
      </Suspense>
    </Protegido>
  );
}

function ProdutosPageInterno() {
  const { produtos, salvarProduto, removerProduto, carregando, movimentos } = useDados();
  const { permissoes } = useAuth();
  const router = useRouter();

  // Vem do atalho "Cadastrar custos" do Estoque: lista só quem tem
  // mercadoria no galpão e ainda não tem preço de custo.
  const soSemCusto = useSearchParams().get("semCusto") === "1" && permissoes.verCusto;

  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Produto | null>(null);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [modalAberto, setModalAberto] = useState(false);
  const [importAberto, setImportAberto] = useState(false);
  const [antigoAberto, setAntigoAberto] = useState(false);
  const [planilhaAberta, setPlanilhaAberta] = useState(false);
  const [categoriasAberto, setCategoriasAberto] = useState(false);
  const [fazendoUpload, setFazendoUpload] = useState(false);
  const [excluindoProduto, setExcluindoProduto] = useState<Produto | null>(null);
  const [salvandoProduto, setSalvandoProduto] = useState(false);

  const ultimaCompra = useMemo(() => {
    if (!editando?.id) return null;
    const compras = movimentos
      .filter(
        (m) => m.produtoId === editando.id && m.origem === "COMPRA" && m.custoUn !== undefined,
      )
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    return compras[0] || null;
  }, [editando?.id, movimentos]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFazendoUpload(true);
    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET?.trim();
      if (cloudName && uploadPreset) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", uploadPreset);

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          { method: "POST", body: formData },
        );

        const data = await response.json();

        if (data.secure_url) {
          setForm({ ...form, imagemUrl: data.secure_url });
        } else {
          throw new Error(data.error?.message || "Erro no Cloudinary");
        }
      } else {
        const reader = new FileReader();
        reader.onloadend = () => {
          setForm({ ...form, imagemUrl: reader.result as string });
          setFazendoUpload(false);
        };
        reader.readAsDataURL(file);
        return; 
      }
    } catch (error) {
      console.error("Erro no upload", error);
      const motivo = error instanceof Error ? error.message : "";
      alert(`Erro ao fazer upload da imagem.${motivo ? ` (${motivo})` : ""}`);
    }
    setFazendoUpload(false);
  }

  const categorias = useMemo(() => {
    const doBanco = produtos.map((p) => p.categoria).filter(Boolean);
    return Array.from(new Set(doBanco));
  }, [produtos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    const base = soSemCusto ? produtos.filter(semCustoNoEstoque) : produtos;
    if (!termo) return base;
    return base.filter(
      (p) =>
        normalizar(p.nome).includes(termo) ||
        normalizar(p.categoria).includes(termo) ||
        p.codigoBarras === busca.trim() ||
        p.codigo === busca.trim(),
    );
  }, [produtos, busca, soSemCusto]);

  const agrupados = useMemo(() => {
    const mapa = new Map<string, Produto[]>();
    for (const p of filtrados) {
      const chave = p.categoria || "Sem categoria";
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(p);
    }
    return Array.from(mapa.entries()).sort(([a], [b]) =>
      compararCategorias(a, b),
    );
  }, [filtrados]);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(p: Produto) {
    setEditando(p);
    setForm({
      nome: p.nome,
      categoria: p.categoria,
      unPorCaixa: String(p.unPorCaixa),
      precoUn: paraCampo(p.precoUn),
      precoRetirada: p.precoRetirada ? paraCampo(p.precoRetirada) : "",
      precoPacote: p.precoPacote ? paraCampo(p.precoPacote) : "",
      precoTabela2: p.precoTabela2 ? paraCampo(p.precoTabela2) : "",
      precoTabela3: p.precoTabela3 ? paraCampo(p.precoTabela3) : "",
      precoCusto: paraCampo(p.precoCusto),
      estoqueMinimo: String(p.estoqueMinimo ?? 0),
      imagemUrl: p.imagemUrl ?? "",
      imagemCenario: p.imagemCenario ?? false,
      ativo: p.ativo,
      visivelCatalogo: p.visivelCatalogo,
      controlaEstoque: !p.semEstoque,
      codigoBarras: p.codigoBarras ?? "",
      codigo: p.codigo ?? "",
    });
    setModalAberto(true);
  }

  async function salvar() {
    if (salvandoProduto) return;
    const nome = form.nome.trim();
    if (!nome) return;

    setSalvandoProduto(true);
    const agora = new Date().toISOString();
    try {
    await salvarProduto({
      id: editando?.id ?? novoId(),
      nome,
      categoria: form.categoria || "Sem categoria",
      // Uma caixa nunca tem zero unidade; o mínimo é o produto avulso.
      unPorCaixa: Math.max(1, Math.round(paraNumero(form.unPorCaixa))),
      precoUn: paraNumero(form.precoUn),
      precoRetirada: paraNumero(form.precoRetirada) > 0 ? paraNumero(form.precoRetirada) : undefined,
      precoPacote: paraNumero(form.precoPacote) > 0 ? paraNumero(form.precoPacote) : undefined,
      precoTabela2: form.precoTabela2 ? paraNumero(form.precoTabela2) : undefined,
      precoTabela3: form.precoTabela3 ? paraNumero(form.precoTabela3) : undefined,
      precoCusto: paraNumero(form.precoCusto),
      // O estoque não é campo do formulário: pega o atual do banco, não o de
      // quando o formulário abriu — senão uma compra ou pedido lançado com
      // ele aberto voltava o estoque pro número antigo sem deixar rastro.
      estoqueUn: (editando && produtos.find((p) => p.id === editando.id)?.estoqueUn) ?? editando?.estoqueUn ?? 0,
      estoqueMinimo: Math.max(0, Math.round(paraNumero(form.estoqueMinimo))),
      imagemUrl: form.imagemUrl.trim() || undefined,
      imagemCenario: form.imagemCenario,
      ativo: form.ativo,
      visivelCatalogo: form.visivelCatalogo,
      semEstoque: form.controlaEstoque ? undefined : true,
      codigoBarras: form.codigoBarras.trim() || undefined,
      codigo: form.codigo.trim() || undefined,
      criadoEm: editando?.criadoEm ?? agora,
      atualizadoEm: agora,
    });
      setModalAberto(false);
    } finally {
      setSalvandoProduto(false);
    }
  }

  function solicitarExclusao(p: Produto) {
    setExcluindoProduto(p);
  }

  async function confirmarExclusao() {
    if (!excluindoProduto) return;
    await removerProduto(excluindoProduto.id);
    setExcluindoProduto(null);
  }

  return (
    <>
      <Cabecalho
        titulo="Produtos"
        subtitulo={
          carregando
            ? "Carregando…"
            : `${produtos.length} ${produtos.length === 1 ? "produto" : "produtos"} no catálogo`
        }
        acao={
          // Botões com nome também no celular: só com ícone o Luifer apertou
          // o "Recuperar produtos da demonstração" achando que era enviar o
          // catálogo, e ele regravou 35 produtos com estoque zerado.
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secundario"
              onClick={() => setPlanilhaAberta(true)}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Planilha
            </button>
            <button
              className="btn-secundario"
              onClick={() => setCategoriasAberto(true)}
            >
              <Tags className="h-4 w-4" />
              Categorias
            </button>
            <button className="btn-primario" onClick={abrirNovo}>
              <Plus className="h-4 w-4" />
              Novo
            </button>
          </div>
        }
      />

      <div className="px-4 md:px-6">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-texto-suave" />
          <input
            className="campo pl-9"
            placeholder="Buscar produto ou categoria…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {soSemCusto && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-ouro-300 bg-ouro-50 dark:border-ouro-800 px-4 py-3 text-sm dark:bg-ouro-900/20">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {filtrados.length} produto(s) em estoque sem custo
              </span>
              <span className="block text-xs text-texto-suave">
                Toque no lápis e preencha o Preço de custo — ao salvar, o produto sai desta lista.
              </span>
            </span>
            <button
              type="button"
              className="btn-secundario shrink-0 text-xs"
              onClick={() => router.replace("/admin/produtos")}
            >
              Mostrar todos
            </button>
          </div>
        )}
      </div>

      {!carregando && filtrados.length === 0 && soSemCusto && !busca && (
        <Vazio
          Icone={Package}
          titulo="Tudo com custo cadastrado"
          descricao="Todos os produtos em estoque já têm preço de custo."
        />
      )}

      {!carregando && filtrados.length === 0 && !(soSemCusto && !busca) && (
        <Vazio
          Icone={Package}
          titulo={busca ? "Nada encontrado" : "Nenhum produto ainda"}
          descricao={
            busca
              ? "Tente outro termo de busca."
              : "Cadastre um produto ou importe a lista de uma vez."
          }
          acao={
            !busca ? (
              <button className="btn-primario" onClick={abrirNovo}>
                <Plus className="h-4 w-4" />
                Cadastrar produto
              </button>
            ) : undefined
          }
        />
      )}

      <div className="space-y-6 px-4 md:px-6">
        {agrupados.map(([categoria, itens]) => (
          <section key={categoria}>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-texto-suave uppercase">
              <Boxes className="h-3.5 w-3.5" />
              {categoria}
              <span className="font-normal normal-case">({itens.length})</span>
            </h2>

            <ul className="card divide-y divide-borda overflow-hidden">
              {itens.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-superficie-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className={`truncate font-semibold ${!p.ativo ? "text-texto-suave line-through" : ""}`}
                      >
                        {p.nome}
                      </p>
                      {estoqueNegativo(p) && (
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 uppercase dark:bg-red-950 dark:text-red-400" title="Foi vendido mais do que tinha no sistema">
                          Estoque Negativo
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-texto-suave">
                      {[
                        p.codigo && `Cód. ${p.codigo}`,
                        p.semEstoque ? "sem controle de estoque" : `estoque ${p.estoqueUn} un`,
                        p.unPorCaixa > 1 && `${p.unPorCaixa} un/cx`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  <p className="shrink-0 text-right font-bold tabular-nums">
                    {brl(p.precoUn)}
                    <span className="block text-[11px] font-normal text-texto-suave">
                      por un
                    </span>
                  </p>

                  <div className="flex shrink-0 gap-1">
                    <button
                      className="grid h-9 w-9 place-items-center rounded-lg text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                      onClick={() => abrirEdicao(p)}
                      aria-label={`Editar ${p.nome}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {permissoes.excluir && (
                      <button
                        className="grid h-9 w-9 place-items-center rounded-lg text-texto-suave transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        onClick={() => solicitarExclusao(p)}
                        aria-label={`Excluir ${p.nome}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <Modal
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        titulo={editando ? "Editar produto" : "Novo produto"}
        rodape={
          <>
            <button
              className="btn-secundario"
              onClick={() => setModalAberto(false)}
              disabled={salvandoProduto}
            >
              Cancelar
            </button>
            <button
              className="btn-primario"
              onClick={salvar}
              disabled={salvandoProduto || !form.nome.trim()}
            >
              {salvandoProduto ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <div className="space-y-6">
          <Secao titulo="Produto">
            <div>
              <label className="rotulo" htmlFor="nome">
                Nome
              </label>
              <input
                id="nome"
                className="campo"
                autoFocus
                placeholder="Ex: Heineken Long Neck 330ml"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>

            <div>
              <label className="rotulo" htmlFor="categoria">
                Categoria
              </label>
              <select
                id="categoria"
                className="campo"
                value={categorias.includes(form.categoria) ? form.categoria : "__nova__"}
                onChange={(e) =>
                  setForm({
                    ...form,
                    categoria: e.target.value === "__nova__" ? "" : e.target.value,
                  })
                }
              >
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__nova__">+ Nova categoria…</option>
              </select>
              {!categorias.includes(form.categoria) && (
                <input
                  className="campo mt-2"
                  autoFocus
                  placeholder="Nome da nova categoria"
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                />
              )}
            </div>
          </Secao>

          <Secao titulo="Preço">
            <div className={permissoes.verCusto ? "grid grid-cols-2 gap-3" : ""}>
              <div className="min-w-0">
                <label className="rotulo" htmlFor="preco">
                  Consumo no local (R$)
                </label>
                <input
                  id="preco"
                  className="campo text-lg font-bold"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.precoUn}
                  onChange={(e) => setForm({ ...form, precoUn: e.target.value })}
                />
              </div>
              {permissoes.verCusto && (
                <div className="min-w-0">
                  <label className="rotulo" htmlFor="custo">
                    Custo (R$)
                  </label>
                  <input
                    id="custo"
                    className="campo text-lg"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.precoCusto}
                    onChange={(e) => setForm({ ...form, precoCusto: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="rotulo" htmlFor="preco-retirada">
                Retirada (R$) — opcional
              </label>
              <input
                id="preco-retirada"
                className="campo"
                inputMode="decimal"
                placeholder="Mesmo preço do consumo no local"
                value={form.precoRetirada}
                onChange={(e) => setForm({ ...form, precoRetirada: e.target.value })}
              />
            </div>
            {/tabac|cigar|fumo/i.test(`${form.categoria} ${form.nome}`) && (
              <div>
                <label className="rotulo" htmlFor="preco-maco">
                  Preço do maço (R$)
                </label>
                <input
                  id="preco-maco"
                  className="campo"
                  inputMode="decimal"
                  placeholder={
                    paraNumero(form.unPorCaixa) > 1 && paraNumero(form.precoUn) > 0
                      ? `${brl(paraNumero(form.precoUn) * paraNumero(form.unPorCaixa))} (${form.unPorCaixa} × unidade)`
                      : "Ex.: 12,00"
                  }
                  value={form.precoPacote}
                  onChange={(e) => setForm({ ...form, precoPacote: e.target.value })}
                />
                <p className="mt-1 text-xs text-texto-suave">
                  O preço acima é o da unidade (cigarro avulso). Em &quot;Unidades na caixa&quot;, coloque quantos vêm
                  no maço (normalmente 20). Na venda o sistema pergunta: maço ou unidade?
                </p>
              </div>
            )}
            {permissoes.verCusto && (
              <p className="text-xs text-texto-suave">
                O custo se atualiza sozinho quando você lança uma entrada (compra) deste produto.
                {ultimaCompra && (
                  <>
                    {" "}Última compra: <strong>{brl(ultimaCompra.custoUn ?? 0)}</strong> em{" "}
                    {dataBR(ultimaCompra.data)}.
                  </>
                )}
              </p>
            )}
            {permissoes.verCusto && paraNumero(form.precoCusto) > 0 && paraNumero(form.precoUn) > 0 && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                Lucro de{" "}
                <strong>{brl(paraNumero(form.precoUn) - paraNumero(form.precoCusto))}</strong> por
                unidade (
                {Math.round(
                  ((paraNumero(form.precoUn) - paraNumero(form.precoCusto)) / paraNumero(form.precoUn)) *
                    100,
                )}
                % do preço)
              </p>
            )}
          </Secao>

          <Secao titulo="Estoque">
            <Interruptor
              rotulo="Controlar estoque"
              descricao="Desligue pra porção, dose, couvert, taxa de entrega… — vende normal, mas não conta estoque."
              valor={form.controlaEstoque}
              aoMudar={(v) => setForm({ ...form, controlaEstoque: v })}
            />
            {form.controlaEstoque && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <label className="rotulo" htmlFor="minimo">
                      Avisar quando tiver
                    </label>
                    <div className="relative">
                      <input
                        id="minimo"
                        className="campo pr-10"
                        inputMode="numeric"
                        value={form.estoqueMinimo}
                        onChange={(e) => setForm({ ...form, estoqueMinimo: e.target.value })}
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-texto-suave">
                        un
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="rotulo" htmlFor="unpcx">
                      Unidades na caixa
                    </label>
                    <input
                      id="unpcx"
                      className="campo"
                      inputMode="numeric"
                      value={form.unPorCaixa}
                      onChange={(e) => setForm({ ...form, unPorCaixa: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-texto-suave">
                  {editando
                    ? `Estoque agora: ${produtos.find((p) => p.id === editando.id)?.estoqueUn ?? editando.estoqueUn} un. Pra corrigir, use Estoque → Contar estoque.`
                    : "O estoque começa em 0. Some com uma entrada (compra) ou em Estoque → Contar estoque."}
                  {paraNumero(form.unPorCaixa) > 1 &&
                    paraNumero(form.precoUn) > 0 &&
                    ` Caixa fechada: ${brl(paraNumero(form.precoUn) * paraNumero(form.unPorCaixa))}.`}
                </p>
              </>
            )}
          </Secao>

          <Secao titulo="Códigos (opcional)">
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="rotulo" htmlFor="barras">
                  Código de barras
                </label>
                <input
                  id="barras"
                  className="campo"
                  inputMode="numeric"
                  placeholder="leia com o leitor"
                  value={form.codigoBarras}
                  onChange={(e) => setForm({ ...form, codigoBarras: e.target.value })}
                />
              </div>
              <div className="min-w-0">
                <label className="rotulo" htmlFor="codigo">
                  Código interno
                </label>
                <input
                  id="codigo"
                  className="campo"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                />
              </div>
            </div>
          </Secao>

          <Secao titulo="Foto (opcional)">
            <div className="flex items-center gap-3">
              <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-borda bg-white">
                {form.imagemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.imagemUrl} alt="Foto do produto" className="h-full w-full object-contain p-1" />
                ) : (
                  <Package className="h-6 w-6 text-texto-suave" />
                )}
              </div>
              <label className="btn-secundario cursor-pointer">
                {fazendoUpload ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-acento border-t-transparent" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {form.imagemUrl ? "Trocar foto" : "Escolher foto"}
                <input type="file" className="hidden" accept="image/*" onChange={handleUpload} disabled={fazendoUpload} />
              </label>
              {form.imagemUrl && (
                <button
                  type="button"
                  className="text-xs font-semibold text-texto-suave hover:text-red-600"
                  onClick={() => setForm({ ...form, imagemUrl: "" })}
                >
                  Tirar
                </button>
              )}
            </div>
          </Secao>

          <div className="border-t border-borda pt-3">
            <Interruptor
              rotulo="Produto ativo"
              descricao="Desligado, o produto some da tela de vender (o histórico fica guardado)."
              valor={form.ativo}
              aoMudar={(v) => setForm({ ...form, ativo: v })}
            />
          </div>
        </div>
      </Modal>

      <ModalPlanilha
        aberto={planilhaAberta}
        aoFechar={() => setPlanilhaAberta(false)}
        aoColarLista={() => {
          setPlanilhaAberta(false);
          setImportAberto(true);
        }}
        aoSistemaAntigo={() => {
          setPlanilhaAberta(false);
          setAntigoAberto(true);
        }}
      />

      <ModalImportar
        aberto={importAberto}
        aoFechar={() => setImportAberto(false)}
      />

      <ModalSistemaAntigo aberto={antigoAberto} aoFechar={() => setAntigoAberto(false)} />

      <Modal
        aberto={!!excluindoProduto}
        aoFechar={() => setExcluindoProduto(null)}
        titulo="Excluir Produto"
        rodape={
          <>
            <button
              className="btn-secundario"
              onClick={() => setExcluindoProduto(null)}
            >
              Cancelar
            </button>
            <button className="btn-perigo" onClick={confirmarExclusao}>
              Excluir
            </button>
          </>
        }
      >
        <p className="text-sm text-texto-suave">
          {excluindoProduto && `Tem certeza que deseja excluir "${excluindoProduto.nome}"? Vendas antigas não serão afetadas.`}
        </p>
      </Modal>

      <ModalCategorias
        aberto={categoriasAberto}
        aoFechar={() => setCategoriasAberto(false)}
      />
    </>
  );
}

/** Bloco do formulário com um título pequeno (Produto, Preço, Estoque…). */
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-black tracking-wider text-acento uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

function Interruptor({
  rotulo,
  descricao,
  valor,
  aoMudar,
}: {
  rotulo: string;
  descricao?: string;
  valor: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-2">
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 accent-[var(--acento)]"
        checked={valor}
        onChange={(e) => aoMudar(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{rotulo}</span>
        {descricao && (
          <span className="block text-xs text-texto-suave">{descricao}</span>
        )}
      </span>
    </label>
  );
}

/**
 * Importação em massa: o Luifer cola a lista de preços que ele já tem
 * (do site, do WhatsApp, da planilha) em vez de digitar produto por produto.
 */
function ModalImportar({
  aberto,
  aoFechar,
}: {
  aberto: boolean;
  aoFechar: () => void;
}) {
  const { salvarProduto, produtos } = useDados();
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState(CATEGORIAS_PADRAO[0]);
  const [salvando, setSalvando] = useState(false);

  const linhas = useMemo(() => interpretarLista(texto), [texto]);
  const nomesExistentes = useMemo(
    () => new Set(produtos.map((p) => normalizar(p.nome))),
    [produtos],
  );
  const categorias = useMemo(() => {
    const doBanco = produtos.map((p) => p.categoria).filter(Boolean);
    return Array.from(new Set([...CATEGORIAS_PADRAO, ...doBanco]));
  }, [produtos]);

  async function importar() {
    setSalvando(true);
    const agora = new Date().toISOString();
    for (const linha of linhas) {
      const jaExiste = produtos.find(
        (p) => normalizar(p.nome) === normalizar(linha.nome),
      );
      await salvarProduto({
        // Produto que já existe mantém o que a lista não traz (foto, Tabela
        // 2/3...) — antes o import regravava o produto e apagava esses campos.
        ...jaExiste,
        id: jaExiste?.id ?? novoId(),
        nome: linha.nome,
        categoria: jaExiste?.categoria ?? categoria,
        unPorCaixa: linha.unPorCaixa ?? jaExiste?.unPorCaixa ?? 1,
        precoUn: linha.preco,
        precoCusto: jaExiste?.precoCusto ?? 0,
        estoqueUn: jaExiste?.estoqueUn ?? 0,
        estoqueMinimo: jaExiste?.estoqueMinimo ?? 0,
        ativo: true,
        visivelCatalogo: jaExiste?.visivelCatalogo ?? true,
        criadoEm: jaExiste?.criadoEm ?? agora,
        atualizadoEm: agora,
      });
    }
    setSalvando(false);
    setTexto("");
    aoFechar();
  }

  const novos = linhas.filter((l) => !nomesExistentes.has(normalizar(l.nome)));
  const atualizados = linhas.length - novos.length;

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Importar lista de preços"
      largura="max-w-2xl"
      rodape={
        <>
          <button className="btn-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button
            className="btn-primario"
            onClick={importar}
            disabled={linhas.length === 0 || salvando}
          >
            {salvando
              ? "Importando…"
              : `Importar ${linhas.length} ${linhas.length === 1 ? "item" : "itens"}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="rotulo" htmlFor="colar">
            Cole a lista aqui
          </label>
          <textarea
            id="colar"
            className="campo min-h-44 font-mono text-sm"
            placeholder={
              "Um produto por linha. Exemplos que funcionam:\n\n" +
              "Corona LN 6,90\n" +
              "Coca-Cola LT - R$ 4,00\n" +
              "Red Bull; 8,00; 24\n" +
              "Vodka Absolut | 90 | 12"
            }
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <p className="mt-1.5 text-xs text-texto-suave">
            O último número da linha vira o preço. Se houver um terceiro campo,
            ele é lido como unidades por caixa.
          </p>
        </div>

        <div>
          <label className="rotulo" htmlFor="cat-import">
            Categoria dos produtos novos
          </label>
          <select
            id="cat-import"
            className="campo"
            value={categorias.includes(categoria) ? categoria : "__nova__"}
            onChange={(e) =>
              setCategoria(e.target.value === "__nova__" ? "" : e.target.value)
            }
          >
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="__nova__">+ Nova categoria…</option>
          </select>
          {!categorias.includes(categoria) && (
            <input
              className="campo mt-2"
              autoFocus
              placeholder="Nome da nova categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            />
          )}
        </div>

        {linhas.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">
              Prévia — {novos.length} novo(s)
              {atualizados > 0 && `, ${atualizados} atualizado(s)`}
            </p>
            <ul className="card max-h-60 divide-y divide-borda overflow-y-auto">
              {linhas.map((l, i) => {
                const existe = nomesExistentes.has(normalizar(l.nome));
                return (
                  <li
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{l.nome}</span>
                    {l.unPorCaixa && (
                      <span className="shrink-0 text-xs text-texto-suave">
                        {l.unPorCaixa} un/cx
                      </span>
                    )}
                    <span className="shrink-0 font-semibold tabular-nums">
                      {brl(l.preco)}
                    </span>
                    <span
                      className={`chip shrink-0 ${
                        existe
                          ? "bg-ouro-100 text-ouro-900 dark:bg-ouro-900/40 dark:text-ouro-200"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {existe ? "atualiza" : "novo"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

interface LinhaImportada {
  nome: string;
  preco: number;
  unPorCaixa?: number;
}

/**
 * Lê listas coladas de qualquer jeito. Tenta primeiro separadores explícitos
 * (`;`, `|`, tab), e cai pro "último número da linha é o preço" — que cobre
 * o formato solto de lista de WhatsApp.
 */
export function interpretarLista(texto: string): LinhaImportada[] {
  const saida: LinhaImportada[] = [];

  for (const bruta of (texto || "").split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;

    const partes = linha.split(/\s*[;|\t]\s*/).filter(Boolean);
    if (partes.length >= 2) {
      const nome = partes[0].trim();
      const preco = paraNumero(partes[1]);
      const un = partes[2] ? Math.round(paraNumero(partes[2])) : undefined;
      if (nome && preco > 0) {
        saida.push({ nome, preco, unPorCaixa: un && un > 0 ? un : undefined });
      }
      continue;
    }

    // Formato solto: "Corona LN R$ 6,90" ou "Corona LN - 6,90"
    const numeros = [...linha.matchAll(/(\d+(?:[.,]\d+)?)/g)];
    if (numeros.length === 0) continue;

    const ultimo = numeros[numeros.length - 1];
    const preco = paraNumero(ultimo[1]);
    if (preco <= 0) continue;

    const nome = linha
      .slice(0, ultimo.index)
      .replace(/(r\$|rs)\s*$/i, "")
      .replace(/[\s\-–—:.=]+$/, "")
      .trim();

    if (nome) saida.push({ nome, preco });
  }

  return saida;
}

function ModalCategorias({
  aberto,
  aoFechar,
}: {
  aberto: boolean;
  aoFechar: () => void;
}) {
  const { produtos, atualizarProduto } = useDados();
  const [salvando, setSalvando] = useState(false);

  const categorias = useMemo(() => {
    const doBanco = produtos.map((p) => p.categoria).filter(Boolean);
    return Array.from(new Set(doBanco)).sort((a, b) => compararCategorias(a, b));
  }, [produtos]);

  async function renomear(velha: string) {
    const nova = prompt(`Renomear a categoria "${velha}" para:`, velha);
    if (!nova || nova.trim() === velha) return;

    setSalvando(true);
    const afetados = produtos.filter((p) => p.categoria === velha);
    for (const p of afetados) {
      await atualizarProduto(p.id, { categoria: nova.trim() });
    }
    setSalvando(false);
  }

  async function excluir(categoriaParaExcluir: string) {
    if (!window.confirm(`Excluir a categoria "${categoriaParaExcluir}" de todos os produtos?`)) return;
    setSalvando(true);
    try {
      const produtosAfetados = produtos.filter(p => p.categoria === categoriaParaExcluir);
      for (const p of produtosAfetados) {
        await atualizarProduto(p.id, { categoria: "" });
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Gerenciar Categorias">
      <div className="space-y-4">
        {salvando && (
          <p className="text-sm text-acento animate-pulse font-bold">
            Atualizando produtos...
          </p>
        )}
        <ul className="card divide-y divide-borda">
          {categorias.map((c) => {
            const qtd = produtos.filter((p) => p.categoria === c).length;
            return (
              <li key={c} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-semibold">{c}</span>
                  <span className="ml-2 text-xs text-texto-suave">
                    ({qtd} {qtd === 1 ? "produto" : "produtos"})
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    className="grid h-8 w-8 place-items-center rounded-lg text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                    onClick={() => renomear(c)}
                    disabled={salvando}
                    title="Renomear"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className="grid h-8 w-8 place-items-center rounded-lg text-texto-suave transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    onClick={() => excluir(c)}
                    disabled={salvando}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-texto-suave text-center">
          Você pode criar novas categorias ao digitar um nome novo direto no cadastro de um produto.
        </p>
      </div>
    </Modal>
  );
}


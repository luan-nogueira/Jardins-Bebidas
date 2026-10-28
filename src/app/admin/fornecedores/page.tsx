"use client";

import { useMemo, useState } from "react";
import {
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
} from "lucide-react";
import { Cabecalho, Modal, Vazio } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { useDados, novoId } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { normalizar, telefoneBR } from "@/lib/format";
import type { Fornecedor } from "@/lib/types";

type Formulario = Omit<Fornecedor, "id" | "criadoEm">;

const FORM_VAZIO: Formulario = {
  nome: "",
  documento: "",
  telefone: "",
  email: "",
  obs: "",
  ativo: true,
};

export default function FornecedoresPage() {
  return (
    <Protegido chave="fornecedores">
      <FornecedoresPageInterno />
    </Protegido>
  );
}

function FornecedoresPageInterno() {
  const {
    fornecedores,
    movimentos,
    contasPagar,
    salvarFornecedor,
    removerFornecedor,
    carregando,
  } = useDados();
  const { permissoes } = useAuth();

  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<Fornecedor | null>(null);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return fornecedores;
    return fornecedores.filter(
      (f) =>
        normalizar(f.nome).includes(termo) ||
        (f.telefone || "").includes(busca.replace(/\D/g, "")),
    );
  }, [fornecedores, busca]);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setAberto(true);
  }

  function abrirEdicao(f: Fornecedor) {
    setEditando(f);
    setForm({
      nome: f.nome,
      documento: f.documento ?? "",
      telefone: f.telefone ?? "",
      email: f.email ?? "",
      obs: f.obs ?? "",
      ativo: f.ativo,
    });
    setAberto(true);
  }

  async function salvar() {
    if (salvando) return;
    const nome = form.nome.trim();
    if (!nome) return;
    setSalvando(true);
    try {
      await salvarFornecedor({
        ...form,
        nome,
        id: editando?.id ?? novoId(),
        criadoEm: editando?.criadoEm ?? new Date().toISOString(),
      });
      setAberto(false);
    } finally {
      setSalvando(false);
    }
  }

  function solicitarExclusao(f: Fornecedor) {
    setExcluindo(f);
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    await removerFornecedor(excluindo.id);
    setExcluindo(null);
  }

  return (
    <>
      <Cabecalho
        titulo="Fornecedores"
        subtitulo={
          carregando
            ? "Carregando…"
            : `${fornecedores.length} ${fornecedores.length === 1 ? "fornecedor" : "fornecedores"} cadastrados`
        }
        acao={
          <button className="btn-primario" onClick={abrirNovo}>
            <Plus className="h-4 w-4" />
            Novo
          </button>
        }
      />

      <div className="px-4 md:px-6">
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-texto-suave" />
          <input
            className="campo pl-9"
            placeholder="Buscar por nome ou telefone…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {!carregando && filtrados.length === 0 && (
        <Vazio
          Icone={Truck}
          titulo={busca ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor ainda"}
          descricao={
            busca
              ? "Tente outro termo."
              : "Cadastre quem vende pra loja (Ambev, distribuidoras…). Aparece na entrada de compra e nas contas a pagar."
          }
          acao={
            !busca ? (
              <button className="btn-primario" onClick={abrirNovo}>
                <Plus className="h-4 w-4" />
                Cadastrar fornecedor
              </button>
            ) : undefined
          }
        />
      )}

      <ul className="space-y-2 px-4 md:px-6">
        {filtrados.map((f) => {
          const compras = movimentos.filter(
            (m) => m.fornecedorId === f.id && m.origem === "COMPRA",
          ).length;
          const contasAbertas = contasPagar.filter(
            (c) => c.fornecedorId === f.id && !c.pago,
          ).length;

          return (
            <li key={f.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{f.nome}</p>
                    {!f.ativo && (
                      <span className="chip bg-superficie-2 text-texto-suave">
                        inativo
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-suave">
                    {f.telefone && <span>{telefoneBR(f.telefone)}</span>}
                    <span>
                      {compras} compra{compras === 1 ? "" : "s"} registrada
                      {compras === 1 ? "" : "s"}
                    </span>
                  </div>

                  {contasAbertas > 0 && (
                    <p className="mt-2 inline-flex rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-400">
                      {contasAbertas} conta{contasAbertas === 1 ? "" : "s"} a
                      pagar em aberto
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  {f.telefone && (
                    <a
                      href={`https://wa.me/55${f.telefone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid h-9 w-9 place-items-center rounded-lg text-texto-suave transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40"
                      aria-label={`Conversar com ${f.nome} no WhatsApp`}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    className="grid h-9 w-9 place-items-center rounded-lg text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                    onClick={() => abrirEdicao(f)}
                    aria-label={`Editar ${f.nome}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {permissoes.excluir && (
                    <button
                      className="grid h-9 w-9 place-items-center rounded-lg text-texto-suave transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      onClick={() => solicitarExclusao(f)}
                      aria-label={`Excluir ${f.nome}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={editando ? "Editar fornecedor" : "Novo fornecedor"}
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </button>
            <button
              className="btn-primario"
              onClick={salvar}
              disabled={salvando || !form.nome.trim()}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="rotulo" htmlFor="f-nome">
              Nome
            </label>
            <input
              id="f-nome"
              className="campo"
              autoFocus
              placeholder="Ex: Distribuidora Águas Claras"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="rotulo" htmlFor="f-doc">
                CNPJ / CPF
              </label>
              <input
                id="f-doc"
                className="campo"
                inputMode="numeric"
                value={form.documento}
                onChange={(e) =>
                  setForm({ ...form, documento: e.target.value })
                }
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="f-tel">
                Telefone / WhatsApp
              </label>
              <input
                id="f-tel"
                className="campo"
                inputMode="tel"
                placeholder="(22) 99999-0000"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="rotulo" htmlFor="f-email">
              E-mail
            </label>
            <input
              id="f-email"
              className="campo"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div>
            <label className="rotulo" htmlFor="f-obs">
              Observações
            </label>
            <textarea
              id="f-obs"
              className="campo min-h-20"
              placeholder="Prazo de entrega, condições de pagamento…"
              value={form.obs}
              onChange={(e) => setForm({ ...form, obs: e.target.value })}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 border-t border-borda pt-3">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--acento)]"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            <span className="text-sm font-semibold">Fornecedor ativo</span>
          </label>
        </div>
      </Modal>

      <Modal
        aberto={!!excluindo}
        aoFechar={() => setExcluindo(null)}
        titulo="Excluir fornecedor"
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
          {excluindo &&
            `Tem certeza que deseja excluir o fornecedor "${excluindo.nome}"?`}
        </p>
      </Modal>
    </>
  );
}

"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCog,
} from "lucide-react";
import { Cabecalho, Modal, Vazio } from "@/components/ui";
import { SomenteAdmin } from "@/components/Protegido";
import { useDados, novoId } from "@/lib/store";
import { criarLoginFuncionario } from "@/lib/firebase";
import { mensagemDeErro } from "@/lib/auth";
import { PERMISSOES_GARCOM, PERMISSOES_PADRAO_FUNCIONARIO } from "@/lib/types";
import type { PapelUsuario, Permissoes, Usuario } from "@/lib/types";

const ROTULO_PERMISSAO: Record<keyof Permissoes, string> = {
  vendas: "Vender (balcão)",
  comandas: "Comandas",
  relatorios: "Relatórios de vendas",
  produtos: "Produtos",
  clientes: "Clientes",
  financeiro: "Financeiro",
  estoque: "Estoque",
  fornecedores: "Fornecedores",
  cozinha: "Tela da cozinha",
  verCusto: "Ver custo/margem/lucro",
  excluir: "Excluir cadastros / cancelar vendas",
};

const CHAVES_PERMISSAO = Object.keys(ROTULO_PERMISSAO) as (keyof Permissoes)[];

type Formulario = {
  nome: string;
  email: string;
  senha: string;
  papel: PapelUsuario;
  permissoes: Permissoes;
};

function formVazio(): Formulario {
  return {
    nome: "",
    email: "",
    senha: "",
    papel: "funcionario",
    permissoes: { ...PERMISSOES_PADRAO_FUNCIONARIO },
  };
}

export default function EquipePage() {
  return (
    <SomenteAdmin>
      <EquipePageInterno />
    </SomenteAdmin>
  );
}

function EquipePageInterno() {
  const { usuarios, salvarUsuario, carregando } = useDados();

  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [form, setForm] = useState<Formulario>(formVazio());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [desativando, setDesativando] = useState<Usuario | null>(null);

  function abrirNovo() {
    setEditando(null);
    setForm(formVazio());
    setErro("");
    setAberto(true);
  }

  function abrirEdicao(u: Usuario) {
    setEditando(u);
    setForm({ nome: u.nome, email: u.email, senha: "", papel: u.papel, permissoes: { ...u.permissoes } });
    setErro("");
    setAberto(true);
  }

  /** Garçom tem permissões fixas: só mesas. */
  function mudarPapel(papel: PapelUsuario) {
    setForm((f) => ({
      ...f,
      papel,
      permissoes: { ...(papel === "garcom" ? PERMISSOES_GARCOM : PERMISSOES_PADRAO_FUNCIONARIO) },
    }));
  }

  function alternarPermissao(chave: keyof Permissoes) {
    setForm((f) => ({
      ...f,
      permissoes: { ...f.permissoes, [chave]: !f.permissoes[chave] },
    }));
  }

  async function salvar() {
    const nome = form.nome.trim();
    const email = form.email.trim();
    if (!nome) return;

    setErro("");
    setSalvando(true);
    try {
      if (editando) {
        await salvarUsuario({ ...editando, nome, papel: form.papel, permissoes: form.permissoes });
      } else {
        if (!email || form.senha.length < 6) {
          setErro("Preencha e-mail e uma senha com pelo menos 6 caracteres.");
          setSalvando(false);
          return;
        }
        const uid = await criarLoginFuncionario(email, form.senha);
        const agora = new Date().toISOString();
        await salvarUsuario({
          id: uid,
          email,
          nome,
          papel: form.papel,
          permissoes: form.permissoes,
          ativo: true,
          criadoEm: agora,
        });
      }
      setAberto(false);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarDesativar() {
    if (!desativando) return;
    await salvarUsuario({ ...desativando, ativo: !desativando.ativo });
    setDesativando(null);
  }

  return (
    <>
      <Cabecalho
        titulo="Equipe"
        subtitulo={
          carregando
            ? "Carregando…"
            : `${usuarios.length} conta(s) de acesso além da sua`
        }
        acao={
          <button className="btn-primario" onClick={abrirNovo}>
            <Plus className="h-4 w-4" />
            Novo funcionário
          </button>
        }
      />

      <div className="px-4 md:px-6">
        <div className="mb-4 rounded-xl border border-borda bg-superficie-2 px-4 py-3 text-sm text-texto-suave">
          Você (dono da conta) sempre tem acesso total a tudo. As permissões
          abaixo valem só pra logins de funcionário que você criar aqui.
        </div>

        {!carregando && usuarios.length === 0 && (
          <Vazio
            Icone={UserCog}
            titulo="Nenhum funcionário cadastrado"
            descricao="Crie um login pra sua equipe e escolha o que cada um pode ver."
            acao={
              <button className="btn-primario" onClick={abrirNovo}>
                <Plus className="h-4 w-4" />
                Novo funcionário
              </button>
            }
          />
        )}

        <ul className="space-y-2">
          {usuarios.map((u) => (
            <li key={u.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{u.nome}</p>
                    {u.papel === "garcom" && (
                      <span className="chip bg-acento/15 text-acento">Garçom — só o app de mesas</span>
                    )}
                    {u.ativo === false && (
                      <span className="chip bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                        acesso desativado
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-texto-suave">{u.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {u.papel !== "garcom" && CHAVES_PERMISSAO.filter((c) => u.permissoes[c]).map((c) => (
                      <span
                        key={c}
                        className="chip bg-superficie-2 text-texto-suave"
                      >
                        {ROTULO_PERMISSAO[c]}
                      </span>
                    ))}
                    {CHAVES_PERMISSAO.every((c) => !u.permissoes[c]) && (
                      <span className="text-xs text-texto-suave">
                        nenhuma permissão marcada
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    className="grid h-9 w-9 place-items-center rounded-lg text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                    onClick={() => abrirEdicao(u)}
                    aria-label={`Editar permissões de ${u.nome}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    className={`grid h-9 w-9 place-items-center rounded-lg transition ${
                      u.ativo === false
                        ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        : "text-texto-suave hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    }`}
                    onClick={() => setDesativando(u)}
                    aria-label={u.ativo === false ? `Reativar ${u.nome}` : `Desativar ${u.nome}`}
                  >
                    {u.ativo === false ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : (
                      <ShieldOff className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Modal
        aberto={aberto}
        aoFechar={() => !salvando && setAberto(false)}
        titulo={editando ? "Editar permissões" : "Novo funcionário"}
        largura="max-w-lg"
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
          {erro && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {erro}
            </p>
          )}

          <div>
            <label className="rotulo" htmlFor="eq-nome">
              Nome
            </label>
            <input
              id="eq-nome"
              className="campo"
              autoFocus
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>

          {!editando && (
            <>
              <div>
                <label className="rotulo" htmlFor="eq-email">
                  E-mail de login
                </label>
                <input
                  id="eq-email"
                  type="email"
                  className="campo"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="rotulo" htmlFor="eq-senha">
                  Senha
                </label>
                <input
                  id="eq-senha"
                  type="text"
                  className="campo"
                  placeholder="mínimo 6 caracteres"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                />
                <p className="mt-1 text-xs text-texto-suave">
                  Combine essa senha com seu funcionário — ele pode trocar
                  depois em &quot;esqueci minha senha&quot; na tela de login.
                </p>
              </div>
            </>
          )}

          {form.papel !== "admin" && (
            <div className="border-t border-borda pt-3">
              <p className="rotulo mb-2">Tipo de acesso</p>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-superficie-2 p-1">
                {(
                  [
                    ["funcionario", "Funcionário"],
                    ["garcom", "Garçom"],
                  ] as [PapelUsuario, string][]
                ).map(([papel, rotulo]) => (
                  <button
                    key={papel}
                    type="button"
                    onClick={() => mudarPapel(papel)}
                    className={`rounded-lg py-2 text-sm font-bold transition ${
                      form.papel === papel ? "bg-superficie shadow-sm" : "text-texto-suave"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              {form.papel === "garcom" && (
                <p className="mt-2 text-xs text-texto-suave">
                  Entra só no app do garçom (<strong>/garcom</strong>): abre mesas, lança pedidos pra
                  cozinha e fecha a conta. Não vê mais nada do sistema.
                </p>
              )}
            </div>
          )}

          <div className={`border-t border-borda pt-3 ${form.papel === "garcom" ? "hidden" : ""}`}>
            <p className="rotulo mb-2">O que ele pode ver/mexer</p>
            <div className="space-y-1">
              {CHAVES_PERMISSAO.map((chave) => (
                <button
                  key={chave}
                  type="button"
                  onClick={() => alternarPermissao(chave)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-superficie-2"
                >
                  {form.permissoes[chave] ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-acento" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-texto-suave" />
                  )}
                  <span className="text-sm font-semibold">
                    {ROTULO_PERMISSAO[chave]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        aberto={!!desativando}
        aoFechar={() => setDesativando(null)}
        titulo={desativando?.ativo === false ? "Reativar acesso" : "Desativar acesso"}
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setDesativando(null)}>
              Cancelar
            </button>
            <button
              className={desativando?.ativo === false ? "btn-primario" : "btn-perigo"}
              onClick={confirmarDesativar}
            >
              {desativando?.ativo === false ? "Reativar" : "Desativar"}
            </button>
          </>
        }
      >
        <p className="text-sm text-texto-suave">
          {desativando?.ativo === false
            ? `"${desativando?.nome}" volta a acessar o sistema com as permissões marcadas.`
            : `"${desativando?.nome}" continua com o login, mas deixa de conseguir ver qualquer coisa no sistema até você reativar.`}
        </p>
      </Modal>
    </>
  );
}

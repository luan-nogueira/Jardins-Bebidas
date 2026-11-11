"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Clock,
  KeyRound,
  Pencil,
  RefreshCw,
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
import { mensagemDeErro, useAuth } from "@/lib/auth";
import { updateProfile } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { PERMISSOES_GARCOM, PERMISSOES_PADRAO_FUNCIONARIO, acessoExpirado } from "@/lib/types";
import { dataHoraBR, horaBR } from "@/lib/format";
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
  freelancer: boolean;
  horas: number;
};

const OPCOES_HORAS = [4, 6, 8, 12];
const HORA = 3_600_000;

/** "23:40" ou "11/11 02:10" quando não é hoje. */
function ateQuando(ms: number) {
  const fim = new Date(ms);
  const mesmoDia = fim.toDateString() === new Date().toDateString();
  const dia = mesmoDia ? "" : fim.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " ";
  return dia + horaBR(fim.toISOString());
}

function formVazio(): Formulario {
  return {
    nome: "",
    email: "",
    senha: "",
    papel: "funcionario",
    permissoes: { ...PERMISSOES_PADRAO_FUNCIONARIO },
    freelancer: false,
    horas: 4,
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
  // Atualiza o "faltam X min" e o vencimento dos freelancers na lista.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  function abrirNovo() {
    setEditando(null);
    setForm(formVazio());
    setErro("");
    setAberto(true);
  }

  function abrirEdicao(u: Usuario) {
    setEditando(u);
    setForm({
      nome: u.nome,
      email: u.email,
      senha: "",
      papel: u.papel,
      permissoes: { ...u.permissoes },
      freelancer: !!u.freelancer,
      horas: u.horasAcesso ?? 4,
    });
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
      // Freelancer: o relógio começa a contar quando salva.
      const tempo: Partial<Usuario> = form.freelancer
        ? { freelancer: true, horasAcesso: form.horas, acessoAte: Date.now() + form.horas * HORA }
        : { freelancer: false };
      if (editando) {
        // Só editar nome/permissões não reinicia o relógio de quem já é freelancer.
        const mudouTempo = form.freelancer !== !!editando.freelancer || form.horas !== (editando.horasAcesso ?? 4);
        await salvarUsuario({
          ...editando,
          nome,
          papel: form.papel,
          permissoes: form.permissoes,
          ...(mudouTempo ? tempo : {}),
        });
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
          ...tempo,
        });
      }
      setAberto(false);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  async function liberar(u: Usuario) {
    await salvarUsuario({ ...u, acessoAte: Date.now() + (u.horasAcesso ?? 4) * HORA });
  }

  async function encerrar(u: Usuario) {
    await salvarUsuario({ ...u, acessoAte: Date.now() - 1000 });
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
        <SeuNome />

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
                    {u.freelancer &&
                      (acessoExpirado(u, agora) ? (
                        <span className="chip bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                          <Clock className="h-3 w-3" />
                          Freelancer — acesso encerrado
                        </span>
                      ) : (
                        <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <Clock className="h-3 w-3" />
                          Freelancer — liberado até {ateQuando(u.acessoAte ?? 0)}
                        </span>
                      ))}
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
                  {u.freelancer && u.ativo !== false && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {acessoExpirado(u, agora) ? (
                        <button className="btn-primario px-3 py-1.5 text-xs" onClick={() => liberar(u)}>
                          <Clock className="h-3.5 w-3.5" />
                          Liberar por {u.horasAcesso ?? 4}h
                        </button>
                      ) : (
                        <>
                          <span className="text-xs text-texto-suave">
                            faltam {Math.max(1, Math.ceil(((u.acessoAte ?? 0) - agora) / 60_000))} min
                          </span>
                          <button className="btn-secundario px-3 py-1.5 text-xs" onClick={() => liberar(u)}>
                            Recomeçar {u.horasAcesso ?? 4}h
                          </button>
                          <button
                            className="btn-fantasma px-3 py-1.5 text-xs text-red-600 dark:text-red-400"
                            onClick={() => encerrar(u)}
                          >
                            Encerrar agora
                          </button>
                        </>
                      )}
                    </div>
                  )}
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

        <ContasFirebase
          usuarios={usuarios}
          aoConfigurar={(c) =>
            abrirEdicao({
              id: c.uid,
              email: c.email,
              nome: c.nome || c.email.split("@")[0],
              papel: "funcionario",
              permissoes: { ...PERMISSOES_PADRAO_FUNCIONARIO },
              ativo: true,
              criadoEm: c.criadoEm ?? new Date().toISOString(),
            })
          }
        />
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

          {form.papel !== "admin" && (
            <div className="border-t border-borda pt-3">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, freelancer: !f.freelancer }))}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-superficie-2"
              >
                {form.freelancer ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-acento" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-texto-suave" />
                )}
                <span>
                  <span className="block text-sm font-bold">Freelancer (acesso por tempo)</span>
                  <span className="block text-xs text-texto-suave">
                    O login funciona só pelas horas escolhidas. Depois é bloqueado sozinho.
                  </span>
                </span>
              </button>
              {form.freelancer && (
                <div className="mt-2 pl-10">
                  <p className="mb-1.5 text-xs font-bold text-texto-suave">Acesso por</p>
                  <div className="flex flex-wrap gap-1.5">
                    {OPCOES_HORAS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, horas: h }))}
                        className={`rounded-lg px-3 py-1.5 text-sm font-bold ${
                          form.horas === h ? "bg-acento text-acento-texto" : "border border-borda text-texto-suave"
                        }`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-texto-suave">
                    Conta a partir de quando você salvar: fica liberado até{" "}
                    <strong className="text-texto">{ateQuando(agora + form.horas * HORA)}</strong>. Pra outro dia de
                    trabalho, é só tocar em &quot;Liberar&quot; na lista da equipe.
                  </p>
                </div>
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

/**
 * A conta dona do sistema não tem cadastro na Equipe — sem isso, o cupom e a
 * cozinha mostrariam o e-mail. O nome fica no próprio login (Firebase Auth).
 */
function SeuNome() {
  const { usuario, perfil, exigeLogin } = useAuth();
  const [nome, setNome] = useState(usuario?.displayName ?? "");
  const [salvando, setSalvando] = useState(false);
  if (!exigeLogin || !usuario || perfil) return null;

  async function salvar() {
    const atual = getFirebaseAuth().currentUser;
    if (!atual || !nome.trim()) return;
    setSalvando(true);
    try {
      await updateProfile(atual, { displayName: nome.trim() });
      // Recarrega pra todas as telas pegarem o nome novo.
      window.location.reload();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="card mb-4 p-4">
      <label className="rotulo" htmlFor="seu-nome">
        Seu nome (aparece no cupom e na cozinha como garçom)
      </label>
      <div className="flex gap-2">
        <input
          id="seu-nome"
          className="campo"
          placeholder="Ex.: Luan"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <button
          className="btn-primario shrink-0"
          disabled={salvando || !nome.trim() || nome.trim() === usuario.displayName}
          onClick={salvar}
        >
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
      {!usuario.displayName && (
        <p className="mt-1 text-xs text-texto-suave">
          Hoje aparece &quot;{usuario.email?.split("@")[0]}&quot;. Coloque seu nome pra sair certinho.
        </p>
      )}
    </div>
  );
}

interface ContaFirebase {
  uid: string;
  email: string;
  nome: string;
  criadoEm: string | null;
  ultimoAcesso: string | null;
  desativada: boolean;
}

/**
 * Todas as contas de login do Firebase (Authentication). Conta sem cadastro
 * em Equipe tem acesso TOTAL pelas regras (é tratada como dono), por isso
 * aparece destacada com o botão pra configurar.
 */
function ContasFirebase({
  usuarios,
  aoConfigurar,
}: {
  usuarios: Usuario[];
  aoConfigurar: (c: ContaFirebase) => void;
}) {
  const { usuario, exigeLogin } = useAuth();
  const [estado, setEstado] = useState<"carregando" | "ok" | "sem-chave" | "erro">("carregando");
  const [contas, setContas] = useState<ContaFirebase[]>([]);
  const [voce, setVoce] = useState("");

  async function carregar() {
    const atual = exigeLogin ? getFirebaseAuth().currentUser : null;
    if (!atual) return;
    setEstado("carregando");
    try {
      const r = await fetch("/api/equipe/contas", {
        headers: { authorization: `Bearer ${await atual.getIdToken()}` },
        cache: "no-store",
      });
      const dados = await r.json().catch(() => ({}));
      if (r.status === 501) return setEstado("sem-chave");
      if (!r.ok) return setEstado("erro");
      setContas(dados.contas ?? []);
      setVoce(dados.voce ?? "");
      setEstado("ok");
    } catch {
      setEstado("erro");
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.uid]);

  // Modo demonstração não tem Firebase.
  if (!exigeLogin || !usuario) return null;

  const porId = new Map(usuarios.map((u) => [u.id, u]));
  const ordenadas = [...contas].sort((a, b) => (b.ultimoAcesso ?? "").localeCompare(a.ultimoAcesso ?? ""));
  const semCadastro = contas.filter((c) => c.uid !== voce && !porId.has(c.uid)).length;

  return (
    <section className="card mt-6 mb-6 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-borda px-4 py-3">
        <KeyRound className="h-4 w-4 text-acento" />
        <h2 className="flex-1 font-bold">
          Todas as contas no Firebase{estado === "ok" ? ` (${contas.length})` : ""}
        </h2>
        <button className="btn-secundario px-2.5 py-1.5" onClick={carregar} aria-label="Atualizar lista">
          <RefreshCw className={`h-4 w-4 ${estado === "carregando" ? "animate-spin" : ""}`} />
        </button>
      </div>

      {estado === "carregando" && <p className="px-4 py-6 text-center text-sm text-texto-suave">Carregando…</p>}
      {estado === "erro" && (
        <p className="px-4 py-6 text-center text-sm text-red-600">Não consegui buscar as contas. Tenta atualizar.</p>
      )}
      {estado === "sem-chave" && (
        <div className="space-y-2 px-4 py-4 text-sm">
          <p className="font-semibold">Falta uma configuração pra listar as contas do Firebase aqui:</p>
          <ol className="list-decimal space-y-1 pl-5 text-texto-suave">
            <li>
              Firebase → ⚙️ Configurações do projeto → <strong>Contas de serviço</strong> →{" "}
              <strong>Gerar nova chave privada</strong> (baixa um arquivo .json).
            </li>
            <li>
              Vercel → projeto → Settings → <strong>Environment Variables</strong> → nova variável{" "}
              <code className="rounded bg-superficie-2 px-1">FIREBASE_SERVICE_ACCOUNT</code> e cole o conteúdo
              inteiro do arquivo.
            </li>
            <li>Vercel → Deployments → Redeploy. Depois apague o arquivo baixado do computador.</li>
          </ol>
        </div>
      )}

      {estado === "ok" && (
        <>
          {semCadastro > 0 && (
            <p className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {semCadastro} conta(s) sem cadastro em Equipe — elas entram com <strong>acesso total</strong>. Toque em
              &quot;Configurar&quot; pra definir o que podem ver (ou desative).
            </p>
          )}
          <ul className="divide-y divide-borda">
            {ordenadas.map((c) => {
              const u = porId.get(c.uid);
              const ehVoce = c.uid === voce;
              return (
                <li key={c.uid} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {u?.nome || c.nome || c.email.split("@")[0] || "Sem nome"}
                    </p>
                    <p className="truncate text-xs text-texto-suave">{c.email || c.uid}</p>
                    <p className="text-xs text-texto-suave">
                      {c.ultimoAcesso ? `Último acesso ${dataHoraBR(c.ultimoAcesso)}` : "Nunca entrou"}
                      {c.criadoEm ? ` · criada ${dataHoraBR(c.criadoEm)}` : ""}
                    </p>
                  </div>
                  {ehVoce ? (
                    <span className="chip bg-acento/15 text-acento">Você</span>
                  ) : c.desativada ? (
                    <span className="chip bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">Bloqueada</span>
                  ) : u ? (
                    <span
                      className={`chip ${
                        u.ativo === false
                          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      }`}
                    >
                      {u.ativo === false ? "Desativado" : u.papel === "garcom" ? "Garçom" : u.papel === "admin" ? "Admin" : "Na equipe"}
                    </span>
                  ) : (
                    <button className="btn-primario shrink-0 px-3 py-1.5 text-xs" onClick={() => aoConfigurar(c)}>
                      Configurar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

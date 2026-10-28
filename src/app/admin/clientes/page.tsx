"use client";

import { useMemo, useState } from "react";
import {
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { Cabecalho, Modal, Vazio } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { useDados, novoId } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { brl, normalizar, telefoneBR } from "@/lib/format";
import type { Cliente, Venda } from "@/lib/types";
import { ChipStatusVenda, DetalheVenda } from "@/components/DetalheVenda";
import { numeroVenda, saldoVenda, totalVenda, vendaConta } from "@/lib/vendas";
import { dataHoraBR } from "@/lib/format";

type Formulario = Omit<Cliente, "id" | "criadoEm">;

const FORM_VAZIO: Formulario = {
  nome: "",
  tipo: "PF",
  documento: "",
  telefone: "",
  email: "",
  endereco: "",
  cidade: "",
  obs: "",
  ativo: true,
};

export default function ClientesPage() {
  return (
    <Protegido chave="clientes">
      <ClientesPageInterno />
    </Protegido>
  );
}

function ClientesPageInterno() {
  const {
    clientes,
    vendas,
    salvarCliente,
    removerCliente,
    salvarVenda,
    pendenciaDoCliente,
    carregando,
  } = useDados();
  const { permissoes } = useAuth();

  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Juntar cadastros duplicados: o cliente sendo editado some e tudo dele
  // passa pro escolhido aqui.
  const [juntarComId, setJuntarComId] = useState("");
  const [confirmandoJuntar, setConfirmandoJuntar] = useState(false);
  // Juntar mexe nas vendas e apaga um cadastro.
  const podeJuntar = permissoes.excluir;
  const [historicoDe, setHistoricoDe] = useState<Cliente | null>(null);
  const [vendo, setVendo] = useState<Venda | null>(null);
  const [excluindoCliente, setExcluindoCliente] = useState<Cliente | null>(null);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    if (!termo) return clientes;
    return clientes.filter(
      (c) =>
        normalizar(c.nome).includes(termo) ||
        normalizar(c.cidade || "").includes(termo) ||
        (c.telefone || "").includes(busca.replace(/\D/g, "")),
    );
  }, [clientes, busca]);

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setAberto(true);
  }

  function abrirEdicao(c: Cliente) {
    setEditando(c);
    setForm({
      nome: c.nome,
      tipo: c.tipo,
      documento: c.documento ?? "",
      telefone: c.telefone ?? "",
      email: c.email ?? "",
      endereco: c.endereco ?? "",
      cidade: c.cidade ?? "",
      obs: c.obs ?? "",
      ativo: c.ativo,
    });
    setAberto(true);
  }

  /**
   * A venda guarda uma cópia do nome do cliente. Sem isso, renomear o
   * cliente deixava as comandas antigas com o nome antigo.
   */
  async function sincronizarNomeNasVendas(clienteId: string, nome: string) {
    for (const v of vendas) {
      if (v.clienteId === clienteId && v.clienteNome !== nome) {
        await salvarVenda({ ...v, clienteNome: nome });
      }
    }
  }

  async function salvar(ignorarRepetido = false) {
    if (salvando) return;
    const nome = form.nome.trim();
    if (!nome) return;

    // Renomeou pra um nome que já existe? Provavelmente é o mesmo cliente
    // cadastrado duas vezes — oferece juntar em vez de criar outro igual.
    const repetido = clientes.find(
      (c) => c.id !== editando?.id && normalizar(c.nome) === normalizar(nome),
    );
    if (repetido && editando && podeJuntar && !ignorarRepetido) {
      setJuntarComId(repetido.id);
      setConfirmandoJuntar(true);
      return;
    }

    setSalvando(true);
    try {
      const id = editando?.id ?? novoId();
      await salvarCliente({
        ...form,
        nome,
        id,
        criadoEm: editando?.criadoEm ?? new Date().toISOString(),
      });
      if (editando) await sincronizarNomeNasVendas(id, nome);
      setAberto(false);
    } finally {
      setSalvando(false);
    }
  }

  /** Passa as vendas do cliente editado pro escolhido e apaga o editado. */
  async function juntar() {
    const origem = editando;
    const destino = clientes.find((c) => c.id === juntarComId);
    if (!origem || !destino || origem.id === destino.id) return;
    setSalvando(true);
    try {
      // Aproveita dados que só o cadastro apagado tinha.
      await salvarCliente({
        ...destino,
        documento: destino.documento || form.documento || undefined,
        telefone: destino.telefone || form.telefone || undefined,
        email: destino.email || form.email || undefined,
        endereco: destino.endereco || form.endereco || undefined,
        cidade: destino.cidade || form.cidade || undefined,
        obs: [destino.obs, form.obs].filter(Boolean).join(" · ") || undefined,
      });
      for (const v of vendas) {
        if (v.clienteId === origem.id || (v.clienteId === destino.id && v.clienteNome !== destino.nome)) {
          await salvarVenda({ ...v, clienteId: destino.id, clienteNome: destino.nome });
        }
      }
      await removerCliente(origem.id);
      setConfirmandoJuntar(false);
      setJuntarComId("");
      setAberto(false);
    } finally {
      setSalvando(false);
    }
  }

  function solicitarExclusao(c: Cliente) {
    setExcluindoCliente(c);
  }

  async function confirmarExclusao() {
    if (!excluindoCliente) return;
    await removerCliente(excluindoCliente.id);
    setExcluindoCliente(null);
  }

  return (
    <>
      <Cabecalho
        titulo="Clientes"
        subtitulo={
          carregando
            ? "Carregando…"
            : `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"} cadastrados`
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
            placeholder="Buscar por nome, cidade ou telefone…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {!carregando && filtrados.length === 0 && (
        <Vazio
          Icone={Users}
          titulo={busca ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
          descricao={
            busca
              ? "Tente outro termo."
              : "Cadastre o primeiro cliente — a comanda (venda a prazo) precisa de um cliente."
          }
          acao={
            !busca ? (
              <button className="btn-primario" onClick={abrirNovo}>
                <Plus className="h-4 w-4" />
                Cadastrar cliente
              </button>
            ) : undefined
          }
        />
      )}

      <ul className="space-y-2 px-4 md:px-6">
        {filtrados.map((c) => {
          const devendo = pendenciaDoCliente(c.id);
          const doCliente = vendas.filter((v) => v.clienteId === c.id && vendaConta(v));
          const totalPedidos = doCliente.length;
          const totalComprado = doCliente.reduce((s, v) => s + totalVenda(v), 0);

          return (
            <li key={c.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{c.nome}</p>
                    {!c.ativo && (
                      <span className="chip bg-superficie-2 text-texto-suave">
                        inativo
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-suave">
                    {c.cidade && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {c.cidade}
                      </span>
                    )}
                    {c.telefone && <span>{telefoneBR(c.telefone)}</span>}
                    <span>
                      {totalPedidos} compra{totalPedidos === 1 ? "" : "s"}
                      {totalComprado > 0 && ` · ${brl(totalComprado)}`}
                    </span>
                  </div>

                  {devendo > 0.005 && (
                    <p className="mt-2 inline-flex rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-700 dark:bg-red-950/40 dark:text-red-400">
                      Em aberto: {brl(devendo)}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-1">
                  {c.telefone && (
                    <a
                      href={`https://wa.me/55${c.telefone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid h-9 w-9 place-items-center rounded-lg text-texto-suave transition hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40"
                      aria-label={`Conversar com ${c.nome} no WhatsApp`}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  )}
                  <button
                    className="grid h-9 w-9 place-items-center rounded-lg text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                    onClick={() => abrirEdicao(c)}
                    aria-label={`Editar ${c.nome}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {permissoes.excluir && (
                    <button
                        className="grid h-9 w-9 place-items-center rounded-lg text-texto-suave transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        onClick={() => solicitarExclusao(c)}
                        aria-label={`Excluir ${c.nome}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {vendas.some((v) => v.clienteId === c.id) && (
                <button
                  type="button"
                  onClick={() => setHistoricoDe(c)}
                  className="mt-3 inline-block text-xs font-semibold text-acento underline-offset-4 hover:underline"
                >
                  Ver compras e comandas →
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <Modal
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={editando ? "Editar cliente" : "Novo cliente"}
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setAberto(false)} disabled={salvando}>
              Cancelar
            </button>
            <button
              className="btn-primario"
              onClick={() => salvar()}
              disabled={salvando || !form.nome.trim()}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="rotulo" htmlFor="c-nome">
              Nome
            </label>
            <input
              id="c-nome"
              className="campo"
              autoFocus
              placeholder="Ex: Bar do Zé"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="rotulo" htmlFor="c-tipo">
                Tipo
              </label>
              <select
                id="c-tipo"
                className="campo"
                value={form.tipo}
                onChange={(e) =>
                  setForm({ ...form, tipo: e.target.value as "PF" | "PJ" })
                }
              >
                <option value="PF">Pessoa</option>
                <option value="PJ">Empresa</option>
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="c-doc">
                {form.tipo === "PJ" ? "CNPJ (opcional)" : "CPF (opcional)"}
              </label>
              <input
                id="c-doc"
                className="campo"
                inputMode="numeric"
                value={form.documento}
                onChange={(e) =>
                  setForm({ ...form, documento: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="rotulo" htmlFor="c-tel">
                Telefone / WhatsApp
              </label>
              <input
                id="c-tel"
                className="campo"
                inputMode="tel"
                placeholder="(22) 99999-0000"
                value={form.telefone}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="c-cidade">
                Cidade
              </label>
              <input
                id="c-cidade"
                className="campo"
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="rotulo" htmlFor="c-end">
              Endereço
            </label>
            <input
              id="c-end"
              className="campo"
              value={form.endereco}
              onChange={(e) => setForm({ ...form, endereco: e.target.value })}
            />
          </div>

          <div>
            <label className="rotulo" htmlFor="c-email">
              E-mail
            </label>
            <input
              id="c-email"
              className="campo"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div>
            <label className="rotulo" htmlFor="c-obs">
              Observações
            </label>
            <textarea
              id="c-obs"
              className="campo min-h-20"
              placeholder="Combinados, prazo de pagamento, contato no local…"
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
            <span className="text-sm font-semibold">Cliente ativo</span>
          </label>

          {editando && podeJuntar && clientes.length > 1 && (
            <div className="border-t border-borda pt-3">
              <label className="rotulo" htmlFor="c-juntar">
                Cadastro repetido? Juntar com
              </label>
              <div className="flex gap-2">
                <select
                  id="c-juntar"
                  className="campo min-w-0 flex-1"
                  value={juntarComId}
                  onChange={(e) => setJuntarComId(e.target.value)}
                >
                  <option value="">Escolha o outro cadastro…</option>
                  {clientes
                    .filter((c) => c.id !== editando.id)
                    .map((c) => {
                      const n = vendas.filter((v) => v.clienteId === c.id).length;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.nome} ({n} {n === 1 ? "venda" : "vendas"})
                        </option>
                      );
                    })}
                </select>
                <button
                  type="button"
                  className="btn-secundario shrink-0"
                  disabled={!juntarComId || salvando}
                  onClick={() => setConfirmandoJuntar(true)}
                >
                  Juntar
                </button>
              </div>
              <p className="mt-1 text-xs text-texto-suave">
                As vendas e comandas deste cliente passam pro cadastro escolhido, e
                este aqui é apagado.
              </p>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        aberto={confirmandoJuntar && !!editando}
        aoFechar={() => !salvando && setConfirmandoJuntar(false)}
        titulo="Juntar cadastros"
        rodape={
          <>
            <button
              className="btn-secundario"
              onClick={() => setConfirmandoJuntar(false)}
              disabled={salvando}
            >
              Cancelar
            </button>
            {normalizar(form.nome) ===
              normalizar(clientes.find((c) => c.id === juntarComId)?.nome ?? "") && (
              <button
                className="btn-secundario"
                disabled={salvando}
                onClick={() => {
                  setConfirmandoJuntar(false);
                  salvar(true);
                }}
              >
                Manter separados
              </button>
            )}
            <button className="btn-primario" onClick={juntar} disabled={salvando}>
              {salvando ? "Juntando…" : "Juntar"}
            </button>
          </>
        }
      >
        {editando && (() => {
          const destino = clientes.find((c) => c.id === juntarComId);
          const nPedidos = vendas.filter((v) => v.clienteId === editando.id).length;
          return (
            <div className="space-y-2 text-sm text-texto-suave">
              <p>
                Já existe o cadastro <strong className="text-texto">{destino?.nome}</strong>.
                Juntar com <strong className="text-texto">{editando.nome}</strong>?
              </p>
              <p>
                {nPedidos} {nPedidos === 1 ? "venda" : "vendas"} de{" "}
                <strong className="text-texto">{editando.nome}</strong> passam pra{" "}
                <strong className="text-texto">{destino?.nome}</strong>, e o cadastro{" "}
                <strong className="text-texto">{editando.nome}</strong> é apagado. Não dá
                pra desfazer.
              </p>
            </div>
          );
        })()}
      </Modal>

      <Modal
        aberto={!!excluindoCliente}
        aoFechar={() => setExcluindoCliente(null)}
        titulo="Excluir Cliente"
        rodape={
          <>
            <button
              className="btn-secundario"
              onClick={() => setExcluindoCliente(null)}
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
          {excluindoCliente && (
            (() => {
              const quantos = vendas.filter((v) => v.clienteId === excluindoCliente.id).length;
              const deve = pendenciaDoCliente(excluindoCliente.id);
              return quantos
                ? `"${excluindoCliente.nome}" tem ${quantos} venda(s) no histórico${deve > 0.005 ? ` e deve ${brl(deve)}` : ""}. As vendas continuam salvas. Excluir mesmo assim?`
                : `Tem certeza que deseja excluir o cliente "${excluindoCliente.nome}"?`;
            })()
          )}
        </p>
      </Modal>

      <Modal
        aberto={!!historicoDe}
        aoFechar={() => setHistoricoDe(null)}
        titulo={historicoDe ? `Compras de ${historicoDe.nome}` : ""}
      >
        {historicoDe && (
          <ul className="card divide-y divide-borda overflow-hidden">
            {vendas
              .filter((v) => v.clienteId === historicoDe.id)
              .map((v) => (
                <li key={v.id}>
                  <button
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-superficie-2"
                    onClick={() => setVendo(v)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        {numeroVenda(v.numero)} <ChipStatusVenda venda={v} />
                      </p>
                      <p className="text-xs text-texto-suave">
                        {v.tipo === "COMANDA" ? "Comanda" : "Balcão"} · {dataHoraBR(v.finalizadaEm ?? v.abertaEm)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold tabular-nums">{brl(totalVenda(v))}</p>
                      {saldoVenda(v) > 0.005 && v.status === "FINALIZADA" && (
                        <p className="text-[11px] font-semibold text-red-600 tabular-nums">deve {brl(saldoVenda(v))}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </Modal>

      {vendo && (
        <DetalheVenda venda={vendas.find((v) => v.id === vendo.id) ?? vendo} aoFechar={() => setVendo(null)} />
      )}
    </>
  );
}

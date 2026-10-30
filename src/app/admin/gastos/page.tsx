"use client";

import { useMemo, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  ImageIcon,
  HandCoins,
  MessageCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Cabecalho, Metrica, Modal } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { BarrasHorizontais, CartaoGrafico } from "@/components/Graficos";
import { useDados, novoId } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { brl, dataBR, hojeISO, paraNumero } from "@/lib/format";
import {
  CAIXA_DA_LOJA,
  CATEGORIAS_GASTO,
  CATEGORIA_FORNECEDOR,
  FORMAS_GASTO,
  FORNECEDORES_BOLETO,
  ROTULO_FORMA_GASTO,
  aAcertar,
  apagarComprovante,
  diaSaida,
  grupoSaida,
  type FormaGasto,
  comprimirFoto,
  lerComprovante,
  salvarComprovante,
  entradasDoMes,
  exportarPrestacaoContas,
  iconeGasto,
  nomeMes,
  saidasDoMes,
  type Saida,
} from "@/lib/gastos";
import type { ContaPagar } from "@/lib/types";

export default function GastosPage() {
  return (
    <Protegido chave="financeiro">
      <Gastos />
    </Protegido>
  );
}

function mesDe(dia: string) {
  return dia.slice(0, 7);
}

function somarMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface Formulario {
  valor: string;
  categoria: string;
  /** Nome do fornecedor, só na categoria Fornecedores. */
  fornecedor: string;
  descricao: string;
  forma: FormaGasto;
  doBolso: boolean;
  dia: string;
  /** Foto à mostra no formulário (nova, ou a já salva ao editar). */
  comprovante?: string;
  /** A foto mudou (nova ou tirada) e precisa ser gravada/apagada. */
  fotoMudou?: boolean;
}

/** Quantas categorias aparecem antes do "Ver todas" (3 fileiras de 3 com o botão). */
const CATEGORIAS_VISIVEIS = 8;

const novoForm = (): Formulario => ({
  valor: "",
  categoria: "",
  fornecedor: "",
  descricao: "",
  forma: "PIX",
  doBolso: false,
  dia: hojeISO(),
});

function Gastos() {
  const { contasPagar, movimentos, vendas, fornecedores, salvarContaPagar, removerContaPagar, salvarFornecedor } =
    useDados();
  const { usuario, perfil } = useAuth();
  const meuNome = perfil?.nome || usuario?.email?.split("@")[0] || "Sócio";

  const [form, setForm] = useState<Formulario>(novoForm);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState("");
  const [lendoFoto, setLendoFoto] = useState(false);
  const [todasCategorias, setTodasCategorias] = useState(false);
  const campoValor = useRef<HTMLInputElement>(null);

  const [mes, setMes] = useState(() => mesDe(hojeISO()));
  const [editando, setEditando] = useState<ContaPagar | null>(null);
  const [vendoFoto, setVendoFoto] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);
  const [novoFornecedor, setNovoFornecedor] = useState<string | null>(null);
  /** Pessoa cujo "pago do bolso" está aberto no detalhe. */
  const [vendoBolso, setVendoBolso] = useState<string | null>(null);
  const [confirmandoAcerto, setConfirmandoAcerto] = useState(false);
  const [acertando, setAcertando] = useState(false);

  /** Os do boleto primeiro (na ordem do Nilo), depois o resto do cadastro. */
  const opcoesFornecedor = useMemo(() => {
    const chave = (n: string) => n.trim().toLocaleLowerCase("pt-BR");
    const nomes = new Map<string, string>();
    for (const n of FORNECEDORES_BOLETO) nomes.set(chave(n), n);
    const cadastro = fornecedores
      .filter((f) => f.ativo !== false)
      .map((f) => f.nome)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    for (const n of cadastro) if (!nomes.has(chave(n))) nomes.set(chave(n), n);
    if (form.fornecedor && !nomes.has(chave(form.fornecedor))) nomes.set(chave(form.fornecedor), form.fornecedor);
    return [...nomes.values()];
  }, [fornecedores, form.fornecedor]);
  const saidas = useMemo(() => saidasDoMes(mes, contasPagar, movimentos), [mes, contasPagar, movimentos]);
  const entradas = useMemo(() => entradasDoMes(mes, vendas), [mes, vendas]);
  const totalSaiu = saidas.reduce((s, x) => s + x.valor, 0);
  const totalEntrou = entradas.reduce((s, x) => s + x.valor, 0);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const s of saidas) mapa.set(grupoSaida(s), (mapa.get(grupoSaida(s)) ?? 0) + s.valor);
    return [...mapa.entries()]
      .map(([chave, valor]) => ({ chave, rotulo: chave, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [saidas]);

  /**
   * Quem pagou do próprio bolso e ainda não recebeu do caixa — de todos os
   * meses, porque a dívida não some quando o mês vira.
   */
  const doBolso = useMemo(() => {
    const mapa = new Map<string, ContaPagar[]>();
    for (const c of aAcertar(contasPagar)) mapa.set(c.pagoPor!, [...(mapa.get(c.pagoPor!) ?? []), c]);
    return [...mapa.entries()]
      .map(([nome, contas]) => ({ nome, contas, total: contas.reduce((s, c) => s + c.valor, 0) }))
      .sort((a, b) => b.total - a.total);
  }, [contasPagar]);
  const bolsoAberto = doBolso.find((p) => p.nome === vendoBolso);

  /** Categoria aberta no detalhe do gráfico ("Funcionários" → Serinho, Max, Alice). */
  const [vendoGrupo, setVendoGrupo] = useState<string | null>(null);
  const detalheGrupo = useMemo(() => {
    if (!vendoGrupo) return null;
    const mapa = new Map<string, { nome: string; total: number; dias: string[] }>();
    for (const s of saidas) {
      if (grupoSaida(s) !== vendoGrupo) continue;
      const nome = s.descricao.trim() || vendoGrupo;
      const chave = nome.toLocaleLowerCase("pt-BR");
      const item = mapa.get(chave) ?? { nome, total: 0, dias: [] };
      item.total += s.valor;
      item.dias.push(s.dia);
      mapa.set(chave, item);
    }
    const itens = [...mapa.values()].sort((a, b) => b.total - a.total);
    return { itens, total: itens.reduce((s, i) => s + i.total, 0) };
  }, [vendoGrupo, saidas]);

  /** Descrições já usadas na categoria escolhida, pra repetir o nome igual (ex.: funcionário). */
  const sugestoesDescricao = useMemo(() => {
    const nomes = new Map<string, string>();
    for (const c of contasPagar)
      if (c.categoria === form.categoria && c.descricao && c.descricao !== c.categoria)
        nomes.set(c.descricao.trim().toLocaleLowerCase("pt-BR"), c.descricao.trim());
    return [...nomes.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [contasPagar, form.categoria]);

  // As do dia a dia ficam à mostra; as do mês (aluguel, luz…) atrás de "Ver todas".
  // Ao editar um gasto de categoria escondida, abre tudo pra ela aparecer marcada.
  const escondida = CATEGORIAS_GASTO.findIndex((c) => c.nome === form.categoria) >= CATEGORIAS_VISIVEIS;
  const categoriasNaTela =
    todasCategorias || escondida ? CATEGORIAS_GASTO : CATEGORIAS_GASTO.slice(0, CATEGORIAS_VISIVEIS);

  async function acertar() {
    if (!bolsoAberto) return;
    setAcertando(true);
    try {
      const agora = new Date().toISOString();
      await Promise.all(bolsoAberto.contas.map((c) => salvarContaPagar({ ...c, acertadoEm: agora })));
      setFeito(`${brl(bolsoAberto.total)} acertado com ${bolsoAberto.nome}`);
      setTimeout(() => setFeito(""), 3000);
      setVendoBolso(null);
    } catch {
      setErro("Não salvou o acerto. Confira a internet e tente de novo.");
    } finally {
      setAcertando(false);
      setConfirmandoAcerto(false);
    }
  }

  const porDia = useMemo(() => {
    const mapa = new Map<string, Saida[]>();
    for (const s of saidas) mapa.set(s.dia, [...(mapa.get(s.dia) ?? []), s]);
    return [...mapa.entries()];
  }, [saidas]);

  async function aoEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setLendoFoto(true);
    try {
      const comprovante = await comprimirFoto(arquivo);
      setForm((f) => ({ ...f, comprovante, fotoMudou: true }));
    } catch {
      setErro("Não deu pra usar essa foto. Tente outra.");
    } finally {
      setLendoFoto(false);
    }
  }

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    const valor = paraNumero(form.valor);
    if (valor <= 0) {
      setErro("Digite o valor do gasto.");
      campoValor.current?.focus();
      return;
    }
    if (!form.categoria) {
      setErro("Escolha a categoria.");
      return;
    }
    const ehFornecedor = form.categoria === CATEGORIA_FORNECEDOR;
    const nomeFornecedor = ehFornecedor ? form.fornecedor.trim() : "";
    if (ehFornecedor && !nomeFornecedor) {
      setErro("Escolha o fornecedor.");
      return;
    }
    setErro("");
    setSalvando(true);
    try {
      let fornecedorId: string | undefined;
      if (ehFornecedor) {
        const chave = nomeFornecedor.toLocaleLowerCase("pt-BR");
        const existente = fornecedores.find((f) => f.nome.trim().toLocaleLowerCase("pt-BR") === chave);
        fornecedorId = existente?.id;
        if (!existente) {
          // Vira fornecedor no cadastro. Quem só tem acesso ao Financeiro não
          // pode gravar lá — o gasto sai igual, só com o nome.
          const novo = { id: novoId(), nome: nomeFornecedor, ativo: true, criadoEm: new Date().toISOString() };
          await salvarFornecedor(novo)
            .then(() => (fornecedorId = novo.id))
            .catch(() => {});
        }
      }
      const agora = new Date().toISOString();
      // Meio-dia local: o dia escolhido não "volta" um dia ao virar UTC.
      const pagoEm = form.dia === hojeISO() ? agora : new Date(`${form.dia}T12:00:00`).toISOString();
      const base = editando ?? ({ id: novoId(), criadoEm: agora } as ContaPagar);
      // Foto primeiro: se falhar, o gasto não fica marcando uma foto que não existe.
      if (form.fotoMudou) {
        if (form.comprovante) await salvarComprovante(base.id, form.comprovante);
        else if (base.temComprovante) await apagarComprovante(base.id);
      }
      const temComprovante = form.fotoMudou ? !!form.comprovante : !!base.temComprovante;
      await salvarContaPagar({
        ...base,
        descricao: form.descricao.trim() || nomeFornecedor || form.categoria,
        fornecedorId,
        fornecedorNome: nomeFornecedor || undefined,
        valor,
        vencimento: form.dia,
        pago: true,
        pagoEm,
        categoria: form.categoria,
        forma: form.forma,
        pagoPor: form.doBolso ? (editando?.pagoPor !== CAIXA_DA_LOJA && editando?.pagoPor) || meuNome : CAIXA_DA_LOJA,
        lancadoPor: base.lancadoPor ?? usuario?.email ?? undefined,
        temComprovante: temComprovante || undefined,
      });
      setFeito(`${brl(valor)} em ${nomeFornecedor || form.categoria} ${editando ? "atualizado" : "lançado"}`);
      setNovoFornecedor(null);
      setTimeout(() => setFeito(""), 3000);
      setForm(novoForm());
      setEditando(null);
      if (mesDe(form.dia) !== mes) setMes(mesDe(form.dia));
    } catch {
      setErro("Não salvou. Confira a internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  function editar(c: ContaPagar) {
    setEditando(c);
    setErro("");
    setForm({
      valor: String(c.valor).replace(".", ","),
      categoria: c.categoria ?? "Outros",
      fornecedor: c.categoria === CATEGORIA_FORNECEDOR ? (c.fornecedorNome ?? "") : "",
      descricao: c.descricao === c.categoria || c.descricao === c.fornecedorNome ? "" : c.descricao,
      forma: c.forma ?? "PIX",
      doBolso: !!c.pagoPor && c.pagoPor !== CAIXA_DA_LOJA,
      dia: c.vencimento,
    });
    if (c.temComprovante) {
      lerComprovante(c.id)
        .then((img) => img && setForm((f) => (f.fotoMudou ? f : { ...f, comprovante: img })))
        .catch(() => {});
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function verComprovante(id: string) {
    try {
      const img = await lerComprovante(id);
      if (img) setVendoFoto(img);
    } catch {
      setErro("Não deu pra abrir a foto agora.");
    }
  }

  async function excluir() {
    if (!editando) return;
    if (editando.temComprovante) await apagarComprovante(editando.id).catch(() => {});
    await removerContaPagar(editando.id);
    setEditando(null);
    setForm(novoForm());
  }

  /** Resumo pronto pra colar no grupo dos sócios. */
  function textoResumo() {
    const linhas = [
      `*Jardins Bebidas — ${nomeMes(mes)}*`,
      "",
      `Entrou: ${brl(totalEntrou)}`,
      `Saiu: ${brl(totalSaiu)}`,
      `*Saldo: ${brl(totalEntrou - totalSaiu)}*`,
      "",
      "*Saídas por categoria*",
      ...porCategoria.map((c) => `• ${c.rotulo}: ${brl(c.valor)}`),
    ];
    if (doBolso.length) {
      linhas.push("", "*Pago do próprio bolso (a acertar)*", ...doBolso.map((p) => `• ${p.nome}: ${brl(p.total)}`));
    }
    return linhas.join("\n");
  }

  return (
    <>
      <Cabecalho titulo="Gastos" subtitulo="Lance na hora o que comprou ou pagou — os sócios veem tudo" />

      {feito && (
        <div
          role="status"
          className="animate-toast fixed inset-x-4 top-16 z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-xl md:top-6"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {feito}
        </div>
      )}

      <div className="grid items-start gap-5 px-4 pb-6 md:px-6 xl:grid-cols-[420px_1fr]">
        {/* Lançar */}
        <form onSubmit={lancar} className="card space-y-3 p-3.5 sm:p-4 xl:sticky xl:top-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">{editando ? "Editar gasto" : "Lançar gasto"}</h2>
            {editando && (
              <button
                type="button"
                onClick={() => {
                  setEditando(null);
                  setForm(novoForm());
                }}
                className="flex items-center gap-1 text-xs font-semibold text-texto-suave hover:text-texto"
              >
                <X className="h-3.5 w-3.5" /> Cancelar edição
              </button>
            )}
          </div>

          <div>
            <label className="rotulo" htmlFor="g-valor">Valor</label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-lg font-bold text-texto-suave">
                R$
              </span>
              <input
                ref={campoValor}
                id="g-valor"
                className="campo h-13 pl-12 text-2xl font-black tabular-nums"
                inputMode="decimal"
                placeholder="0,00"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
              />
            </div>
          </div>

          <div>
            <span className="rotulo">Com o quê?</span>
            <div className="grid grid-cols-3 gap-1.5">
              {categoriasNaTela.map(({ nome, Icone }) => {
                const ativo = form.categoria === nome;
                return (
                  <button
                    key={nome}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        categoria: nome,
                        // Fornecedor é quase sempre boleto; os outros não têm boleto.
                        forma: nome === CATEGORIA_FORNECEDOR ? "BOLETO" : form.forma === "BOLETO" ? "PIX" : form.forma,
                      })
                    }
                    className={`flex h-11 items-center gap-1.5 rounded-xl border px-2 text-left text-[11px] leading-tight font-bold transition active:scale-95 ${
                      ativo
                        ? "border-acento bg-acento text-acento-texto shadow-md"
                        : "border-borda bg-superficie text-texto-suave hover:border-acento"
                    }`}
                  >
                    <Icone className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">{nome}</span>
                  </button>
                );
              })}
              {!escondida && (
                <button
                  type="button"
                  onClick={() => setTodasCategorias((v) => !v)}
                  className="flex h-11 items-center justify-center gap-1 rounded-xl border border-dashed border-borda px-2 text-[11px] font-bold text-texto-suave transition hover:border-acento"
                >
                  {todasCategorias ? (
                    <>
                      <ChevronUp className="h-4 w-4 shrink-0" /> Ver menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 shrink-0" /> Ver todas
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {form.categoria === CATEGORIA_FORNECEDOR && (
            <div>
              <span className="rotulo">Qual fornecedor?</span>
              <div className="flex flex-wrap gap-1.5">
                {opcoesFornecedor.map((nome) => (
                  <button
                    key={nome}
                    type="button"
                    onClick={() => {
                      setForm({ ...form, fornecedor: nome });
                      setNovoFornecedor(null);
                    }}
                    className={`h-9 rounded-full border px-3 text-xs font-bold transition active:scale-95 ${
                      form.fornecedor === nome && novoFornecedor === null
                        ? "border-acento bg-acento text-acento-texto"
                        : "border-borda bg-superficie text-texto-suave hover:border-acento"
                    }`}
                  >
                    {nome}
                  </button>
                ))}
                {novoFornecedor === null && (
                  <button
                    type="button"
                    onClick={() => {
                      setNovoFornecedor("");
                      setForm({ ...form, fornecedor: "" });
                    }}
                    className="flex h-9 items-center gap-1 rounded-full border border-dashed border-borda px-3 text-xs font-bold text-texto-suave hover:border-acento"
                  >
                    <Plus className="h-3.5 w-3.5" /> Outro
                  </button>
                )}
              </div>
              {novoFornecedor !== null && (
                <input
                  autoFocus
                  className="campo mt-2 h-11 text-base"
                  placeholder="Nome do fornecedor"
                  value={novoFornecedor}
                  onChange={(e) => {
                    setNovoFornecedor(e.target.value);
                    setForm({ ...form, fornecedor: e.target.value });
                  }}
                />
              )}
            </div>
          )}

          <div>
            <label className="rotulo" htmlFor="g-desc">Descrição (opcional)</label>
            <input
              id="g-desc"
              className="campo h-10 text-base"
              placeholder={form.categoria === "Funcionários" ? "Nome do funcionário" : "Ex: Atacadão, carne do sábado"}
              list="g-desc-sugestoes"
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
            <datalist id="g-desc-sugestoes">
              {sugestoesDescricao.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div>
            <span className="rotulo">Pagou como?</span>
            <div className="grid grid-cols-5 gap-1.5">
              {FORMAS_GASTO.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setForm({ ...form, forma: f })}
                  className={`h-10 rounded-xl border text-xs font-bold transition ${
                    form.forma === f ? "border-acento bg-acento/10 text-acento" : "border-borda text-texto-suave"
                  }`}
                >
                  {ROTULO_FORMA_GASTO[f].replace(/^Cartão (\p{L})/u, (_, l: string) => l.toUpperCase())}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="rotulo">Saiu de onde?</span>
            <div className="grid grid-cols-2 gap-1.5">
              {[false, true].map((bolso) => (
                <button
                  key={String(bolso)}
                  type="button"
                  onClick={() => setForm({ ...form, doBolso: bolso })}
                  className={`h-10 rounded-xl border text-xs font-bold transition ${
                    form.doBolso === bolso ? "border-acento bg-acento/10 text-acento" : "border-borda text-texto-suave"
                  }`}
                >
                  {bolso ? `Do meu bolso (${meuNome})` : CAIXA_DA_LOJA}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className="rotulo" htmlFor="g-dia">Data</label>
              <input
                id="g-dia"
                type="date"
                className="campo h-10"
                value={form.dia}
                max={hojeISO()}
                onChange={(e) => setForm({ ...form, dia: e.target.value || hojeISO() })}
              />
            </div>
            <div className="min-w-0">
              <span className="rotulo">Nota / comprovante</span>
              {form.comprovante ? (
                <div className="flex h-10 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setVendoFoto(form.comprovante!)}
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-borda"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.comprovante} alt="Comprovante" className="h-full w-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, comprovante: undefined, fotoMudou: true })}
                    className="text-xs font-semibold text-red-600"
                  >
                    Tirar
                  </button>
                </div>
              ) : (
                <label className="btn-secundario h-10 w-full cursor-pointer text-xs">
                  <Camera className="h-4 w-4" />
                  {lendoFoto ? "Lendo…" : "Foto"}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={aoEscolherFoto} />
                </label>
              )}
            </div>
          </div>

          {erro && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {erro}
            </p>
          )}

          <button type="submit" className="btn-primario h-12 w-full text-base" disabled={salvando || lendoFoto}>
            {salvando ? "Salvando…" : editando ? "Salvar alteração" : "Lançar gasto"}
          </button>
          {editando && (
            <button type="button" onClick={excluir} className="btn-perigo w-full">
              <Trash2 className="h-4 w-4" /> Excluir este gasto
            </button>
          )}
        </form>

        {/* Mês */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setMes((m) => somarMes(m, -1))} className="btn-secundario h-10 w-10 px-0" aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="min-w-0 flex-1 text-center text-lg font-black">{nomeMes(mes)}</h2>
            <button
              onClick={() => setMes((m) => somarMes(m, 1))}
              disabled={mes >= mesDe(hojeISO())}
              className="btn-secundario h-10 w-10 px-0"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Metrica rotulo="Entrou" valor={brl(totalEntrou)} detalhe="vendas recebidas" />
            <Metrica rotulo="Saiu" valor={brl(totalSaiu)} detalhe={`${saidas.length} lançamento(s)`} />
            <Metrica rotulo="Saldo" valor={brl(totalEntrou - totalSaiu)} destaque />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primario"
              disabled={baixando}
              onClick={async () => {
                setBaixando(true);
                try {
                  await exportarPrestacaoContas(mes, saidas, entradas);
                } finally {
                  setBaixando(false);
                }
              }}
            >
              <Download className="h-4 w-4" />
              {baixando ? "Gerando…" : "Prestação de contas (Excel)"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(textoResumo())}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secundario"
            >
              <MessageCircle className="h-4 w-4" />
              Mandar resumo pros sócios
            </a>
          </div>

          {doBolso.length > 0 && (
            <section className="card border-amber-300 p-4 dark:border-amber-900">
              <h3 className="text-sm font-bold">Pago do próprio bolso</h3>
              <p className="text-xs text-texto-suave">O caixa precisa acertar com essas pessoas. Toque pra ver o detalhe.</p>
              <ul className="-mx-2 mt-2">
                {doBolso.map((p) => (
                  <li key={p.nome}>
                    <button
                      onClick={() => setVendoBolso(p.nome)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-superficie-2"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.nome}</span>
                      <span className="text-xs text-texto-suave">{p.contas.length} lanç.</span>
                      <span className="font-bold tabular-nums">{brl(p.total)}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-texto-suave" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <CartaoGrafico titulo="Pra onde foi o dinheiro" subtitulo="Saídas do mês por categoria">
            <BarrasHorizontais barras={porCategoria} aoClicar={setVendoGrupo} />
          </CartaoGrafico>

          <section>
            <h3 className="mb-2 text-sm font-bold">Todas as saídas</h3>
            {porDia.length === 0 ? (
              <p className="card px-4 py-8 text-center text-sm text-texto-suave">Nenhuma saída lançada neste mês.</p>
            ) : (
              <div className="space-y-3">
                {porDia.map(([dia, lista]) => (
                  <div key={dia} className="card overflow-hidden">
                    <div className="flex justify-between border-b border-borda bg-superficie-2 px-4 py-2 text-xs font-bold text-texto-suave">
                      <span>{dataBR(dia)}</span>
                      <span className="tabular-nums">{brl(lista.reduce((s, x) => s + x.valor, 0))}</span>
                    </div>
                    <ul className="divide-y divide-borda">
                      {lista.map((s) => {
                        const Icone = iconeGasto(s.categoria);
                        const editavel = s.origem === "GASTO" && s.conta;
                        return (
                          <li key={s.id}>
                            <button
                              disabled={!editavel}
                              onClick={() => editavel && editar(s.conta!)}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition enabled:hover:bg-superficie-2"
                            >
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-acento/10 text-acento">
                                <Icone className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">{s.descricao}</span>
                                <span className="block truncate text-xs text-texto-suave">
                                  {[
                                    s.fornecedor && s.fornecedor !== s.descricao ? s.fornecedor : s.categoria,
                                    s.forma,
                                    s.pagoPor !== CAIXA_DA_LOJA &&
                                      `pago por ${s.pagoPor}${s.conta?.acertadoEm ? " (acertado)" : ""}`,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                  {s.origem !== "GASTO" && " · lançado em outra tela"}
                                </span>
                              </span>
                              {s.conta?.temComprovante && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void verComprovante(s.conta!.id);
                                  }}
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-texto-suave hover:bg-superficie-2"
                                  aria-label="Ver comprovante"
                                >
                                  <ImageIcon className="h-4 w-4" />
                                </span>
                              )}
                              <span className="shrink-0 font-bold tabular-nums">{brl(s.valor)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Modal aberto={!!detalheGrupo} aoFechar={() => setVendoGrupo(null)} titulo={`${vendoGrupo ?? ""} · ${nomeMes(mes)}`}>
        {detalheGrupo && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between rounded-xl bg-superficie-2 px-4 py-3">
              <span className="text-sm font-semibold text-texto-suave">Total</span>
              <span className="text-2xl font-black tabular-nums">{brl(detalheGrupo.total)}</span>
            </div>
            <ul className="divide-y divide-borda">
              {detalheGrupo.itens.map((i) => (
                <li key={i.nome} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{i.nome}</span>
                    <span className="block truncate text-xs text-texto-suave">
                      {i.dias.length} lanç. · {[...i.dias].sort().map((d) => dataBR(d).slice(0, 5)).join(", ")}
                    </span>
                  </span>
                  <span className="font-bold tabular-nums">{brl(i.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      <Modal
        aberto={!!bolsoAberto}
        aoFechar={() => {
          setVendoBolso(null);
          setConfirmandoAcerto(false);
        }}
        titulo={bolsoAberto ? `Pago por ${bolsoAberto.nome}` : ""}
        rodape={
          bolsoAberto &&
          (confirmandoAcerto ? (
            <>
              <button className="btn-secundario" onClick={() => setConfirmandoAcerto(false)} disabled={acertando}>
                Voltar
              </button>
              <button className="btn-primario" onClick={acertar} disabled={acertando}>
                {acertando ? "Salvando…" : `Sim, recebeu ${brl(bolsoAberto.total)}`}
              </button>
            </>
          ) : (
            <button className="btn-primario" onClick={() => setConfirmandoAcerto(true)}>
              <HandCoins className="h-4 w-4" /> Caixa já pagou
            </button>
          ))
        }
      >
        {bolsoAberto && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between rounded-xl bg-superficie-2 px-4 py-3">
              <span className="text-sm font-semibold text-texto-suave">A acertar</span>
              <span className="text-2xl font-black tabular-nums">{brl(bolsoAberto.total)}</span>
            </div>
            {confirmandoAcerto && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                O caixa devolveu {brl(bolsoAberto.total)} pra {bolsoAberto.nome}? Esses lançamentos saem da lista de
                acerto (continuam nas saídas do mês).
              </p>
            )}
            <ul className="divide-y divide-borda">
              {bolsoAberto.contas.map((c) => {
                const Icone = iconeGasto(c.categoria ?? "");
                return (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-acento/10 text-acento">
                      <Icone className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{c.descricao}</span>
                      <span className="block truncate text-xs text-texto-suave">
                        {[
                          dataBR(diaSaida(c)),
                          c.fornecedorNome && c.fornecedorNome !== c.descricao ? c.fornecedorNome : c.categoria,
                          c.forma && ROTULO_FORMA_GASTO[c.forma],
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {c.temComprovante && (
                      <button
                        onClick={() => void verComprovante(c.id)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-texto-suave hover:bg-superficie-2"
                        aria-label="Ver comprovante"
                      >
                        <ImageIcon className="h-4 w-4" />
                      </button>
                    )}
                    <span className="shrink-0 font-bold tabular-nums">{brl(c.valor)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Modal>

      <Modal aberto={!!vendoFoto} aoFechar={() => setVendoFoto(null)} titulo="Comprovante">
        {vendoFoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vendoFoto} alt="Comprovante" className="mx-auto max-h-[70vh] rounded-lg" />
        )}
      </Modal>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun, type LucideIcon } from "lucide-react";
import { Modal } from "./ui";

/*
 * Aparência do sistema: modo (claro, escuro ou automático), estilo (Jardins
 * ou Grafite) e cor de destaque.
 * Fica salvo no aparelho (localStorage) — cada celular/computador escolhe o seu.
 */

type Modo = "claro" | "escuro" | "auto";
type Paleta = "jardins" | "grafite";
type Cor = "laranja" | "chope" | "prata";

const CHAVE = "jardins:tema";
const CHAVE_PALETA = "jardins:paleta";
const CHAVE_COR = "jardins:cor";
/** Avisa as outras instâncias do botão (barra do celular e lateral) da troca. */
const EVENTO = "jardins:aparencia";

const MODOS: { id: Modo; rotulo: string; descricao: string; Icone: LucideIcon }[] = [
  { id: "claro", rotulo: "Claro", descricao: "Fundo creme", Icone: Sun },
  { id: "escuro", rotulo: "Escuro", descricao: "Descansa a vista", Icone: Moon },
  { id: "auto", rotulo: "Automático", descricao: "Igual ao aparelho", Icone: Monitor },
];

/** As amostras mostram barra, fundo e destaque de cada estilo (globals.css). */
const PALETAS: { id: Paleta; rotulo: string; descricao: string; amostra: [string, string, string] }[] = [
  { id: "jardins", rotulo: "Jardins", descricao: "Creme e marrom da logo", amostra: ["#4a230f", "#f9f4ee", "#f26a1b"] },
  { id: "grafite", rotulo: "Grafite", descricao: "Preto, prata e branco", amostra: ["#212428", "#f3f4f6", "#9ca3af"] },
];

/** Cor que cada estilo puxa ao ser escolhido (dá pra trocar depois). */
const COR_DO_ESTILO: Record<Paleta, Cor> = { jardins: "laranja", grafite: "prata" };

/** As amostras repetem o --acento / --acento-claro (globals.css). */
const CORES: { id: Cor; rotulo: string; de: string; ate: string }[] = [
  { id: "laranja", rotulo: "Laranja", de: "#f7802f", ate: "#e3510f" },
  { id: "chope", rotulo: "Chope", de: "#e8971f", ate: "#b8660a" },
  { id: "prata", rotulo: "Prata", de: "#d1d5db", ate: "#4b5159" },
];

function lerModo(): Modo {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === "claro" || salvo === "escuro" || salvo === "auto") return salvo;
  } catch {
    // sem armazenamento: segue o aparelho
  }
  return "auto";
}

function lerPaleta(): Paleta {
  try {
    if (localStorage.getItem(CHAVE_PALETA) === "grafite") return "grafite";
  } catch {
    // sem armazenamento: estilo padrão
  }
  return "jardins";
}

function lerCor(): Cor {
  try {
    const salva = localStorage.getItem(CHAVE_COR);
    if (CORES.some((c) => c.id === salva)) return salva as Cor;
  } catch {
    // sem armazenamento: cor padrão
  }
  return "laranja";
}

const consultaEscuro = () => window.matchMedia("(prefers-color-scheme: dark)");

function aplicar(modo: Modo, paleta: Paleta, cor: Cor) {
  const html = document.documentElement;
  html.dataset.tema = modo === "auto" ? (consultaEscuro().matches ? "escuro" : "claro") : modo;
  if (paleta === "jardins") delete html.dataset.paleta;
  else html.dataset.paleta = paleta;
  if (cor === "laranja") delete html.dataset.cor;
  else html.dataset.cor = cor;
  // A barra do navegador no celular acompanha a cor da barra do app.
  const barra = getComputedStyle(html).getPropertyValue("--barra").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", barra);
}

export function TemaBotao({ className = "" }: { className?: string }) {
  const [montado, setMontado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("auto");
  const [paleta, setPaleta] = useState<Paleta>("jardins");
  const [cor, setCor] = useState<Cor>("laranja");

  useEffect(() => {
    setModo(lerModo());
    setPaleta(lerPaleta());
    setCor(lerCor());
    setMontado(true);
    const sincronizar = () => {
      setModo(lerModo());
      setPaleta(lerPaleta());
      setCor(lerCor());
    };
    window.addEventListener(EVENTO, sincronizar);
    return () => window.removeEventListener(EVENTO, sincronizar);
  }, []);

  useEffect(() => {
    if (!montado) return;
    aplicar(modo, paleta, cor);
    // No automático, acompanha o aparelho trocando de tema com o app aberto.
    if (modo !== "auto") return;
    const mq = consultaEscuro();
    const aoMudar = () => aplicar(modo, paleta, cor);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [modo, paleta, cor, montado]);

  function escolher(novo: { modo?: Modo; paleta?: Paleta; cor?: Cor }) {
    const m = novo.modo ?? modo;
    const p = novo.paleta ?? paleta;
    const c = novo.cor ?? (novo.paleta ? COR_DO_ESTILO[novo.paleta] : cor);
    setModo(m);
    setPaleta(p);
    setCor(c);
    try {
      localStorage.setItem(CHAVE, m);
      localStorage.setItem(CHAVE_PALETA, p);
      localStorage.setItem(CHAVE_COR, c);
    } catch {
      // sem armazenamento: vale só nesta visita
    }
    window.dispatchEvent(new Event(EVENTO));
  }

  // Sem isso o ícone renderizado no servidor briga com o do cliente.
  if (!montado) return <span className={`inline-block h-9 w-9 ${className}`} aria-hidden />;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`grid h-9 w-9 place-items-center rounded-lg transition hover:bg-white/10 active:scale-95 ${className}`}
        title="Aparência (tema e cores)"
        aria-label="Aparência: mudar tema e cores"
      >
        <Palette className="h-[18px] w-[18px]" />
      </button>

      <Modal aberto={aberto} aoFechar={() => setAberto(false)} titulo="Aparência" largura="max-w-md">
        <div className="space-y-6 pb-1">
          <section>
            <p className="rotulo">Tema</p>
            <div className="grid grid-cols-3 gap-2">
              {MODOS.map(({ id, rotulo, descricao, Icone }) => {
                const ativo = modo === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => escolher({ modo: id })}
                    className={`relative flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-4 text-center transition duration-200 ${
                      ativo
                        ? "border-acento bg-acento/10 text-acento ring-4 ring-acento/10"
                        : "border-borda text-texto hover:border-borda-forte hover:bg-superficie-2"
                    }`}
                  >
                    {ativo && (
                      <span className="absolute top-2 right-2 grid h-4 w-4 animate-pop place-items-center rounded-full bg-acento text-acento-texto">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                    <Icone className="h-6 w-6" strokeWidth={ativo ? 2.25 : 1.75} />
                    <span className="text-sm font-bold">{rotulo}</span>
                    <span className="text-[11px] leading-tight text-texto-suave">{descricao}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="rotulo">Estilo</p>
            <div className="grid grid-cols-2 gap-2">
              {PALETAS.map(({ id, rotulo, descricao, amostra: [barra, fundo, ponto] }) => {
                const ativo = paleta === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => escolher({ paleta: id })}
                    className={`relative overflow-hidden rounded-2xl border text-left transition duration-200 ${
                      ativo
                        ? "border-acento ring-4 ring-acento/10"
                        : "border-borda hover:border-borda-forte"
                    }`}
                  >
                    {/* Miniatura: lateral, fundo e um cartão com o destaque. */}
                    <span className="flex h-16" style={{ background: fundo }} aria-hidden>
                      <span className="w-1/4" style={{ background: barra }} />
                      <span className="flex flex-1 flex-col justify-center gap-1.5 px-3">
                        <span className="h-2 w-3/4 rounded-full bg-white shadow-sm ring-1 ring-black/5" />
                        <span className="h-2 w-1/2 rounded-full" style={{ background: ponto }} />
                      </span>
                    </span>
                    <span className="block px-3 py-2.5">
                      <span className="block text-sm font-bold">{rotulo}</span>
                      <span className="block text-[11px] leading-tight text-texto-suave">{descricao}</span>
                    </span>
                    {ativo && (
                      <span className="absolute top-2 right-2 grid h-5 w-5 animate-pop place-items-center rounded-full bg-acento text-acento-texto">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <p className="rotulo">Cor de destaque</p>
            <div className="grid grid-cols-3 gap-2">
              {CORES.map(({ id, rotulo, de, ate }) => {
                const ativo = cor === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => escolher({ cor: id })}
                    className="group flex flex-col items-center gap-1.5 rounded-xl py-1"
                    title={rotulo}
                  >
                    <span
                      className={`grid h-11 w-11 place-items-center rounded-full shadow-card ring-offset-2 ring-offset-superficie transition duration-200 group-hover:scale-110 ${
                        ativo ? "ring-2 ring-texto/70" : ""
                      }`}
                      style={{ backgroundImage: `linear-gradient(135deg, ${de}, ${ate})` }}
                    >
                      {ativo && <Check className="h-5 w-5 animate-pop text-white" strokeWidth={3} />}
                    </span>
                    <span
                      className={`text-[11px] font-semibold ${ativo ? "text-texto" : "text-texto-suave"}`}
                    >
                      {rotulo}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Prévia: mostra na hora como fica o destaque escolhido. */}
          <section>
            <p className="rotulo">Prévia</p>
            <div className="card flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold tracking-[0.06em] text-texto-suave uppercase">
                  Venda de hoje
                </p>
                <p className="texto-degrade text-xl font-extrabold tracking-tight tabular-nums">
                  R$ 1.284,50
                </p>
              </div>
              <span className="chip bg-acento/10 text-acento">+12%</span>
              <span className="btn-primario pointer-events-none px-3 py-1.5 text-xs">Cobrar</span>
            </div>
          </section>

          <p className="text-center text-xs text-texto-suave">
            Fica salvo neste aparelho. Dá pra mudar quando quiser.
          </p>
        </div>
      </Modal>
    </>
  );
}

/**
 * Aplica o tema e a cor salvos antes da primeira pintura, evitando o
 * "flash branco" de quem usa o tema escuro. Roda como script inline no <head>.
 */
export const SCRIPT_TEMA = `
(function () {
  try {
    var d = document.documentElement;
    var t = localStorage.getItem("${CHAVE}");
    if (t !== "claro" && t !== "escuro") {
      t = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "escuro"
        : "claro";
    }
    d.dataset.tema = t;
    if (localStorage.getItem("${CHAVE_PALETA}") === "grafite") d.dataset.paleta = "grafite";
    var c = localStorage.getItem("${CHAVE_COR}");
    if (c === "chope" || c === "prata") d.dataset.cor = c;
  } catch (e) {}
})();
`;

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  Mail,
  ShoppingCart,
} from "lucide-react";
import { Brinde } from "@/components/Brinde";
import { Logo } from "@/components/Logo";
import { TemaBotao } from "@/components/TemaBotao";
import { mensagemDeErro, useAuth } from "@/lib/auth";

const DESTAQUES = [
  { Icone: ShoppingCart, titulo: "Vendas e comandas", texto: "Balcão, fiado e mesas sem papel." },
  { Icone: Boxes, titulo: "Estoque em dia", texto: "Entradas e baixas automáticas." },
  { Icone: BarChart3, titulo: "Financeiro na mão", texto: "Relatórios do dia, da semana e do mês." },
];

export default function LoginPage() {
  const { entrar, recuperarSenha } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aprovado, setAprovado] = useState(false);
  // Muda a cada erro pra remontar o formulário e repetir a animação de "tremer".
  const [tentativa, setTentativa] = useState(0);

  function falhou(mensagem: string) {
    setErro(mensagem);
    setTentativa((t) => t + 1);
  }

  async function aoEnviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");
    setEnviando(true);
    try {
      await entrar(email, senha);
      // Mostra o brinde e só então abre o painel (já carregando por trás).
      // Com "reduzir movimento" não há animação pra esperar.
      router.prefetch("/admin");
      setAprovado(true);
      const semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setTimeout(() => router.replace("/admin"), semAnimacao ? 400 : 1900);
    } catch (erro) {
      falhou(mensagemDeErro(erro));
      setEnviando(false);
    }
  }

  async function aoRecuperar() {
    if (!email.trim()) {
      falhou("Digite seu e-mail primeiro pra receber o link.");
      return;
    }
    setErro("");
    try {
      await recuperarSenha(email);
      setAviso("Enviamos um link de recuperação pro seu e-mail.");
    } catch (erro) {
      falhou(mensagemDeErro(erro));
    }
  }

  return (
    <div className="relative flex min-h-dvh bg-barra lg:items-center lg:justify-center lg:bg-[var(--barra-2)] lg:p-8">
      {aprovado && <Brinde />}
      <TemaBotao className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-20 text-barra-texto" />

      <div className="flex w-full flex-col lg:grid lg:min-h-[620px] lg:max-w-5xl lg:grid-cols-[1.05fr_1fr] lg:overflow-hidden lg:rounded-[2rem] lg:shadow-[0_40px_100px_-30px_rgb(0_0_0/0.8)] lg:ring-1 lg:ring-white/10">
        {/* Marca: topo no celular, metade esquerda no computador. */}
        <section className="relative isolate overflow-hidden bg-barra px-6 pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))] pb-14 text-barra-texto lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="animate-respirar absolute -top-32 -left-24 h-80 w-80 rounded-full bg-acento/30 blur-3xl lg:h-[28rem] lg:w-[28rem]" />
            <div
              className="animate-respirar absolute -right-24 -bottom-32 h-72 w-72 rounded-full bg-chope/20 blur-3xl"
              style={{ animationDelay: "-4s" }}
            />
          </div>

          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <Logo className="animate-entrar h-24 w-auto lg:h-20" />
            <p
              className="animate-entrar mt-4 text-sm text-barra-texto/70 lg:hidden"
              style={{ animationDelay: "80ms" }}
            >
              Sistema de gestão da loja
            </p>
          </div>

          <div className="hidden lg:block">
            <p
              className="animate-entrar text-xs font-bold tracking-[0.25em] text-acento-claro uppercase"
              style={{ animationDelay: "80ms" }}
            >
              Sistema de gestão
            </p>
            <h2
              className="animate-entrar mt-3 text-4xl leading-tight font-black tracking-tight text-espuma xl:text-[2.75rem]"
              style={{ animationDelay: "160ms" }}
            >
              Tudo da loja,
              <br />
              <span className="texto-degrade">num lugar só.</span>
            </h2>
            <ul className="mt-8 space-y-4">
              {DESTAQUES.map(({ Icone, titulo, texto }, i) => (
                <li
                  key={titulo}
                  className="animate-entrar flex items-center gap-3.5"
                  style={{ animationDelay: `${260 + i * 90}ms` }}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-acento-claro ring-1 ring-white/10">
                    <Icone className="h-[18px] w-[18px]" />
                  </span>
                  <span className="leading-snug">
                    <span className="block text-sm font-bold text-espuma">{titulo}</span>
                    <span className="block text-sm text-barra-texto/60">{texto}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="hidden text-xs text-barra-texto/40 lg:block">
            © {new Date().getFullYear()} Jardins Bebidas
          </p>
        </section>

        {/* Formulário: "folha" que sobe do rodapé no celular. */}
        <section className="animate-folha relative z-10 -mt-7 flex flex-1 flex-col rounded-t-[1.75rem] bg-superficie px-6 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-texto shadow-[0_-12px_30px_-12px_rgb(0_0_0/0.4)] lg:mt-0 lg:animate-none lg:justify-center lg:rounded-none lg:px-14 lg:py-12 lg:shadow-none">
          <form
            key={tentativa}
            onSubmit={aoEnviar}
            className={`mx-auto w-full max-w-sm ${tentativa > 0 ? "animate-tremer" : ""}`}
          >
            <h1 className="text-2xl font-black tracking-tight">Bem-vindo de volta</h1>
            <p className="mt-1 text-[15px] text-texto-suave">
              Entre com sua conta para continuar.
            </p>

            <div className="mt-7 space-y-5">
              <div>
                <label className="rotulo" htmlFor="email">
                  E-mail
                </label>
                <div className="group relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-texto-suave transition group-focus-within:text-acento" />
                  <input
                    id="email"
                    type="email"
                    inputMode="email"
                    className="campo h-12 pl-11 text-base"
                    placeholder="voce@exemplo.com"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="rotulo" htmlFor="senha">
                  Senha
                </label>
                <div className="group relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-texto-suave transition group-focus-within:text-acento" />
                  <input
                    id="senha"
                    type={mostrarSenha ? "text" : "password"}
                    className="campo h-12 pr-12 pl-11 text-base"
                    placeholder="Sua senha"
                    autoComplete="current-password"
                    required
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                    onBlur={() => setCapsLock(false)}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute top-1/2 right-1.5 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-texto-suave transition hover:bg-superficie-2 hover:text-texto"
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {mostrarSenha ? (
                      <EyeOff className="h-[18px] w-[18px]" />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" />
                    )}
                  </button>
                </div>
                {capsLock && (
                  <p className="animate-aparecer mt-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Caps Lock está ligado.
                  </p>
                )}
              </div>
            </div>

            {erro && (
              <p
                role="alert"
                className="animate-aparecer mt-5 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400"
              >
                {erro}
              </p>
            )}

            {aviso && (
              <p className="animate-aparecer mt-5 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                {aviso}
              </p>
            )}

            <button
              type="submit"
              className="btn-primario group mt-7 h-12 w-full text-base"
              disabled={enviando}
            >
              {enviando ? (
                <>
                  <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  Entrando…
                </>
              ) : (
                <>
                  Entrar
                  <LogIn className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={aoRecuperar}
              className="mt-2 h-11 w-full text-center text-sm font-semibold text-texto-suave underline-offset-4 transition hover:text-acento hover:underline"
            >
              Esqueci minha senha
            </button>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-texto-suave/80">
              <Lock className="h-3 w-3" />
              Acesso restrito à equipe da Jardins Bebidas
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}

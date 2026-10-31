"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  ClipboardList,
  HelpCircle,
  Home,
  LayoutGrid,
  LogOut,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Logo, LogoMarca } from "./Logo";
import { TemaBotao } from "./TemaBotao";
import { Modal } from "./ui";
import { SincronizarCatalogo } from "./SincronizarCatalogo";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import type { Permissoes } from "@/lib/types";

/** Lateral do desktop (todos) e barra do celular (os fixos + "Mais"). */
const ITENS = [
  { href: "/admin", rotulo: "Painel", Icone: Home, chave: null },
  { href: "/admin/vendas", rotulo: "Vender", Icone: ShoppingCart, chave: "vendas" },
  { href: "/admin/comandas", rotulo: "Comandas", Icone: ClipboardList, chave: "comandas" },
  { href: "/admin/relatorios", rotulo: "Relatórios", Icone: BarChart3, chave: "relatorios" },
  { href: "/admin/financeiro", rotulo: "Financeiro", Icone: Wallet, chave: "financeiro" },
  { href: "/admin/fluxo", rotulo: "Fluxo de caixa", Icone: ArrowLeftRight, chave: "financeiro" },
  { href: "/admin/gastos", rotulo: "Gastos", Icone: Receipt, chave: "financeiro" },
  { href: "/admin/estoque", rotulo: "Estoque", Icone: Boxes, chave: "estoque" },
  { href: "/admin/compras", rotulo: "Entradas", Icone: ShoppingBag, chave: "estoque" },
  { href: "/admin/produtos", rotulo: "Produtos", Icone: Package, chave: "produtos" },
  { href: "/admin/clientes", rotulo: "Clientes", Icone: Users, chave: "clientes" },
  { href: "/admin/catalogo", rotulo: "Catálogo", Icone: Store, chave: "produtos" },
  { href: "/admin/fornecedores", rotulo: "Fornecedores", Icone: Truck, chave: "fornecedores" },
] satisfies { href: string; rotulo: string; Icone: unknown; chave: keyof Permissoes | null }[];

const ITEM_EQUIPE = { href: "/admin/equipe", rotulo: "Equipe", Icone: ShieldCheck };
const ITEM_AJUDA = { href: "/admin/ajuda", rotulo: "Ajuda", Icone: HelpCircle };

/**
 * Barra do celular: cabem 5 botões sem rolar. Estes ficam sempre à mostra
 * e o resto vai pra folha do "Mais".
 */
const FIXOS_CELULAR = ["/admin", "/admin/vendas", "/admin/comandas", "/admin/relatorios"];

const ROTA_COMANDAS = "/admin/comandas";

/** Telas que qualquer um alcança sem estar logado. */
const ROTAS_PUBLICAS = ["/login", "/catalogo"];

function estaAtivo(href: string, caminho: string) {
  if (href === "/admin") return caminho === "/admin";
  return caminho === href || caminho.startsWith(`${href}/`);
}

function ehPublica(caminho: string) {
  return ROTAS_PUBLICAS.some(
    (r) => caminho === r || caminho.startsWith(`${r}/`),
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const router = useRouter();
  const { modoDemonstracao, comandasAbertas } = useDados();
  const { usuario, carregando, exigeLogin, sair, permissoes, ehAdmin } = useAuth();

  const precisaEntrar = exigeLogin && !carregando && !usuario;
  const publica = ehPublica(caminho);

  const itensPermitidos = ITENS.filter((i) => !i.chave || permissoes[i.chave]);
  const itensDesktop = [...itensPermitidos, ...(ehAdmin ? [ITEM_EQUIPE] : []), ITEM_AJUDA];

  // Sem permissão pra algum fixo, o próximo item da lista entra no lugar.
  const fixosCelular =
    itensDesktop.length <= 5
      ? itensDesktop
      : [
          ...itensDesktop.filter((i) => FIXOS_CELULAR.includes(i.href)),
          ...itensDesktop.filter((i) => !FIXOS_CELULAR.includes(i.href)),
        ].slice(0, 4);
  const noMais = itensDesktop.filter((i) => !fixosCelular.includes(i));
  const [maisAberto, setMaisAberto] = useState(false);

  const badgeDe = (href: string) => (href === ROTA_COMANDAS ? comandasAbertas : 0);

  useEffect(() => {
    if (precisaEntrar && !publica) router.replace("/login");
  }, [precisaEntrar, publica, router]);

  // Sem a casca do app: login e as folhas imprimíveis.
  if (publica || caminho.includes("/imprimir")) {
    return <>{children}</>;
  }

  if (exigeLogin && carregando) {
    return <TelaEspera texto="Carregando…" />;
  }

  // Enquanto o redirecionamento acontece, não pisca o conteúdo protegido.
  if (precisaEntrar) {
    return <TelaEspera texto="Redirecionando…" />;
  }

  return (
    <div className="min-h-dvh">
      <SincronizarCatalogo />
      {/* Barra superior — some no desktop, onde a lateral assume */}
      <header className="nao-imprimir fundo-barra sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-black/30 px-4 text-barra-texto shadow-[0_4px_20px_-8px_rgb(0_0_0/0.45)] md:hidden">
        <Link href="/admin" className="text-lg transition active:scale-95">
          <LogoMarca />
        </Link>
        <div className="ml-auto flex items-center gap-0.5">
          <TemaBotao />
          {exigeLogin && <BotaoSair aoSair={sair} />}
        </div>
      </header>

      {/* No computador o menu fica encostado na borda e o conteúdo centraliza
          no espaço que sobra (antes o conjunto todo centralizava e sobrava uma
          faixa vazia à esquerda do menu em telas largas). */}
      <div className="flex w-full">
        {/* Lateral — só no desktop */}
        <aside className="nao-imprimir fundo-barra sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-black/30 px-3 py-5 text-barra-texto shadow-[4px_0_24px_-12px_rgb(0_0_0/0.5)] md:flex">
          <Link href="/admin" className="group mb-5 block px-2">
            <Logo className="mx-auto h-24 w-auto drop-shadow-[0_6px_16px_rgb(0_0_0/0.45)] transition duration-300 group-hover:scale-[1.03]" />
          </Link>

          <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.14em] text-barra-texto/40 uppercase">
            Menu
          </p>
          <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-2">
            {itensDesktop.map(({ href, rotulo, Icone }) => {
              const ativo = estaAtivo(href, caminho);
              const badge = badgeDe(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={ativo ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition duration-200 ${
                    ativo
                      ? "bg-linear-to-r from-acento-claro to-acento text-acento-texto shadow-acento"
                      : "text-barra-texto/70 hover:bg-white/[.07] hover:text-barra-texto"
                  }`}
                >
                  <Icone
                    className={`h-[18px] w-[18px] shrink-0 transition duration-200 ${
                      ativo ? "" : "group-hover:translate-x-0.5 group-hover:text-acento-claro"
                    }`}
                    strokeWidth={ativo ? 2.4 : 2}
                  />
                  <span className="flex-1">{rotulo}</span>
                  {badge > 0 && (
                    <span
                      className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-black tabular-nums ${
                        ativo ? "bg-black/20 text-current" : "bg-acento text-acento-texto shadow-acento"
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="pt-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] p-1.5 pl-2">
              {usuario ? (
                <>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-acento-claro to-acento text-xs font-black text-acento-texto uppercase">
                    {(usuario.email ?? "?").charAt(0)}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[11px] font-medium text-barra-texto/60"
                    title={usuario.email ?? ""}
                  >
                    {usuario.email}
                  </span>
                </>
              ) : (
                <span className="min-w-0 flex-1 truncate px-1 text-[11px] font-medium text-barra-texto/50">
                  Aparência
                </span>
              )}
              <TemaBotao />
              {exigeLogin && <BotaoSair aoSair={sair} />}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-28 md:pb-12">
          {modoDemonstracao && <AvisoDemonstracao />}
          {/* Só opacidade (sem transform): transform aqui quebraria os
              elementos `fixed` das telas, como a barra do carrinho. */}
          <div key={caminho} className="mx-auto w-full max-w-[1400px] animate-aparecer">
            {children}
          </div>
        </main>
      </div>

      {/* Navegação inferior — só no celular: os fixos + "Mais" com o resto. */}
      <nav className="nao-imprimir fixed inset-x-0 bottom-0 z-30 flex border-t border-borda bg-superficie/85 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_-12px_rgb(0_0_0/0.18)] backdrop-blur-xl backdrop-saturate-150 md:hidden">
        {fixosCelular.map(({ href, rotulo, Icone }) => (
          <BotaoBarra
            key={href}
            href={href}
            rotulo={rotulo}
            Icone={Icone}
            ativo={estaAtivo(href, caminho)}
            badge={badgeDe(href)}
          />
        ))}
        {noMais.length > 0 && (
          <BotaoBarra
            rotulo="Mais"
            Icone={LayoutGrid}
            // Acende quando a tela aberta é uma das que estão no "Mais".
            ativo={noMais.some((i) => estaAtivo(i.href, caminho))}
            badge={noMais.reduce((s, i) => s + badgeDe(i.href), 0)}
            aoClicar={() => setMaisAberto(true)}
          />
        )}
      </nav>

      <Modal aberto={maisAberto} aoFechar={() => setMaisAberto(false)} titulo="Mais">
        <div className="grid grid-cols-3 gap-2">
          {noMais.map(({ href, rotulo, Icone }) => {
            const ativo = estaAtivo(href, caminho);
            const badge = badgeDe(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMaisAberto(false)}
                className={`relative flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 text-center text-xs font-semibold transition duration-200 active:scale-95 ${
                  ativo
                    ? "border-acento bg-acento/10 text-acento ring-4 ring-acento/10"
                    : "border-borda bg-superficie text-texto shadow-card hover:border-borda-forte hover:bg-superficie-2"
                }`}
              >
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl ${
                    ativo ? "bg-acento text-acento-texto shadow-acento" : "bg-acento/10 text-acento"
                  }`}
                >
                  <Icone className="h-5 w-5" strokeWidth={ativo ? 2.5 : 2} />
                </span>
                {rotulo}
                {badge > 0 && (
                  <span className="absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-acento px-1 text-[11px] font-black text-acento-texto">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

/** Botão da barra do celular — link pra uma tela ou o "Mais". */
function BotaoBarra({
  href,
  aoClicar,
  rotulo,
  Icone,
  ativo,
  badge,
}: {
  href?: string;
  aoClicar?: () => void;
  rotulo: string;
  Icone: LucideIcon;
  ativo: boolean;
  badge: number;
}) {
  const classe = `relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pt-2 pb-2 text-[11px] font-semibold transition duration-200 active:scale-95 ${
    ativo ? "text-acento" : "text-texto-suave"
  }`;
  const conteudo = (
    <>
      {/* Risquinho em cima da aba ativa */}
      <span
        className={`absolute top-0 h-[3px] rounded-b-full bg-acento transition-all duration-300 ${
          ativo ? "w-8 opacity-100" : "w-0 opacity-0"
        }`}
        aria-hidden
      />
      <div
        className={`relative grid h-8 w-14 place-items-center rounded-full transition duration-300 ${
          ativo ? "bg-acento/12" : ""
        }`}
      >
        <Icone className="h-5 w-5" strokeWidth={ativo ? 2.5 : 2} />
        {badge > 0 && (
          <span className="absolute -top-0.5 right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-acento px-1 text-[9px] font-black text-acento-texto ring-2 ring-superficie">
            {badge}
          </span>
        )}
      </div>
      {rotulo}
    </>
  );
  return href ? (
    <Link href={href} className={classe} aria-current={ativo ? "page" : undefined}>
      {conteudo}
    </Link>
  ) : (
    <button type="button" onClick={aoClicar} className={classe}>
      {conteudo}
    </button>
  );
}

function BotaoSair({ aoSair }: { aoSair: () => Promise<void> }) {
  const [modalAberto, setModalAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalAberto(true)}
        className="grid h-9 w-9 place-items-center rounded-lg transition hover:bg-red-500/15 hover:text-red-300 active:scale-95"
        title="Sair"
        aria-label="Sair do sistema"
      >
        <LogOut className="h-[18px] w-[18px]" />
      </button>

      <Modal
        aberto={modalAberto}
        aoFechar={() => setModalAberto(false)}
        titulo="Sair do sistema"
        rodape={
          <>
            <button
              className="btn-secundario"
              onClick={() => setModalAberto(false)}
            >
              Cancelar
            </button>
            <button
              className="btn-perigo"
              onClick={() => {
                setModalAberto(false);
                void aoSair();
              }}
            >
              Sair
            </button>
          </>
        }
      >
        <p className="text-sm text-texto-suave">
          Tem certeza que deseja sair da sua conta?
        </p>
      </Modal>
    </>
  );
}

function AvisoDemonstracao() {
  return (
    <div className="nao-imprimir flex items-center justify-center gap-2 border-b border-acento/20 bg-acento/[.08] px-4 py-2 text-center text-xs text-texto-suave">
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-acento opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-acento" />
      </span>
      <span>
        <strong className="font-bold text-texto">Modo demonstração.</strong> Os dados estão
        salvos só neste navegador — configure o Firebase pra sincronizar entre
        celular e computador.
      </span>
    </div>
  );
}

/** Tela cheia de espera (login carregando / redirecionando). */
function TelaEspera({ texto }: { texto: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex animate-aparecer flex-col items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-acento/20 border-t-acento" />
        <p className="text-sm font-medium text-texto-suave">{texto}</p>
      </div>
    </div>
  );
}

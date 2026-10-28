"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Check,
  ClipboardList,
  HandCoins,
  PackagePlus,
  Receipt,
  ShoppingCart,
  X,
  type LucideIcon,
} from "lucide-react";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { firebaseConfigurado } from "@/lib/firebase";
import type { Permissoes } from "@/lib/types";

/*
 * O topo do Painel: as tarefas do dia a um toque e, enquanto a loja está
 * começando a usar o sistema, a lista de primeiros passos.
 */

const TAREFAS: {
  href: string;
  titulo: string;
  texto: string;
  Icone: LucideIcon;
  chave: keyof Permissoes;
  destaque?: boolean;
}[] = [
  { href: "/admin/vendas", titulo: "Vender", texto: "Balcão, paga na hora", Icone: ShoppingCart, chave: "vendas", destaque: true },
  { href: "/admin/comandas?nova=1", titulo: "Abrir comanda", texto: "Venda a prazo", Icone: ClipboardList, chave: "comandas" },
  { href: "/admin/comandas?aba=receber", titulo: "Receber fiado", texto: "Quem está devendo", Icone: HandCoins, chave: "comandas" },
  { href: "/admin/compras?nova=1", titulo: "Chegou mercadoria", texto: "Dar entrada da nota", Icone: PackagePlus, chave: "estoque" },
  { href: "/admin/gastos", titulo: "Lançar gasto", texto: "Mantimentos, carne, gelo…", Icone: Receipt, chave: "financeiro" },
];

export function TarefasDoDia() {
  const { permissoes } = useAuth();
  const tarefas = TAREFAS.filter((t) => permissoes[t.chave]);
  if (tarefas.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-5">
      {tarefas.map(({ href, titulo, texto, Icone, destaque }) => (
        <Link
          key={href}
          href={href}
          className={`flex flex-col items-start gap-2 rounded-2xl px-4 py-3.5 transition active:scale-[.98] sm:flex-row sm:items-center sm:gap-3 ${
            destaque
              ? "bg-acento text-acento-texto shadow-md shadow-acento/20 hover:brightness-110"
              : "card hover:border-acento"
          }`}
        >
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              destaque ? "bg-white/20" : "bg-acento/10 text-acento"
            }`}
          >
            <Icone className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block leading-tight font-bold">{titulo}</span>
            <span className={`block text-xs leading-tight ${destaque ? "text-white/80" : "text-texto-suave"}`}>
              {texto}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

const CHAVE_ESCONDIDO = "jardins:primeiros-passos-escondido";

export function PrimeirosPassos() {
  const { produtos, movimentos, vendas, usuarios, carregando } = useDados();
  const { ehAdmin } = useAuth();
  const [escondido, setEscondido] = useState(true);

  useEffect(() => {
    try {
      setEscondido(localStorage.getItem(CHAVE_ESCONDIDO) === "1");
    } catch {
      setEscondido(false);
    }
  }, []);

  if (carregando || escondido || !ehAdmin) return null;

  const comEstoque = produtos.filter((p) => p.ativo && !p.semEstoque);
  const comCusto = comEstoque.filter((p) => p.precoCusto > 0).length;
  const contou = movimentos.some(
    (m) => m.origem === "AJUSTE" && !(m.obs ?? "").startsWith("Estoque inicial"),
  );

  const passos = [
    {
      feito: produtos.length > 0,
      titulo: "Cadastrar os produtos",
      texto: "Produtos → Planilha → Sistema antigo traz os 548 de uma vez.",
      href: "/admin/produtos",
    },
    {
      feito: comEstoque.length > 0 && comCusto >= comEstoque.length / 2,
      titulo: "Informar o custo dos produtos",
      texto: `${comCusto} de ${comEstoque.length} têm custo. Sem custo, o lucro não aparece certo. Dá pra fazer pela planilha.`,
      href: "/admin/produtos",
    },
    {
      feito: contou,
      titulo: "Contar o estoque",
      texto: "Os produtos que estavam negativos no sistema antigo entraram com 0. Conte e corrija em Estoque → Contar estoque.",
      href: "/admin/estoque",
    },
    ...(firebaseConfigurado
      ? [
          {
            feito: usuarios.length > 0,
            titulo: "Criar o acesso da equipe",
            texto: "Cada funcionário com seu login e só o que ele precisa ver.",
            href: "/admin/equipe",
          },
        ]
      : []),
    {
      feito: vendas.length > 0,
      titulo: "Fazer a primeira venda",
      texto: "Em Vender: toque nos produtos, Cobrar e pronto.",
      href: "/admin/vendas",
    },
  ];

  const feitos = passos.filter((p) => p.feito).length;
  if (feitos === passos.length) return null;

  function esconder() {
    try {
      localStorage.setItem(CHAVE_ESCONDIDO, "1");
    } catch {
      // sem armazenamento: só esconde nesta visita
    }
    setEscondido(true);
  }

  return (
    <section className="card overflow-hidden border-acento/30">
      <div className="flex items-center gap-3 border-b border-borda bg-acento/5 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">Primeiros passos</h2>
          <p className="text-xs text-texto-suave">
            {feitos} de {passos.length} feitos — depois disso o sistema está pronto pro dia a dia.
          </p>
        </div>
        <button
          onClick={esconder}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-texto-suave hover:bg-superficie-2"
          aria-label="Esconder primeiros passos"
          title="Esconder"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <ol className="divide-y divide-borda">
        {passos.map((p, i) => (
          <li key={p.titulo}>
            <Link href={p.href} className="flex items-start gap-3 px-4 py-3 transition hover:bg-superficie-2">
              <span
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black ${
                  p.feito ? "bg-emerald-600 text-white" : "border-2 border-acento text-acento"
                }`}
              >
                {p.feito ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${p.feito ? "text-texto-suave line-through" : ""}`}>
                  {p.titulo}
                </span>
                {!p.feito && <span className="block text-xs text-texto-suave">{p.texto}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "Boa tarde · terça, 27 de outubro" */
export function saudacao(): string {
  const agora = new Date();
  const h = agora.getHours();
  const oi = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const data = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return `${oi} · ${data}`;
}

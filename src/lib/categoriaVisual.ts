import {
  Beef,
  Beer,
  IceCreamCone,
  UtensilsCrossed,
  Candy,
  Cigarette,
  Citrus,
  Coffee,
  CupSoda,
  Flame,
  GlassWater,
  Martini,
  Milk,
  Package,
  Popcorn,
  Snowflake,
  Wine,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { normalizar } from "./format";

/**
 * Ícone e cor de cada tipo de produto, pra achar a bebida de relance no
 * balcão. A categoria é texto livre (vem do sistema antigo), então casa por
 * palavra-chave; o que não casar fica com a caixinha neutra.
 *
 * As classes ficam escritas por extenso pra o Tailwind enxergar.
 */
export interface VisualCategoria {
  Icone: LucideIcon;
  /** Fundo + cor do ícone do quadradinho. */
  selo: string;
}

const REGRAS: [RegExp, VisualCategoria][] = [
  [/cerv|chop|beer|long ?neck/, { Icone: Beer, selo: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" }],
  [/refri|soda|cola|guarana/, { Icone: CupSoda, selo: "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300" }],
  [/energ/, { Icone: Zap, selo: "bg-lime-100 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300" }],
  [/agua/, { Icone: GlassWater, selo: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300" }],
  [/suco|nectar|isoton/, { Icone: Citrus, selo: "bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300" }],
  [/vinho|espumante|champ|sidra/, { Icone: Wine, selo: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300" }],
  [/destil|whisk|vodka|cacha|pinga|\bgin\b|\brum\b|tequila|licor|conhaque|\bdose|aperitivo|drink/, { Icone: Martini, selo: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" }],
  [/gelo/, { Icone: Snowflake, selo: "bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300" }],
  [/carv/, { Icone: Flame, selo: "bg-stone-200 text-stone-700 dark:bg-stone-400/15 dark:text-stone-300" }],
  [/tabac|cigar|fumo|seda|narg|isqueiro/, { Icone: Cigarette, selo: "bg-zinc-200 text-zinc-700 dark:bg-zinc-400/15 dark:text-zinc-300" }],
  [/doce|bala|chocol|bombon|chiclete/, { Icone: Candy, selo: "bg-pink-100 text-pink-700 dark:bg-pink-400/15 dark:text-pink-300" }],
  [/sorvet|acai|picole/, { Icone: IceCreamCone, selo: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-300" }],
  [/carne|espet|churrasc|picanha|fraldinha|cupim/, { Icone: Beef, selo: "bg-red-200 text-red-900 dark:bg-red-300/15 dark:text-red-200" }],
  [/porc|prato|refeic/, { Icone: UtensilsCrossed, selo: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" }],
  [/salgad|petisc|snack|amendo|batata/, { Icone: Popcorn, selo: "bg-yellow-100 text-yellow-700 dark:bg-yellow-400/15 dark:text-yellow-300" }],
  [/leite|latic|iogur/, { Icone: Milk, selo: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" }],
  [/cafe|cha\b/, { Icone: Coffee, selo: "bg-orange-200 text-orange-900 dark:bg-orange-300/15 dark:text-orange-200" }],
];

const PADRAO: VisualCategoria = {
  Icone: Package,
  selo: "bg-superficie-2 text-texto-suave",
};

const cache = new Map<string, VisualCategoria>();

export function visualCategoria(categoria: string, nomeProduto = ""): VisualCategoria {
  const chave = `${categoria}|${nomeProduto}`;
  const salvo = cache.get(chave);
  if (salvo) return salvo;
  // Primeiro a categoria; se ela for genérica ("Diversos"), tenta pelo nome.
  const alvo = normalizar(categoria);
  const nome = normalizar(nomeProduto);
  const achado =
    REGRAS.find(([re]) => re.test(alvo))?.[1] ??
    REGRAS.find(([re]) => re.test(nome))?.[1] ??
    PADRAO;
  cache.set(chave, achado);
  return achado;
}

/** Cores do semáforo do estoque (ver nivelEstoque em calc.ts). */
export const COR_NIVEL: Record<"zerado" | "baixo" | "ok", { ponto: string; texto: string }> = {
  zerado: { ponto: "bg-red-500", texto: "text-red-600 dark:text-red-400" },
  baixo: { ponto: "bg-amber-500", texto: "text-amber-600 dark:text-amber-400" },
  ok: { ponto: "bg-emerald-500", texto: "text-texto-suave" },
};

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Armchair,
  Beef,
  Beer,
  ChefHat,
  Clock,
  ConciergeBell,
  Flame,
  MapPin,
  MessageCircle,
  Minus,
  Music,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Snowflake,
  Trash2,
  Tv,
  Wine,
  X,
} from "lucide-react";
import { Logo, LogoMarca } from "@/components/Logo";
import { TemaBotao } from "@/components/TemaBotao";
import { ProdutoImagem } from "@/components/ProdutoImagem";
import { Modal } from "@/components/ui";
import { observarCatalogo, type Catalogo, type ItemCatalogo } from "@/lib/catalogo";
import { visualCategoria } from "@/lib/categoriaVisual";
import { EMPRESA } from "@/lib/empresa";
import { brl, normalizar } from "@/lib/format";

const LINK_MAPA = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${EMPRESA.nome}, ${EMPRESA.endereco}, ${EMPRESA.cidade}`,
)}`;

function linkWhatsApp(texto: string) {
  return `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(texto)}`;
}

const DESTAQUES = [
  { Icone: Beer, texto: "Cerveja estupidamente gelada" },
  { Icone: Tv, texto: "Jogos de futebol no telão" },
  { Icone: Music, texto: "Música ao vivo" },
  { Icone: Flame, texto: "Churrasco à bafo nos fins de semana" },
];

const SERVICOS_FESTA = [
  { Icone: Beer, titulo: "Bebidas", texto: "Cervejas, refrigerantes, águas e energéticos" },
  { Icone: Wine, titulo: "Destilados e vinhos", texto: "Whisky, vodka, gin, cachaças e espumantes" },
  { Icone: Snowflake, titulo: "Gelo e caixas térmicas", texto: "Gelo filtrado e em escama, caixas pra gelar" },
  { Icone: Armchair, titulo: "Mesas e cadeiras", texto: "Aluguel de jogos de mesa e cadeiras" },
  { Icone: Beef, titulo: "Carnes", texto: "Picanha, fraldinha, cupim, espetinhos e mais" },
  { Icone: ChefHat, titulo: "Churrasqueiro", texto: "Profissional pra cuidar da brasa" },
  { Icone: ConciergeBell, titulo: "Garçons", texto: "Equipe pra servir seus convidados" },
];

const CHAVE_PEDIDO = "jardins:pedido-catalogo";

export default function CatalogoPage() {
  const [catalogo, setCatalogo] = useState<Catalogo | null | undefined>(undefined);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [mostrarEmFalta, setMostrarEmFalta] = useState(false);
  const [pedido, setPedido] = useState<Record<string, number>>({});
  const [vendoPedido, setVendoPedido] = useState(false);

  useEffect(() => observarCatalogo(setCatalogo), []);

  // O pedido em andamento sobrevive a recarregar a página (só neste aparelho).
  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_PEDIDO);
      if (salvo) setPedido(JSON.parse(salvo));
    } catch {
      // sem armazenamento: o pedido vale só nesta visita
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_PEDIDO, JSON.stringify(pedido));
    } catch {
      // idem
    }
  }, [pedido]);

  const itens = useMemo(() => catalogo?.itens ?? [], [catalogo]);
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const categorias = useMemo(() => [...new Set(itens.map((i) => i.categoria))], [itens]);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return itens.filter(
      (i) =>
        (mostrarEmFalta || i.disponivel) &&
        (!categoria || i.categoria === categoria) &&
        (!termo || normalizar(i.nome).includes(termo) || normalizar(i.categoria).includes(termo)),
    );
  }, [itens, busca, categoria, mostrarEmFalta]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, ItemCatalogo[]>();
    for (const i of visiveis) mapa.set(i.categoria, [...(mapa.get(i.categoria) ?? []), i]);
    return [...mapa.entries()];
  }, [visiveis]);

  const linhasPedido = Object.entries(pedido)
    .map(([id, qtd]) => ({ item: porId.get(id), qtd }))
    .filter((l): l is { item: ItemCatalogo; qtd: number } => !!l.item && l.qtd > 0);
  const qtdPedido = linhasPedido.reduce((s, l) => s + l.qtd, 0);
  const totalPedido = linhasPedido.reduce((s, l) => s + l.qtd * l.item.precoUn, 0);

  function mudar(id: string, delta: number) {
    setPedido((p) => {
      const qtd = Math.max(0, (p[id] ?? 0) + delta);
      const novo = { ...p };
      if (qtd === 0) delete novo[id];
      else novo[id] = qtd;
      return novo;
    });
  }

  return (
    <div className="min-h-dvh bg-fundo text-texto">
      {/* Topo fixo */}
      <header className="fundo-barra sticky top-0 z-30 border-b border-black/30 text-barra-texto shadow-[0_4px_20px_-8px_rgb(0_0_0/0.45)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <a href="#inicio" className="text-lg">
            <LogoMarca />
          </a>
          <nav className="ml-4 hidden gap-5 text-sm font-semibold text-barra-texto/70 md:flex">
            <a href="#produtos" className="hover:text-barra-texto">Produtos</a>
            <a href="#festas" className="hover:text-barra-texto">Festas e eventos</a>
            <a href="#onde" className="hover:text-barra-texto">Onde estamos</a>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <TemaBotao />
            <a
              href={linkWhatsApp(`Olá, ${EMPRESA.nome}! Vim pelo site.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 items-center gap-1.5 rounded-full bg-[#25D366] px-3.5 text-sm font-bold text-white shadow-md transition hover:brightness-110"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
          </div>
        </div>
      </header>

      {/* Apresentação */}
      <section id="inicio" className="relative isolate overflow-hidden bg-barra text-barra-texto">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-20 h-80 w-80 rounded-full bg-acento/30 blur-3xl" />
          <div className="absolute -right-24 -bottom-32 h-80 w-80 rounded-full bg-chope/20 blur-3xl" />
        </div>
        <div className="mx-auto flex max-w-5xl flex-col items-center px-4 pt-10 pb-12 text-center md:flex-row md:gap-12 md:py-16 md:text-left">
          <Logo className="animate-entrar h-32 w-auto shrink-0 md:order-2 md:h-48" />
          <div className="mt-6 md:mt-0 md:flex-1">
            <p className="animate-entrar text-xs font-bold tracking-[0.25em] text-acento-claro uppercase" style={{ animationDelay: "60ms" }}>
              Depósito de bebidas · Bar · Eventos
            </p>
            <h1 className="animate-entrar mt-3 text-3xl leading-tight font-black tracking-tight text-espuma md:text-5xl" style={{ animationDelay: "120ms" }}>
              Bebida gelada e tudo <span className="texto-degrade">pra sua festa.</span>
            </h1>
            <p className="animate-entrar mt-3 text-[15px] text-barra-texto/75 md:text-lg" style={{ animationDelay: "180ms" }}>
              Cervejas, destilados, vinhos, gelo e carvão no Parque Cidade Jardim, em Campos dos Goytacazes.
              Escolha aqui e peça pelo WhatsApp.
            </p>
            <div className="animate-entrar mt-6 flex flex-col gap-2 sm:flex-row md:justify-start" style={{ animationDelay: "240ms" }}>
              <a href="#produtos" className="btn-primario h-12 px-6 text-base">
                <ShoppingBag className="h-5 w-5" />
                Ver produtos
              </a>
              <a
                href={linkWhatsApp(`Olá, ${EMPRESA.nome}! Gostaria de fazer um pedido.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 text-base font-bold text-white shadow-lg transition hover:brightness-110"
              >
                <MessageCircle className="h-5 w-5" />
                Pedir no WhatsApp
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 bg-black/15">
          <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 md:grid-cols-4">
            {DESTAQUES.map(({ Icone, texto }) => (
              <li key={texto} className="flex items-center gap-2.5 text-sm font-semibold text-barra-texto/85">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-acento-claro">
                  <Icone className="h-4 w-4" />
                </span>
                <span className="leading-tight">{texto}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Produtos */}
      <section id="produtos" className="mx-auto max-w-5xl scroll-mt-14 px-4 pt-10 pb-6">
        <div className="mb-4">
          <h2 className="text-2xl font-black tracking-tight">Nossos produtos</h2>
          <p className="mt-1 text-sm text-texto-suave">
            Toque no <strong>+</strong> pra montar seu pedido e enviar pelo WhatsApp.
          </p>
        </div>

        {/* Busca + categorias, grudadas no topo ao rolar */}
        <div className="sticky top-14 z-20 -mx-4 bg-fundo/95 px-4 pt-2 pb-3 backdrop-blur">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-[18px] w-[18px] -translate-y-1/2 text-texto-suave" />
            <input
              className="campo h-12 pr-10 pl-11 text-base"
              placeholder="Buscar: Heineken, gelo, vinho…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              enterKeyHint="search"
            />
            {busca && (
              <button
                onClick={() => setBusca("")}
                className="absolute top-1/2 right-2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-texto-suave hover:bg-superficie-2"
                aria-label="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="-mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {["", ...categorias].map((c) => {
              const ativo = categoria === c;
              const { Icone } = visualCategoria(c);
              return (
                <button
                  key={c || "todas"}
                  onClick={() => setCategoria(c)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                    ativo
                      ? "bg-acento text-acento-texto shadow-md"
                      : "border border-borda bg-superficie text-texto-suave hover:bg-superficie-2"
                  }`}
                >
                  {c && <Icone className="h-3.5 w-3.5" />}
                  {c || "Todos"}
                </button>
              );
            })}
          </div>
        </div>

        {catalogo === undefined ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="card h-[76px] animate-pulse bg-superficie-2" />
            ))}
          </div>
        ) : catalogo === null || itens.length === 0 ? (
          <div className="card px-6 py-10 text-center">
            <p className="font-bold">O catálogo está sendo atualizado.</p>
            <p className="mt-1 text-sm text-texto-suave">Enquanto isso, chama a gente no WhatsApp que a gente te passa tudo.</p>
            <a
              href={linkWhatsApp(`Olá, ${EMPRESA.nome}! Quais produtos vocês têm hoje?`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#25D366] px-5 font-bold text-white"
            >
              <MessageCircle className="h-4 w-4" /> {EMPRESA.telefone}
            </a>
          </div>
        ) : grupos.length === 0 ? (
          <p className="py-10 text-center text-sm text-texto-suave">Nenhum produto encontrado com “{busca}”.</p>
        ) : (
          <div className="space-y-8">
            {grupos.map(([cat, lista]) => (
              <div key={cat}>
                {!categoria && (
                  <h3 className="mb-2.5 flex items-center gap-2 text-sm font-black tracking-wide text-texto-suave uppercase">
                    {cat}
                    <span className="text-xs font-semibold normal-case">({lista.length})</span>
                  </h3>
                )}
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {lista.map((i) => (
                    <CartaoItem key={i.id} item={i} qtd={pedido[i.id] ?? 0} aoMudar={(d) => mudar(i.id, d)} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {itens.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-texto-suave">
            <button
              onClick={() => setMostrarEmFalta((v) => !v)}
              className="font-semibold text-acento underline-offset-4 hover:underline"
            >
              {mostrarEmFalta ? "Esconder os produtos em falta" : "Mostrar também os produtos em falta"}
            </button>
            <p>Preços sujeitos a alteração. Confirme a disponibilidade ao fazer o pedido.</p>
          </div>
        )}
      </section>

      {/* Festas e eventos */}
      <section id="festas" className="scroll-mt-14 bg-superficie-2/60 py-12">
        <div className="mx-auto max-w-5xl px-4">
          <p className="text-xs font-bold tracking-[0.2em] text-acento uppercase">Festas e eventos</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">A gente cuida da sua festa</h2>
          <p className="mt-2 max-w-2xl text-[15px] text-texto-suave">
            Aniversário, confraternização ou churrasco com os amigos: a gente fornece tudo e você só aproveita.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICOS_FESTA.map(({ Icone, titulo, texto }) => (
              <li key={titulo} className="card flex items-start gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-acento/10 text-acento">
                  <Icone className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-bold">{titulo}</span>
                  <span className="block text-sm text-texto-suave">{texto}</span>
                </span>
              </li>
            ))}
          </ul>
          <a
            href={linkWhatsApp(
              `Olá, ${EMPRESA.nome}! Quero um orçamento pra uma festa.\n\nData:\nQuantidade de pessoas:\nO que vou precisar:`,
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-[#25D366] px-6 text-base font-bold text-white shadow-lg transition hover:brightness-110"
          >
            <MessageCircle className="h-5 w-5" />
            Pedir orçamento da festa
          </a>
        </div>
      </section>

      {/* Onde estamos */}
      <section id="onde" className="mx-auto max-w-5xl scroll-mt-14 px-4 py-12">
        <h2 className="text-2xl font-black tracking-tight">Onde estamos</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <a href={LINK_MAPA} target="_blank" rel="noopener noreferrer" className="card flex items-start gap-3 p-4 transition hover:border-acento">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-acento/10 text-acento">
              <MapPin className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-bold">{EMPRESA.endereco}</span>
              <span className="block text-sm text-texto-suave">{EMPRESA.cidade}</span>
              <span className="mt-1 block text-sm font-bold text-acento">Abrir no mapa →</span>
            </span>
          </a>
          <a href={`tel:+${EMPRESA.whatsapp}`} className="card flex items-start gap-3 p-4 transition hover:border-acento">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-acento/10 text-acento">
              <Phone className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-bold">{EMPRESA.telefone}</span>
              <span className="block text-sm text-texto-suave">Telefone e WhatsApp</span>
              <span className="mt-1 block text-sm font-bold text-acento">Ligar agora →</span>
            </span>
          </a>
          <div className="card flex items-start gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-acento/10 text-acento">
              <Clock className="h-5 w-5" />
            </span>
            <span>
              <span className="block font-bold">Pedidos e reservas</span>
              <span className="block text-sm text-texto-suave">Pelo telefone ou WhatsApp. Churrasco à bafo nos fins de semana.</span>
            </span>
          </div>
        </div>
      </section>

      <footer className="fundo-barra px-4 pt-8 pb-28 text-center text-barra-texto/60">
        <Logo className="mx-auto h-16 w-auto opacity-90" />
        <p className="mt-4 text-xs font-bold text-barra-texto/80">
          Venda proibida para menores de 18 anos. Se beber, não dirija.
        </p>
        <p className="mt-1 text-xs">© {new Date().getFullYear()} {EMPRESA.nome} · {EMPRESA.cidade}</p>
      </footer>

      {/* Barra do pedido */}
      {qtdPedido > 0 && (
        <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto max-w-md">
          <button
            onClick={() => setVendoPedido(true)}
            className="animate-surgir flex w-full items-center gap-3 rounded-2xl bg-acento px-4 py-3.5 text-acento-texto shadow-2xl"
          >
            <span key={qtdPedido} className="animate-pop grid h-9 w-9 place-items-center rounded-xl bg-black/15">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <span className="flex-1 text-left text-sm font-bold">
              Ver meu pedido · {qtdPedido} {qtdPedido === 1 ? "item" : "itens"}
            </span>
            <span className="text-lg font-black tabular-nums">{brl(totalPedido)}</span>
          </button>
        </div>
      )}

      <ModalPedido
        aberto={vendoPedido}
        aoFechar={() => setVendoPedido(false)}
        linhas={linhasPedido}
        total={totalPedido}
        aoMudar={mudar}
        aoLimpar={() => {
          setPedido({});
          setVendoPedido(false);
        }}
      />
    </div>
  );
}

function CartaoItem({
  item,
  qtd,
  aoMudar,
}: {
  item: ItemCatalogo;
  qtd: number;
  aoMudar: (delta: number) => void;
}) {
  const { Icone, selo } = visualCategoria(item.categoria, item.nome);
  const icone = (
    <span className={`grid h-full w-full place-items-center rounded-xl ${selo}`}>
      <Icone className="h-6 w-6" />
    </span>
  );
  const caixa = item.unPorCaixa > 1;

  return (
    <li
      className={`card flex items-center gap-3 p-3 transition ${
        qtd > 0 ? "border-acento ring-2 ring-acento/15" : ""
      } ${item.disponivel ? "" : "opacity-60"}`}
    >
      <span className="h-14 w-14 shrink-0">
        {item.imagemUrl ? (
          <span className="block h-full w-full overflow-hidden rounded-xl bg-white ring-1 ring-borda">
            <ProdutoImagem
              src={item.imagemUrl}
              alt={item.nome}
              width={56}
              height={56}
              className="h-full w-full object-contain p-1"
              fallback={icone}
            />
          </span>
        ) : (
          icone
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm leading-tight font-semibold">{item.nome}</span>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="font-black text-acento tabular-nums">{brl(item.precoUn)}</span>
          {caixa && (
            <span className="text-[11px] font-semibold text-texto-suave tabular-nums">
              cx {item.unPorCaixa}: {brl(item.precoUn * item.unPorCaixa)}
            </span>
          )}
        </span>
        {!item.disponivel && (
          <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300">
            Em falta
          </span>
        )}
      </span>

      {item.disponivel &&
        (qtd === 0 ? (
          <button
            onClick={() => aoMudar(1)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-acento text-acento-texto shadow-md transition active:scale-90"
            aria-label={`Adicionar ${item.nome}`}
          >
            <Plus className="h-5 w-5" />
          </button>
        ) : (
          <span className="flex shrink-0 flex-col items-center gap-1">
            <span className="flex items-center gap-1">
              <button
                onClick={() => aoMudar(-1)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-borda transition active:scale-90"
                aria-label={`Tirar um ${item.nome}`}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span key={qtd} className="animate-pop w-7 text-center font-black tabular-nums">
                {qtd}
              </span>
              <button
                onClick={() => aoMudar(1)}
                className="grid h-9 w-9 place-items-center rounded-lg bg-acento text-acento-texto transition active:scale-90"
                aria-label={`Mais um ${item.nome}`}
              >
                <Plus className="h-4 w-4" />
              </button>
            </span>
            {caixa && (
              <button
                onClick={() => aoMudar(item.unPorCaixa)}
                className="text-[11px] font-black text-acento"
              >
                +1 caixa
              </button>
            )}
          </span>
        ))}
    </li>
  );
}

function ModalPedido({
  aberto,
  aoFechar,
  linhas,
  total,
  aoMudar,
  aoLimpar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  linhas: { item: ItemCatalogo; qtd: number }[];
  total: number;
  aoMudar: (id: string, delta: number) => void;
  aoLimpar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [entrega, setEntrega] = useState<"retirar" | "entregar">("retirar");
  const [endereco, setEndereco] = useState("");

  const mensagem = [
    `Olá, ${EMPRESA.nome}! Gostaria de fazer um pedido:`,
    "",
    ...linhas.map(({ item, qtd }) => {
      const cx =
        item.unPorCaixa > 1 && qtd >= item.unPorCaixa
          ? ` (${Math.floor(qtd / item.unPorCaixa)} cx${qtd % item.unPorCaixa ? ` + ${qtd % item.unPorCaixa} un` : ""})`
          : "";
      return `• ${qtd}x ${item.nome}${cx} — ${brl(qtd * item.precoUn)}`;
    }),
    "",
    `Total estimado: ${brl(total)}`,
    nome.trim() && `Nome: ${nome.trim()}`,
    entrega === "retirar" ? "Vou retirar no local." : `Entregar em: ${endereco.trim() || "(vou passar o endereço)"}`,
  ]
    .filter(Boolean)
    .join("\n")
    // Recoloca as linhas em branco entre os blocos.
    .replace(":\n•", ":\n\n•")
    .replace("\nTotal", "\n\nTotal");

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Meu pedido">
      {linhas.length === 0 ? (
        <p className="py-6 text-center text-sm text-texto-suave">Seu pedido está vazio.</p>
      ) : (
        <div className="space-y-4">
          <ul className="-mx-5 divide-y divide-borda border-y border-borda">
            {linhas.map(({ item, qtd }) => (
              <li key={item.id} className="flex items-center gap-2 px-5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.nome}</span>
                  <span className="block text-xs text-texto-suave tabular-nums">
                    {brl(item.precoUn)} · {brl(qtd * item.precoUn)}
                  </span>
                </span>
                <button
                  onClick={() => aoMudar(item.id, -1)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-borda"
                  aria-label={`Tirar um ${item.nome}`}
                >
                  {qtd === 1 ? <Trash2 className="h-3.5 w-3.5 text-red-600" /> : <Minus className="h-3.5 w-3.5" />}
                </button>
                <span className="w-7 text-center text-sm font-black tabular-nums">{qtd}</span>
                <button
                  onClick={() => aoMudar(item.id, 1)}
                  className="grid h-8 w-8 place-items-center rounded-lg border border-borda"
                  aria-label={`Mais um ${item.nome}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-baseline justify-between">
            <span className="text-sm text-texto-suave">Total estimado</span>
            <span className="text-2xl font-black text-acento tabular-nums">{brl(total)}</span>
          </div>

          <div>
            <label className="rotulo" htmlFor="ped-nome">Seu nome</label>
            <input
              id="ped-nome"
              className="campo h-11 text-base"
              placeholder="Opcional"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(["retirar", "entregar"] as const).map((op) => (
              <button
                key={op}
                onClick={() => setEntrega(op)}
                className={`h-11 rounded-xl border text-sm font-bold transition ${
                  entrega === op ? "border-acento bg-acento/10 text-acento" : "border-borda text-texto-suave"
                }`}
              >
                {op === "retirar" ? "Vou retirar" : "Quero entrega"}
              </button>
            ))}
          </div>
          {entrega === "entregar" && (
            <div className="animate-aparecer">
              <label className="rotulo" htmlFor="ped-end">Endereço de entrega</label>
              <input
                id="ped-end"
                className="campo h-11 text-base"
                placeholder="Rua, número, bairro"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                autoComplete="street-address"
              />
            </div>
          )}

          <a
            href={linkWhatsApp(mensagem)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-base font-bold text-white shadow-lg transition hover:brightness-110"
          >
            <MessageCircle className="h-5 w-5" />
            Enviar pedido pelo WhatsApp
          </a>
          <p className="text-center text-[11px] text-texto-suave">
            O pedido só é confirmado quando a gente responder no WhatsApp.
          </p>
          <button onClick={aoLimpar} className="w-full text-center text-xs font-semibold text-texto-suave hover:text-red-600">
            Limpar pedido
          </button>
        </div>
      )}
    </Modal>
  );
}

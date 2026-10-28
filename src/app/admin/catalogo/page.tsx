"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff, MessageCircle } from "lucide-react";
import { Cabecalho } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { useDados } from "@/lib/store";
import { CATEGORIAS_FORA_DO_CATALOGO, entraNoCatalogo } from "@/lib/catalogo";
import { visualCategoria } from "@/lib/categoriaVisual";
import { compararCategorias } from "@/lib/calc";
import { EMPRESA } from "@/lib/empresa";
import type { Produto } from "@/lib/types";

export default function CatalogoAdminPage() {
  return (
    <Protegido chave="produtos">
      <CatalogoAdmin />
    </Protegido>
  );
}

function CatalogoAdmin() {
  const { produtos, atualizarProduto } = useDados();
  const [copiado, setCopiado] = useState(false);
  const [gravando, setGravando] = useState<string | null>(null);

  const link = typeof window === "undefined" ? "/catalogo" : `${window.location.origin}/catalogo`;

  const categorias = useMemo(() => {
    const mapa = new Map<string, Produto[]>();
    for (const p of produtos) {
      if (!p.ativo) continue;
      const c = p.categoria || "Outros";
      mapa.set(c, [...(mapa.get(c) ?? []), p]);
    }
    return [...mapa.entries()].sort(([a], [b]) => compararCategorias(a, b));
  }, [produtos]);

  const naVitrine = produtos.filter(entraNoCatalogo).length;

  /** Liga/desliga "aparece no catálogo" — grava só esse campo, nunca o estoque. */
  async function marcar(lista: Produto[], visivel: boolean, chave: string) {
    setGravando(chave);
    try {
      const mudar = lista.filter((p) => p.visivelCatalogo !== visivel);
      for (let i = 0; i < mudar.length; i += 20) {
        await Promise.all(
          mudar.slice(i, i + 20).map((p) => atualizarProduto(p.id, { visivelCatalogo: visivel })),
        );
      }
    } finally {
      setGravando(null);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sem permissão de área de transferência: o link continua à vista
    }
  }

  const permitidas = categorias.filter(([c]) => !CATEGORIAS_FORA_DO_CATALOGO.includes(c));

  return (
    <>
      <Cabecalho
        titulo="Catálogo"
        subtitulo={`${naVitrine} produto(s) à mostra para os clientes`}
      />

      <div className="space-y-5 px-4 pb-6 md:px-6">
        <section className="card space-y-3 p-4">
          <div>
            <h2 className="font-bold">Link para os clientes</h2>
            <p className="text-sm text-texto-suave">
              Mande no WhatsApp, coloque na bio do Instagram ou imprima num QR code. O cliente vê os
              produtos e preços, monta o pedido e ele chega no WhatsApp da loja.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-borda bg-superficie-2 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{link}</span>
            <button onClick={copiar} className="btn-secundario h-9 shrink-0 px-3 text-xs">
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/catalogo" target="_blank" rel="noopener noreferrer" className="btn-secundario">
              <ExternalLink className="h-4 w-4" />
              Abrir como cliente
            </a>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Confira os produtos da ${EMPRESA.nome} e faça seu pedido: ${link}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secundario"
            >
              <MessageCircle className="h-4 w-4" />
              Compartilhar no WhatsApp
            </a>
          </div>
          <p className="text-xs text-texto-suave">
            Preço, nome, foto e “em falta” atualizam sozinhos uns segundos depois de qualquer mudança.
            Custo e quantidade em estoque nunca aparecem para o cliente.
          </p>
        </section>

        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">O que aparece no catálogo</h2>
              <p className="text-xs text-texto-suave">Por categoria. Produto a produto, use a tela Produtos.</p>
            </div>
            <button
              className="btn-primario h-9 px-3 text-xs"
              disabled={gravando !== null}
              onClick={() => marcar(permitidas.flatMap(([, l]) => l), true, "todas")}
            >
              <Eye className="h-4 w-4" />
              {gravando === "todas" ? "Gravando…" : "Mostrar tudo"}
            </button>
          </div>
          <ul className="divide-y divide-borda">
            {categorias.map(([cat, lista]) => {
              const bloqueada = CATEGORIAS_FORA_DO_CATALOGO.includes(cat);
              const visiveis = lista.filter((p) => p.visivelCatalogo).length;
              const { Icone, selo } = visualCategoria(cat);
              const tudo = visiveis === lista.length;
              return (
                <li key={cat} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${selo}`}>
                    <Icone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{cat}</span>
                    <span className="block text-xs text-texto-suave">
                      {bloqueada
                        ? cat === "Tabacaria"
                          ? "Não pode ser anunciado (lei antifumo)"
                          : "Uso interno — não vai pro catálogo"
                        : `${visiveis} de ${lista.length} à mostra`}
                    </span>
                  </span>
                  {!bloqueada && (
                    <button
                      disabled={gravando !== null}
                      onClick={() => marcar(lista, !tudo, cat)}
                      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${
                        tudo
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "border border-borda text-texto-suave hover:bg-superficie-2"
                      }`}
                    >
                      {gravando === cat ? (
                        "Gravando…"
                      ) : tudo ? (
                        <>
                          <Eye className="h-3.5 w-3.5" /> À mostra
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-3.5 w-3.5" /> {visiveis ? "Mostrar todos" : "Escondida"}
                        </>
                      )}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

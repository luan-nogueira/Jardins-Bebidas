"use client";

import { useEffect, useMemo, useState } from "react";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { firebaseConfigurado } from "@/lib/firebase";
import {
  assinaturaCatalogo,
  montarCatalogo,
  observarCatalogo,
  publicarCatalogo,
} from "@/lib/catalogo";

/**
 * Mantém a vitrine pública (publico/catalogo) igual aos produtos. Roda no
 * aparelho de quem está logado e só grava quando algo que o cliente vê
 * mudou — preço, nome, foto ou acabou/voltou. Vender sem zerar o estoque
 * não gera gravação nenhuma.
 */
export function SincronizarCatalogo() {
  const { produtos, carregando } = useDados();
  const { usuario, permissoes } = useAuth();
  // undefined = ainda não sabe o que está publicado; não grava antes disso.
  const [publicado, setPublicado] = useState<string | undefined>(undefined);

  // Mesmas permissões que a regra do Firestore exige pra gravar a vitrine.
  const podePublicar =
    firebaseConfigurado &&
    !!usuario &&
    (permissoes.produtos || permissoes.estoque || permissoes.vendas || permissoes.comandas);

  useEffect(() => {
    if (!podePublicar) return;
    return observarCatalogo((c) => setPublicado(c ? assinaturaCatalogo(c.itens) : undefined));
  }, [podePublicar]);

  const itens = useMemo(() => montarCatalogo(produtos), [produtos]);
  const assinatura = useMemo(() => assinaturaCatalogo(itens), [itens]);

  useEffect(() => {
    // produtos vazio = ainda carregando ou falhou a leitura: publicar agora
    // apagaria a vitrine inteira.
    if (!podePublicar || carregando || produtos.length === 0) return;
    if (publicado === undefined || publicado === assinatura) return;
    // Espera a poeira baixar (importação, várias vendas seguidas).
    const t = setTimeout(() => {
      publicarCatalogo(itens).catch((e) => console.error("[catalogo] falha ao publicar:", e));
    }, 2500);
    return () => clearTimeout(t);
  }, [podePublicar, carregando, produtos.length, publicado, assinatura, itens]);

  return null;
}

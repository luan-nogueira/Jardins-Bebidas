"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import type { Permissoes } from "@/lib/types";

/**
 * Bloqueia o acesso à página se o usuário logado não tiver a permissão —
 * segunda camada de defesa (a primeira é o menu já não mostrar o link, mas
 * isso não impede alguém de digitar a URL direto).
 */
export function Protegido({
  chave,
  children,
}: {
  chave: keyof Permissoes;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { permissoes, carregando } = useAuth();
  const permitido = permissoes[chave];

  useEffect(() => {
    if (!carregando && !permitido) router.replace("/admin");
  }, [carregando, permitido, router]);

  if (carregando || !permitido) return null;
  return <>{children}</>;
}

/** Igual, mas só pra quem é dono do sistema (não dá pra configurar via permissão). */
export function SomenteAdmin({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ehAdmin, carregando } = useAuth();

  useEffect(() => {
    if (!carregando && !ehAdmin) router.replace("/admin");
  }, [carregando, ehAdmin, router]);

  if (carregando || !ehAdmin) return null;
  return <>{children}</>;
}

import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";

// Manifest próprio pra seção /admin — assim "adicionar à tela inicial"
// daqui abre direto no painel, não na tabela de preços pública.
export const metadata: Metadata = {
  manifest: "/manifest-admin.webmanifest",
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}

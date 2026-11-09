import type { Metadata } from "next";
import { GarcomShell } from "@/components/GarcomShell";

// Manifest próprio: "adicionar à tela inicial" a partir daqui instala o app
// do garçom, que abre direto nas mesas.
export const metadata: Metadata = {
  title: "Jardins — Garçom",
  description: "Mesas e pedidos da Jardins Bebidas.",
  manifest: "/manifest-garcom.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Garçom",
    statusBarStyle: "black-translucent",
  },
};

export default function GarcomLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <GarcomShell>{children}</GarcomShell>;
}

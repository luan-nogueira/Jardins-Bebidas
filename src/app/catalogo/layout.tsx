import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jardins Bebidas — Bebidas, gelo e tudo pra sua festa",
  description:
    "Cerveja gelada, destilados, vinhos, gelo e carvão em Campos dos Goytacazes. Veja os produtos e faça seu pedido pelo WhatsApp.",
  openGraph: {
    title: "Jardins Bebidas",
    description: "Veja nossos produtos e peça pelo WhatsApp: (22) 99609-6383.",
    locale: "pt_BR",
    type: "website",
  },
};

export default function CatalogoLayout({ children }: { children: React.ReactNode }) {
  return children;
}

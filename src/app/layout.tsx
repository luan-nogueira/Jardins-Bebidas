import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { SCRIPT_TEMA } from "@/components/TemaBotao";
import { DadosProvider } from "@/lib/store";
import { AuthProvider } from "@/lib/auth";
import { PwaRegistry } from "@/components/PwaRegistry";
import { RecuperarErroDeChunk } from "@/components/RecuperarErroDeChunk";
import { AvisoNovaVersao } from "@/components/AvisoNovaVersao";
import { AvisoGravacao } from "@/components/AvisoGravacao";
import Script from "next/script";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Jardins Bebidas — Sistema",
  description:
    "Vendas, comandas, estoque e financeiro da Jardins Bebidas.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Jardins",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#4a230f",
  // Sem isso, o iOS dá zoom sozinho ao focar num input de quantidade.
  maximumScale: 1,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
      </head>
      <body className={inter.variable}>
        <PwaRegistry />
        <RecuperarErroDeChunk />
        <AvisoNovaVersao />
        <AvisoGravacao />
        <Script id="tema-script" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        <AuthProvider>
          <DadosProvider>
            {children}
          </DadosProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LogOut, Share, X } from "lucide-react";
import { LogoMarca } from "./Logo";
import { TemaBotao } from "./TemaBotao";
import { Modal } from "./ui";
import { useAuth } from "@/lib/auth";
import { useDados } from "@/lib/store";

/**
 * Casca do app do garçom (/garcom): sem o menu do sistema — só o topo com
 * o nome de quem está logado, o botão de instalar e o de sair.
 */
export function GarcomShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { usuario, perfil, carregando, exigeLogin, sair, permissoes } = useAuth();
  const { modoDemonstracao } = useDados();
  const [saindo, setSaindo] = useState(false);

  const precisaEntrar = exigeLogin && !carregando && !usuario;

  useEffect(() => {
    if (precisaEntrar) router.replace("/login?volta=/garcom");
  }, [precisaEntrar, router]);

  if ((exigeLogin && carregando) || precisaEntrar) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-acento/20 border-t-acento" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-8">
      <header className="fundo-barra sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-black/30 px-4 pt-[env(safe-area-inset-top)] text-barra-texto shadow-[0_4px_20px_-8px_rgb(0_0_0/0.45)]">
        <span className="text-lg">
          <LogoMarca />
        </span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase">
          Garçom
        </span>
        <span className="ml-auto max-w-[35vw] truncate text-xs text-barra-texto/70">
          {perfil?.nome || usuario?.email || ""}
        </span>
        <BotaoInstalar />
        <TemaBotao />
        {exigeLogin && (
          <button
            type="button"
            onClick={() => setSaindo(true)}
            className="grid h-9 w-9 place-items-center rounded-lg transition hover:bg-red-500/15 hover:text-red-300"
            aria-label="Sair"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        )}
      </header>

      {modoDemonstracao && (
        <p className="border-b border-acento/20 bg-acento/[.08] px-4 py-1.5 text-center text-[11px] text-texto-suave">
          Modo demonstração — dados só neste navegador.
        </p>
      )}

      <DicaIphone />

      <main className="mx-auto w-full max-w-5xl animate-aparecer">
        {permissoes.comandas ? (
          children
        ) : (
          <div className="p-6 text-center">
            <p className="font-bold">Este login não tem acesso às mesas.</p>
            <p className="mt-1 text-sm text-texto-suave">Peça pro administrador liberar em Equipe.</p>
          </div>
        )}
      </main>

      <Modal
        aberto={saindo}
        aoFechar={() => setSaindo(false)}
        titulo="Sair"
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setSaindo(false)}>
              Cancelar
            </button>
            <button
              className="btn-perigo"
              onClick={() => {
                setSaindo(false);
                void sair();
              }}
            >
              Sair
            </button>
          </>
        }
      >
        <p className="text-sm text-texto-suave">Sair da sua conta neste celular?</p>
      </Modal>
    </div>
  );
}

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
}

/** Android/Chrome: botão "Instalar" quando o navegador oferece. */
function BotaoInstalar() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);

  useEffect(() => {
    const aoOferecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const aoInstalar = () => setEvento(null);
    window.addEventListener("beforeinstallprompt", aoOferecer);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoOferecer);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  if (!evento) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await evento.prompt();
        setEvento(null);
      }}
      className="flex h-9 items-center gap-1 rounded-lg bg-acento px-2.5 text-xs font-bold text-acento-texto"
    >
      <Download className="h-4 w-4" />
      Instalar
    </button>
  );
}

const CHAVE_DICA = "jardins:garcom-dica-iphone";

/** iPhone não tem botão de instalar: explica o "Adicionar à Tela de Início". */
function DicaIphone() {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    const iphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const instalado =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dispensada = false;
    try {
      dispensada = localStorage.getItem(CHAVE_DICA) === "1";
    } catch {
      // sem armazenamento: mostra mesmo
    }
    setMostrar(iphone && !instalado && !dispensada);
  }, []);

  if (!mostrar) return null;
  return (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-acento/30 bg-acento/10 p-3 text-xs">
      <Share className="mt-0.5 h-4 w-4 shrink-0 text-acento" />
      <p className="flex-1">
        Pra usar como app: toque em <strong>Compartilhar</strong> e depois em{" "}
        <strong>Adicionar à Tela de Início</strong>.
      </p>
      <button
        type="button"
        aria-label="Fechar dica"
        onClick={() => {
          setMostrar(false);
          try {
            localStorage.setItem(CHAVE_DICA, "1");
          } catch {
            // ignora
          }
        }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

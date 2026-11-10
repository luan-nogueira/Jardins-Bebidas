"use client";

import { useState } from "react";
import { Check, Copy, Download, Printer } from "lucide-react";

/*
 * Atalho do Windows que abre o sistema no Chrome com impressão direta
 * (--kiosk-printing): o cupom sai na impressora padrão sem abrir a janela
 * de imprimir. Usa um perfil do Chrome só dele (--user-data-dir), então
 * funciona mesmo com outro Chrome aberto e não muda o Chrome do dia a dia.
 */

const ATALHOS = [
  { nome: "Caixa", caminho: "/admin/vendas", pasta: "Caixa" },
  { nome: "Cozinha", caminho: "/admin/cozinha", pasta: "Cozinha" },
];

/** .bat sem acento (o cmd do Windows embaralha). Quebra de linha CRLF. */
function scriptBat(nome: string, url: string, pasta: string) {
  return [
    "@echo off",
    "setlocal",
    `title Jardins Bebidas - atalho do ${nome}`,
    'set "CHROME=%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" set "CHROME=%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe"',
    'if not exist "%CHROME%" goto semchrome',
    `set "PERFIL=%LocalAppData%\\JardinsBebidas\\${pasta}"`,
    `set "URL=${url}"`,
    `set "ATALHO=Jardins - ${nome}"`,
    "powershell -NoProfile -ExecutionPolicy Bypass -Command \"$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\\'+$env:ATALHO+'.lnk'); $s.TargetPath=$env:CHROME; $q=[char]34; $s.Arguments='--kiosk-printing --user-data-dir='+$q+$env:PERFIL+$q+' '+$env:URL; $s.IconLocation=$env:CHROME+',0'; $s.Save()\"",
    "echo.",
    'echo  Pronto! Criado o atalho "%ATALHO%" na Area de Trabalho.',
    "echo  Abrindo o sistema com impressao direta...",
    'start "" "%CHROME%" --kiosk-printing --user-data-dir="%PERFIL%" %URL%',
    "timeout /t 6 >nul",
    "exit /b 0",
    ":semchrome",
    "echo  Nao achei o Google Chrome neste computador. Instale o Chrome e rode de novo.",
    "pause",
    "",
  ].join("\r\n");
}

function baixar(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "application/octet-stream" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function AtalhoImpressao() {
  const [copiado, setCopiado] = useState("");
  const origem = typeof window === "undefined" ? "https://jardins-bebidas.vercel.app" : window.location.origin;

  async function copiar(nome: string, url: string) {
    const cmd = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing ${url}`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiado(nome);
      setTimeout(() => setCopiado(""), 2000);
    } catch {}
  }

  return (
    <section className="card p-4 md:col-span-2">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-acento/10 text-acento">
          <Printer className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold">Impressão direta na térmica (computador)</h2>
          <p className="text-xs text-texto-suave">
            Cupom de venda e pedido da cozinha saindo sozinhos, sem a janela de imprimir.
          </p>
        </div>
      </div>
      <ol className="mb-4 space-y-1.5 text-sm">
        {[
          "Deixe a impressora térmica como impressora padrão do Windows (Configurações → Impressoras → Definir como padrão).",
          "Baixe o atalho do computador certo abaixo e abra o arquivo baixado. Se o Windows avisar, clique em “Mais informações” → “Executar assim mesmo”.",
          "Aparece o atalho “Jardins - Caixa” (ou “Jardins - Cozinha”) na Área de Trabalho e o sistema já abre. Na primeira vez, entre com seu login.",
          "Use sempre esse atalho nesse computador. Tudo que for impresso nessa janela vai direto pra térmica — relatório em A4, imprima pelo Chrome normal.",
        ].map((p, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-superficie-2 text-[11px] font-bold text-texto-suave">
              {i + 1}
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {ATALHOS.map((a) => (
          <button
            key={a.nome}
            type="button"
            className="btn-primario"
            onClick={() => baixar(`Atalho Jardins - ${a.nome}.bat`, scriptBat(a.nome, origem + a.caminho, a.pasta))}
          >
            <Download className="h-4 w-4" />
            Baixar atalho do {a.nome}
          </button>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-texto-suave">Prefiro criar o atalho na mão</summary>
        <p className="mt-2 text-texto-suave">
          Feche todo o Chrome, clique com o botão direito na Área de Trabalho → Novo → Atalho e cole o comando:
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ATALHOS.map((a) => (
            <button
              key={a.nome}
              type="button"
              className="btn-secundario"
              onClick={() => copiar(a.nome, origem + a.caminho)}
            >
              {copiado === a.nome ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado === a.nome ? "Copiado!" : `Copiar comando do ${a.nome}`}
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

"use client";

import { Component, useState, type ReactNode } from "react";
import Image, { type ImageProps } from "next/image";

type Props = Omit<ImageProps, "unoptimized"> & {
  /** Mostrado no lugar da imagem se ela continuar falhando depois das tentativas. */
  fallback: ReactNode;
};

const MAX_TENTATIVAS = 2;

/**
 * Pega erros de RENDER do next/image (ex: host da foto não está na lista
 * liberada em next.config.ts) — sem isso, uma única foto mal configurada
 * derruba a página inteira em vez de só aquele produto.
 */
class LimiteDeErro extends Component<
  { fallback: ReactNode; children: ReactNode },
  { falhou: boolean }
> {
  state = { falhou: false };
  static getDerivedStateFromError() {
    return { falhou: true };
  }
  render() {
    return this.state.falhou ? this.props.fallback : this.props.children;
  }
}

/**
 * next/image com cache/otimização do Vercel — fotos de produto carregam
 * redimensionadas e em cache, em vez de baixar o arquivo original toda vez.
 * Cai pra unoptimized em base64 (fallback sem Cloudinary configurado), que
 * o otimizador não processa.
 *
 * Se a foto falhar ao carregar (ex: origem lenta bem na hora), tenta de novo
 * algumas vezes antes de mostrar `fallback` — uma falha passageira não deve
 * esconder a foto pro resto da visita.
 */
export function ProdutoImagem({ src, fallback, onError, ...props }: Props) {
  const [tentativa, setTentativa] = useState(0);
  const dataUrl = typeof src === "string" && src.startsWith("data:");

  if (tentativa > MAX_TENTATIVAS) return <>{fallback}</>;

  return (
    <LimiteDeErro fallback={fallback}>
      <Image
        key={tentativa}
        src={src}
        unoptimized={dataUrl}
        onError={(e) => {
          setTimeout(() => setTentativa((t) => t + 1), 1000);
          onError?.(e);
        }}
        {...props}
      />
    </LimiteDeErro>
  );
}

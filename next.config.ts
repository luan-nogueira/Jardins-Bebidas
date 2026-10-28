import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Evita tela travada depois de um deploy: se o celular ainda tem uma aba
  // aberta da versão anterior e o usuário clica em algo que precisa buscar
  // uma página nova (ex: Relatório/Romaneio), o Next percebe que o arquivo
  // da versão antiga não existe mais no servidor e recarrega a página
  // sozinho, em vez de simplesmente não fazer nada.
  // VERCEL_DEPLOYMENT_ID existe em todo deploy da Vercel; o COMMIT_SHA só
  // quando o deploy vem do Git — e aqui publicamos pela CLI, então sozinho
  // ele ficava vazio e a proteção nunca ligava.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA,
  images: {
    remotePatterns: [
      // Cloudinary: novo host das fotos de produto.
      { protocol: "https", hostname: "res.cloudinary.com" },
      // ibb.co: mantido pra não quebrar fotos antigas já cadastradas.
      { protocol: "https", hostname: "i.ibb.co" },
      { protocol: "https", hostname: "ibb.co" },
      // Firebase Storage do sistema antigo (Kyte) — alguns produtos ainda
      // não foram migrados pro Cloudinary. Sem isso, o next/image quebra a
      // página inteira (erro de host não configurado), não só a foto.
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
  },
};

export default nextConfig;

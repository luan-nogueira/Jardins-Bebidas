// Versão (deploy) que está no ar agora — o AvisoNovaVersao compara com a
// versão que o aparelho carregou pra saber se o app ficou desatualizado.
// Mesma conta do deploymentId em next.config.ts.
export function GET() {
  const versao =
    process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "";
  return Response.json(
    { versao },
    { headers: { "Cache-Control": "no-store" } },
  );
}

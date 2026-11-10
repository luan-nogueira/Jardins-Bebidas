import webpush from "web-push";
import { VAPID_PUBLICA } from "@/lib/pushChave";

/*
 * Envia notificação push ("Mesa 5 — pedido pronto!") pros celulares
 * inscritos, mesmo com o app fechado e a tela bloqueada.
 *
 * Quem chama é a tela da cozinha, logada: o token do Firebase é conferido
 * aqui antes de mandar qualquer coisa. A chave privada VAPID fica só na
 * variável de ambiente VAPID_PRIVATE_KEY (painel da Vercel).
 */

/** Só serviços de push dos navegadores — o servidor nunca chama outro endereço. */
const SERVICOS_PUSH = [
  /(^|\.)googleapis\.com$/, // Chrome / Android
  /(^|\.)push\.apple\.com$/, // iPhone (app instalado)
  /(^|\.)notify\.windows\.com$/, // Edge
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
];

interface Inscricao {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function inscricaoValida(x: unknown): x is Inscricao {
  if (!x || typeof x !== "object") return false;
  const i = x as Record<string, unknown>;
  const k = i.keys as Record<string, unknown> | undefined;
  if (typeof i.endpoint !== "string" || !k || typeof k.p256dh !== "string" || typeof k.auth !== "string") return false;
  try {
    const url = new URL(i.endpoint);
    return url.protocol === "https:" && SERVICOS_PUSH.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Confere o token de login do Firebase (sem SDK de admin: a própria API do Firebase valida). */
async function logado(idToken: string) {
  const chave = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!chave) return false;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${chave}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  return r.ok;
}

export async function POST(request: Request) {
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!privada) {
    return Response.json({ erro: "Falta configurar VAPID_PRIVATE_KEY na Vercel." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || !(await logado(token))) {
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }

  let corpo: { inscricoes?: unknown; aviso?: Record<string, unknown> };
  try {
    corpo = await request.json();
  } catch {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const inscricoes = (Array.isArray(corpo.inscricoes) ? corpo.inscricoes : []).filter(inscricaoValida).slice(0, 30);
  const url = texto(corpo.aviso?.url, 200);
  const aviso = JSON.stringify({
    titulo: texto(corpo.aviso?.titulo, 120),
    corpo: texto(corpo.aviso?.corpo, 300),
    tag: texto(corpo.aviso?.tag, 100),
    // Só caminhos do próprio site.
    url: url.startsWith("/") && !url.startsWith("//") ? url : "/garcom",
  });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://jardins-bebidas.vercel.app", VAPID_PUBLICA, privada);

  let enviadas = 0;
  const vencidas: string[] = [];
  await Promise.all(
    inscricoes.map(async (i) => {
      try {
        await webpush.sendNotification(i, aviso, { TTL: 900, urgency: "high" });
        enviadas++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Celular desinstalou o app ou trocou de inscrição: avisa pra apagar.
        if (status === 404 || status === 410) vencidas.push(i.endpoint);
      }
    }),
  );

  return Response.json({ enviadas, vencidas });
}

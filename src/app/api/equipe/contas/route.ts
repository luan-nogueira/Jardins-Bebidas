import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/*
 * Lista TODAS as contas de login do Firebase (Authentication), inclusive as
 * que não têm cadastro em Equipe. Só o admin pode chamar.
 *
 * Precisa da chave da conta de serviço na variável FIREBASE_SERVICE_ACCOUNT
 * (o JSON inteiro, painel da Vercel). Sem ela responde 501 e a tela explica
 * como configurar.
 */

export const dynamic = "force-dynamic";

function admin() {
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto) return null;
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(bruto)) });
  return getApps()[0];
}

export async function GET(request: Request) {
  let app;
  try {
    app = admin();
  } catch {
    return Response.json({ erro: "chave-invalida" }, { status: 500 });
  }
  if (!app) return Response.json({ erro: "sem-chave" }, { status: 501 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ erro: "sem-login" }, { status: 401 });

  const auth = getAuth(app);
  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token)).uid;
  } catch {
    return Response.json({ erro: "sem-login" }, { status: 401 });
  }

  // Mesma regra do firestore.rules: sem perfil = dono (admin); com perfil, só papel admin ativo.
  const perfil = await getFirestore(app).doc(`usuarios/${uid}`).get();
  if (perfil.exists) {
    const p = perfil.data()!;
    if (p.papel !== "admin" || p.ativo === false) {
      return Response.json({ erro: "so-admin" }, { status: 403 });
    }
  }

  const contas = [];
  let pagina: string | undefined;
  do {
    const r = await auth.listUsers(1000, pagina);
    for (const u of r.users) {
      contas.push({
        uid: u.uid,
        email: u.email ?? "",
        nome: u.displayName ?? "",
        criadoEm: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
        ultimoAcesso: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
        desativada: u.disabled,
      });
    }
    pagina = r.pageToken;
  } while (pagina);

  return Response.json({ contas, voce: uid });
}

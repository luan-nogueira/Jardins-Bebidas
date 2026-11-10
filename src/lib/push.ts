import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { firebaseConfigurado, getDb, getFirebaseAuth } from "./firebase";
import { VAPID_PUBLICA } from "./pushChave";
import { itensAtivos } from "./pedidos";
import type { Pedido } from "./types";

/*
 * Notificação push do "pedido pronto":
 *  - o celular do garçom se inscreve (inscreverPush) e a inscrição fica em
 *    inscricoesPush/{id}, com o nome do garçom;
 *  - a cozinha, ao marcar "Pronto!", chama avisarPedidoPronto, que acha as
 *    inscrições do garçom e pede pro /api/push enviar.
 * Sem Firebase (modo demonstração) nada disso roda.
 */

const COLECAO = "inscricoesPush";

export function pushDisponivel() {
  return (
    firebaseConfigurado &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function chaveBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(padded);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

/** Id estável por celular: hash do endereço de push. */
async function idDe(endpoint: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Inscreve este celular pra receber push com o nome do garçom. Chamar com a permissão já dada. */
export async function inscreverPush(nome: string) {
  if (!pushDisponivel() || Notification.permission !== "granted") return;
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return;
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveBytes(VAPID_PUBLICA) }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
  await setDoc(doc(getDb(), COLECAO, await idDe(json.endpoint)), {
    uid,
    nome,
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    atualizadoEm: new Date().toISOString(),
  });
}

/** Manda o push "pedido pronto" pros celulares do garçom do pedido (e de quem abriu a mesa). */
export async function avisarPedidoPronto(pedido: Pedido, garcomDaMesa?: string) {
  if (!firebaseConfigurado) return;
  const nomes = [...new Set([pedido.garcom, garcomDaMesa].filter(Boolean))] as string[];
  const usuario = getFirebaseAuth().currentUser;
  if (nomes.length === 0 || !usuario) return;

  const snap = await getDocs(query(collection(getDb(), COLECAO), where("nome", "in", nomes)));
  const inscricoes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as { endpoint: string; keys: object }) }));
  if (inscricoes.length === 0) return;

  const nomeMesa = pedido.mesa ? `Mesa ${pedido.mesa}` : (pedido.clienteNome ?? "Comanda");
  const resposta = await fetch("/api/push", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await usuario.getIdToken()}` },
    body: JSON.stringify({
      inscricoes: inscricoes.map((i) => ({ endpoint: i.endpoint, keys: i.keys })),
      aviso: {
        titulo: `🔔 ${nomeMesa} — pedido pronto!`,
        corpo: itensAtivos(pedido)
          .map((i) => `${i.qtd}× ${i.nome}`)
          .join(", "),
        tag: pedido.id,
        url: `/garcom?id=${pedido.vendaId}`,
      },
    }),
  });
  if (!resposta.ok) return;
  // Celular que desinstalou o app: tira da lista pra não tentar de novo.
  const { vencidas = [] } = (await resposta.json()) as { vencidas?: string[] };
  for (const i of inscricoes) if (vencidas.includes(i.endpoint)) await deleteDoc(doc(getDb(), COLECAO, i.id)).catch(() => {});
}

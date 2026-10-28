import { initializeApp, deleteApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, getAuth, type Auth } from "firebase/auth";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/**
 * Sem as variáveis de ambiente o sistema roda em modo demonstração,
 * guardando tudo no navegador. Assim dá pra testar antes de criar o projeto.
 */
export const firebaseConfigurado = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;

function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(config as Required<typeof config>);
  }
  return app;
}

export function getDb(): Firestore {
  if (!firestore) {
    // Cache persistente: o celular na loja continua funcionando sem sinal
    // e sincroniza sozinho quando a internet volta.
    firestore = initializeFirestore(getFirebaseApp(), {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  }
  return firestore;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

let storage: FirebaseStorage | null = null;
export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}

/**
 * Cria um login (Firebase Auth) pra um funcionário sem derrubar a sessão
 * de quem está criando — o SDK do Firebase normalmente troca de usuário
 * pro recém-criado, então isso roda num app secundário temporário e
 * descarta ele em seguida, sem afetar o app principal.
 */
export async function criarLoginFuncionario(
  email: string,
  senha: string,
): Promise<string> {
  const appSecundario = initializeApp(
    config as Required<typeof config>,
    `secundario-${Date.now()}`,
  );
  try {
    const authSecundario = getAuth(appSecundario);
    const cred = await createUserWithEmailAndPassword(authSecundario, email, senha);
    return cred.user.uid;
  } finally {
    await deleteApp(appSecundario);
  }
}

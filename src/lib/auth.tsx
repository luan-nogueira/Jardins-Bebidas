"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { firebaseConfigurado, getFirebaseAuth, getDb } from "./firebase";
import type { Permissoes, Usuario } from "./types";

/** Sem perfil cadastrado = conta antiga/dona do sistema: acesso total. */
const PERMISSOES_TOTAL: Permissoes = {
  vendas: true,
  comandas: true,
  relatorios: true,
  produtos: true,
  clientes: true,
  financeiro: true,
  estoque: true,
  fornecedores: true,
  verCusto: true,
  excluir: true,
};

/** Acesso revogado (ativo: false) — não vê nada, mesmo continuando logado. */
const PERMISSOES_NENHUMA: Permissoes = {
  vendas: false,
  comandas: false,
  relatorios: false,
  produtos: false,
  clientes: false,
  financeiro: false,
  estoque: false,
  fornecedores: false,
  verCusto: false,
  excluir: false,
};

interface Autenticacao {
  usuario: User | null;
  /** Documento de permissões deste usuário — null se ele é a conta dona (sem restrição). */
  perfil: Usuario | null;
  permissoes: Permissoes;
  ehAdmin: boolean;
  carregando: boolean;
  /** Falso no modo demonstração — sem Firebase não há o que proteger. */
  exigeLogin: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  recuperarSenha: (email: string) => Promise<void>;
}

const AuthContext = createContext<Autenticacao | null>(null);

/** Traduz os códigos do Firebase pra algo que se entenda na tela. */
export function mensagemDeErro(erro: unknown): string {
  const codigo =
    typeof erro === "object" && erro && "code" in erro
      ? String((erro as { code: unknown }).code)
      : "";

  switch (codigo) {
    case "auth/invalid-email":
      return "E-mail inválido.";
    case "auth/user-disabled":
      return "Esta conta foi desativada.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "E-mail ou senha incorretos.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde um pouco e tente de novo.";
    case "auth/network-request-failed":
      return "Sem conexão. Verifique a internet.";
    case "auth/missing-password":
      return "Digite a senha.";
    default:
      return "Não foi possível entrar. Tente novamente.";
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(firebaseConfigurado);

  useEffect(() => {
    if (!firebaseConfigurado) return;
    return onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUsuario(u);
      setCarregando(false);
    });
  }, []);

  // Escuta o documento de permissões do usuário logado (se existir).
  useEffect(() => {
    if (!firebaseConfigurado || !usuario) {
      setPerfil(null);
      return;
    }
    return onSnapshot(doc(getDb(), "usuarios", usuario.uid), (snap) => {
      setPerfil(snap.exists() ? ({ id: snap.id, ...snap.data() } as Usuario) : null);
    });
  }, [usuario]);

  const entrar = useCallback(async (email: string, senha: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), senha);
  }, []);

  const sair = useCallback(async () => {
    await signOut(getFirebaseAuth());
  }, []);

  const recuperarSenha = useCallback(async (email: string) => {
    await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
  }, []);

  // Conta desativada nunca é admin e nunca tem permissão nenhuma, mesmo que
  // o papel salvo seja "admin" por engano — desativar sempre vence.
  const desativado = !!perfil && perfil.ativo === false;
  const ehAdmin = !desativado && (!perfil || perfil.papel === "admin");
  const permissoes = desativado
    ? PERMISSOES_NENHUMA
    : ehAdmin
      ? PERMISSOES_TOTAL
      : perfil!.permissoes;

  // Conta desativada: desloga na hora, não deixa nem carregar a tela.
  useEffect(() => {
    if (desativado) void signOut(getFirebaseAuth());
  }, [desativado]);

  const valor = useMemo<Autenticacao>(
    () => ({
      usuario,
      perfil,
      permissoes,
      ehAdmin,
      carregando,
      exigeLogin: firebaseConfigurado,
      entrar,
      sair,
      recuperarSenha,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usuario, perfil, carregando, entrar, sair, recuperarSenha],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): Autenticacao {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}

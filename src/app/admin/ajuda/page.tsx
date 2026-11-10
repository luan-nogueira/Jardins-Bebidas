"use client";

import Link from "next/link";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileSpreadsheet,
  HandCoins,
  PackageMinus,
  PackagePlus,
  ShieldCheck,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Cabecalho } from "@/components/ui";
import { AtalhoImpressao } from "@/components/AtalhoImpressao";
import { useAuth } from "@/lib/auth";
import type { Permissoes } from "@/lib/types";

/*
 * Ajuda: cada tarefa do dia a dia em poucos passos, com o botão que leva
 * direto pra tela certa. Escrito pra quem nunca usou o sistema.
 */

interface Tarefa {
  titulo: string;
  quando: string;
  passos: string[];
  href: string;
  botao: string;
  Icone: LucideIcon;
  chave: keyof Permissoes | null;
}

const TAREFAS: Tarefa[] = [
  {
    titulo: "Vender no balcão",
    quando: "Cliente paga e leva na hora.",
    passos: [
      "Abra Vender e toque nos produtos (ou passe o leitor de código de barras).",
      "Confira a venda e toque em Cobrar. O desconto (em R$ ou %) é dado ali, e o sistema mostra o valor.",
      "Escolha Dinheiro, Pix ou Cartão. No dinheiro, o troco aparece sozinho. Dá pra dividir em duas formas.",
    ],
    href: "/admin/vendas",
    botao: "Abrir Vender",
    Icone: ShoppingCart,
    chave: "vendas",
  },
  {
    titulo: "Comanda (venda a prazo)",
    quando: "Cliente vai pegando e paga depois.",
    passos: [
      "Em Comandas, toque em Nova comanda e escolha o cliente (dá pra cadastrar na hora).",
      "Vá adicionando os produtos. Enquanto a comanda está aberta, o estoque não muda.",
      "No fim, toque em Finalizar comanda: os itens saem do estoque.",
      "Receba tudo, parte, ou marque “deixar a prazo” com a data de vencimento. Dá pra dar desconto em R$ ou %.",
    ],
    href: "/admin/comandas",
    botao: "Abrir Comandas",
    Icone: ClipboardList,
    chave: "comandas",
  },
  {
    titulo: "Receber de quem está devendo",
    quando: "Cliente voltou pra pagar o fiado.",
    passos: [
      "Em Comandas, aba A receber (as vencidas ficam em vermelho).",
      "Toque na comanda do cliente e em Receber.",
      "Pode receber só uma parte — o resto continua em aberto. Se for abater um desconto no acerto, coloque em R$ ou %.",
    ],
    href: "/admin/comandas?aba=receber",
    botao: "Ver quem deve",
    Icone: HandCoins,
    chave: "comandas",
  },
  {
    titulo: "Chegou mercadoria (entrada)",
    quando: "Recebeu a nota do fornecedor.",
    passos: [
      "Em Entradas, toque em Nova entrada.",
      "Escolha o fornecedor, digite o nº da nota e adicione os produtos com quantidade e custo.",
      "Se tiver validade, preencha — o sistema avisa quando estiver perto de vencer.",
      "Pago na hora? À vista. Boleto? A prazo, com as parcelas e vencimentos — elas vão pro Financeiro.",
    ],
    href: "/admin/compras?nova=1",
    botao: "Nova entrada",
    Icone: PackagePlus,
    chave: "estoque",
  },
  {
    titulo: "Contar o estoque",
    quando: "O número do sistema não bate com a prateleira.",
    passos: [
      "Em Estoque, toque em Contar na linha do produto (ou em Contar estoque, no alto, e escolha o produto).",
      "Digite quanto tem agora (em caixas e/ou unidades).",
      "O sistema corrige e guarda a diferença no histórico do produto.",
    ],
    href: "/admin/estoque",
    botao: "Abrir Estoque",
    Icone: Boxes,
    chave: "estoque",
  },
  {
    titulo: "Perda ou quebra",
    quando: "Garrafa quebrou, produto venceu.",
    passos: [
      "Em Estoque, toque em Perda / quebra, escolha o produto e a quantidade.",
      "Em Relatórios, “Perdas e quebras” mostra o que se perdeu no período, com o custo e o preço de venda somados.",
    ],
    href: "/admin/estoque",
    botao: "Abrir Estoque",
    Icone: PackageMinus,
    chave: "estoque",
  },
  {
    titulo: "Mudar preços de vários produtos",
    quando: "Reajuste, produto novo, organizar categorias.",
    passos: [
      "Em Produtos, toque em Planilha → Baixar planilha (Excel).",
      "Edite no Excel as células claras: preço, custo, categoria, estoque mínimo…",
      "Volte em Planilha → Importar planilha editada. O sistema mostra o que muda antes de gravar.",
    ],
    href: "/admin/produtos",
    botao: "Abrir Produtos",
    Icone: FileSpreadsheet,
    chave: "produtos",
  },
  {
    titulo: "Ver como foram as vendas",
    quando: "Fechamento do dia, da semana ou do mês.",
    passos: [
      "O Painel mostra o dia: total, ticket médio, mais vendidos e vendas por hora.",
      "Em Relatórios, escolha o período e agrupe por dia, semana ou mês. Dá pra imprimir ou salvar em PDF.",
    ],
    href: "/admin/relatorios",
    botao: "Abrir Relatórios",
    Icone: BarChart3,
    chave: "relatorios",
  },
  {
    titulo: "Contas a pagar e caixa",
    quando: "Saber o que vence e quanto entrou.",
    passos: [
      "Em Financeiro ficam as contas a pagar (das entradas a prazo e as que você lançar, como aluguel e luz).",
      "Toque no círculo da conta pra marcar como paga.",
      "O fluxo de caixa mostra, dia a dia, o que entrou e o que saiu.",
    ],
    href: "/admin/financeiro",
    botao: "Abrir Financeiro",
    Icone: Wallet,
    chave: "financeiro",
  },
  {
    titulo: "Acesso da equipe",
    quando: "Funcionário novo.",
    passos: [
      "Em Equipe, toque em Novo funcionário e crie o e-mail e a senha dele.",
      "Marque só o que ele pode ver. Ex.: o caixa vende e abre comanda, mas não vê custo nem financeiro.",
    ],
    href: "/admin/equipe",
    botao: "Abrir Equipe",
    Icone: ShieldCheck,
    chave: null,
  },
  {
    titulo: "Fechar o caixa do dia",
    quando: "Começo e fim do expediente, ou quando tirar dinheiro da gaveta.",
    passos: [
      "No começo, abra Caixa → Abrir caixa e informe o troco que está na gaveta.",
      "Precisou tirar dinheiro? Toque em Sangria, diga quanto, pra quê e quem tirou. Colocou dinheiro? Use Reforço.",
      "No fim, toque em Fechar caixa, conte o dinheiro da gaveta e digite. O sistema mostra se sobrou ou faltou.",
      "O relatório em PDF baixa na hora e fica guardado em Caixas fechados.",
    ],
    href: "/admin/caixa",
    botao: "Abrir Caixa",
    Icone: Wallet,
    chave: "vendas",
  },
  {
    titulo: "Apagar testes",
    quando: "Fez vendas ou comandas de teste e quer limpar.",
    passos: [
      "Escolha o dia. Aparecem as vendas, comandas e caixas daquele dia.",
      "Desmarque o que foi venda de verdade.",
      "Digite APAGAR e confirme. O estoque volta sozinho.",
    ],
    href: "/admin/limpar-testes",
    botao: "Apagar testes",
    Icone: ShieldCheck,
    chave: null,
  },
];

export default function AjudaPage() {
  const { permissoes, ehAdmin } = useAuth();
  const visiveis = TAREFAS.filter((t) => (t.chave ? permissoes[t.chave] : ehAdmin));

  return (
    <>
      <Cabecalho titulo="Ajuda" subtitulo="Como fazer cada coisa no sistema, passo a passo" />
      <div className="grid gap-3 px-4 pb-8 md:grid-cols-2 md:px-6">
        {(permissoes.vendas || permissoes.cozinha) && <AtalhoImpressao />}
        {visiveis.map(({ titulo, quando, passos, href, botao, Icone }) => (
          <section key={titulo} className="card flex flex-col p-4">
            <div className="mb-3 flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-acento/10 text-acento">
                <Icone className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-bold">{titulo}</h2>
                <p className="text-xs text-texto-suave">{quando}</p>
              </div>
            </div>
            <ol className="mb-4 space-y-1.5 text-sm">
              {passos.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-superficie-2 text-[11px] font-bold text-texto-suave">
                    {i + 1}
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
            <Link href={href} className="btn-secundario mt-auto self-start">
              {botao}
            </Link>
          </section>
        ))}
      </div>
    </>
  );
}

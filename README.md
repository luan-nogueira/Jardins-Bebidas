# Sistema Jardins Bebidas

Vendas de balcão, comandas (venda a prazo), estoque, entradas de compra e
financeiro — feito pra usar no celular e no computador. Base de código vinda
do Sistema Luifer, com o modelo de negócio refeito.

## Rodando

```bash
npm install
npm run dev
```

Com o `.env.local` preenchido, usa o Firebase `jardins-bebidas` (login por
e-mail/senha, dados em tempo real). Pra testar sem mexer nos dados reais, rode
em modo demonstração (dados só no navegador):

```powershell
$env:NODE_ENV="test"; npx next dev
```

## Como o negócio é modelado

| Tipo        | Como funciona                                                                 |
| ----------- | ----------------------------------------------------------------------------- |
| **Balcão**  | Cliente paga e leva. Baixa o estoque na hora. Cliente é opcional.             |
| **Comanda** | Venda a prazo, exige cliente. Fica aberta e **só baixa o estoque ao finalizar**. O que não foi pago vira conta a receber com vencimento. |

- **Entrada (compra)**: nota com vários produtos, custo, validade do lote e
  pagamento à vista ou a prazo (parcelas viram contas a pagar com vencimento).
  Atualiza o custo médio do produto.
- **Cancelar** uma venda finalizada devolve os itens ao estoque.

## Telas

| Rota                   | O que é                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `/admin`               | Painel: atalhos do dia, primeiros passos, venda, ticket médio, lucro, gráficos e avisos |
| `/admin/vendas`        | Caixa do balcão                                                 |
| `/admin/comandas`      | Comandas abertas, a receber e quitadas                          |
| `/admin/relatorios`    | Sintético por dia/semana/mês e ranking de produtos (imprime)    |
| `/admin/financeiro`    | Recebido, contas a receber, contas a pagar e fluxo de caixa     |
| `/admin/estoque`       | Estoque, histórico, pra repor e validade perto                  |
| `/admin/compras`       | Entradas (notas de compra)                                      |
| `/admin/produtos`, `/admin/clientes`, `/admin/fornecedores`, `/admin/equipe` | Cadastros |
| `/admin/ajuda`         | Passo a passo de cada tarefa, com botão pra tela certa          |
| `/admin/reset-sistema` | Zera o movimento depois dos testes (só admin)                   |

## Produtos: planilha e sistema antigo

Em **Produtos → Planilha**:

- **Baixar planilha (Excel)** — todos os produtos por categoria, com listas de
  escolha (categoria, Sim/Não), margem calculada e uma aba "Como usar".
- **Importar planilha editada** — mostra o que muda em cada produto antes de
  gravar. Mudança de estoque vira um Ajuste no histórico. A coluna ID
  (escondida) liga a linha ao produto; sem ela, casa pelo código ou nome.
- **Sistema antigo (LC)** — os 548 produtos da conferência de 27/10/2026
  (`src/lib/db/catalogo-lc.json`), com nomes padronizados, categoria deduzida
  pelo nome e porções/doses/serviços sem controle de estoque. Estoque negativo
  do sistema antigo entra como 0.

Código em `src/lib/planilha.ts` (ExcelJS, carregado só ao usar).

## Logo

Coloque o arquivo em `public/logo.png` — ele entra no lugar do desenho em SVG.

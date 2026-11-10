import { EMPRESA } from "./empresa";
import { calcularCaixa, FORMAS, numeroCaixa } from "./caixa";
import { ROTULO_FORMA, numeroVenda, totalVenda } from "./vendas";
import { nomeComanda } from "./pedidos";
import type { Caixa, Venda } from "./types";

/*
 * Relatório do fechamento em PDF (A4), gerado no navegador e baixado como
 * arquivo — não passa pela impressão (o Chrome do caixa imprime direto na
 * térmica). Só fonte padrão: Helvetica cobre os acentos do português.
 */

const brl = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataHora = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

interface Coluna {
  titulo: string;
  largura: number;
  direita?: boolean;
}

export async function baixarPdfCaixa(
  caixa: Caixa,
  vendas: Venda[],
  nomePessoa: (x?: string | null) => string = (x) => x ?? "",
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 14;
  const L = 210 - M * 2;
  const FIM = 297 - 16;
  let y = M;

  const d = calcularCaixa(caixa, vendas);
  // Fechado: os totais são os gravados na hora do fechamento.
  const r = caixa.resumo ?? d.resumo;

  function quebra(altura: number) {
    if (y + altura <= FIM) return false;
    doc.addPage();
    y = M;
    return true;
  }

  function titulo(t: string) {
    quebra(14);
    y += 3;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(t.toUpperCase(), M, y);
    y += 1.5;
    doc.setDrawColor(200);
    doc.line(M, y, M + L, y);
    y += 5;
  }

  function par(rotulo: string, valor: string, forte = false) {
    quebra(6);
    doc.setFont("helvetica", forte ? "bold" : "normal");
    doc.setFontSize(forte ? 11 : 10);
    doc.text(rotulo, M, y);
    doc.text(valor, M + L, y, { align: "right" });
    y += forte ? 6.5 : 5.5;
  }

  function tabela(colunas: Coluna[], linhas: string[][], vazio = "Nada no período.") {
    const cabecalho = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setFillColor(240, 240, 240);
      doc.rect(M, y - 4, L, 6, "F");
      let x = M + 1.5;
      for (const c of colunas) {
        doc.text(c.titulo, c.direita ? x + c.largura - 3 : x, y, c.direita ? { align: "right" } : undefined);
        x += c.largura;
      }
      y += 5;
      doc.setFont("helvetica", "normal");
    };
    if (linhas.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text(vazio, M, y);
      y += 6;
      return;
    }
    quebra(12);
    cabecalho();
    doc.setFontSize(8.5);
    for (const linha of linhas) {
      // Texto longo quebra em mais linhas dentro da própria coluna.
      const partes = linha.map((t, i) => doc.splitTextToSize(t, colunas[i].largura - 3) as string[]);
      const altura = Math.max(...partes.map((p) => p.length)) * 4 + 1.2;
      if (quebra(altura)) cabecalho();
      let x = M + 1.5;
      partes.forEach((p, i) => {
        const c = colunas[i];
        doc.text(p, c.direita ? x + c.largura - 3 : x, y, c.direita ? { align: "right" } : undefined);
        x += c.largura;
      });
      y += altura;
      doc.setDrawColor(230);
      doc.line(M, y - 3.2, M + L, y - 3.2);
    }
    y += 2;
  }

  // ---------- Cabeçalho ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(EMPRESA.nome.toUpperCase(), M, y + 2);
  doc.setFontSize(12);
  doc.text("FECHAMENTO DE CAIXA", M + L, y + 2, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (EMPRESA.documento) doc.text(`CNPJ ${EMPRESA.documento}`, M, y);
  doc.text(numeroCaixa(caixa.numero), M + L, y, { align: "right" });
  y += 4.5;
  doc.text(`${EMPRESA.endereco} - ${EMPRESA.cidade}`, M, y);
  doc.text(caixa.status === "ABERTO" ? "PARCIAL (caixa ainda aberto)" : "Caixa fechado", M + L, y, {
    align: "right",
  });
  y += 7;

  titulo("Turno");
  par("Aberto em", `${dataHora(caixa.abertoEm)} por ${nomePessoa(caixa.abertoPor)}`);
  par(
    caixa.status === "ABERTO" ? "Relatório gerado em" : "Fechado em",
    caixa.status === "ABERTO"
      ? dataHora(new Date().toISOString())
      : `${dataHora(caixa.fechadoEm)} por ${nomePessoa(caixa.fechadoPor)}`,
  );

  titulo("Vendas");
  par("Vendas finalizadas", String(r.vendas));
  par("Total vendido", brl(r.totalVendido), true);
  if (r.descontos > 0) par("Descontos dados", brl(r.descontos));
  if (r.aPrazo > 0) par("Ficou a prazo (fiado)", brl(r.aPrazo));
  par("Ticket médio", brl(r.vendas ? r.totalVendido / r.vendas : 0));
  if (r.canceladas > 0) par(`Canceladas (${r.canceladas})`, brl(r.totalCancelado));

  titulo("Recebido por forma de pagamento");
  for (const f of FORMAS) par(ROTULO_FORMA[f], brl(r.porForma[f] ?? 0));
  par("Total recebido", brl(r.totalRecebido), true);

  titulo("Dinheiro na gaveta");
  par("Fundo de troco (abertura)", brl(caixa.fundoTroco));
  par("+ Recebido em dinheiro", brl(r.porForma.DINHEIRO ?? 0));
  par("+ Reforços", brl(r.reforcos));
  par("- Sangrias (retiradas)", brl(r.sangrias));
  par("= Esperado na gaveta", brl(r.dinheiroEsperado), true);
  if (caixa.contado !== undefined) {
    const dif = Math.round((caixa.contado - r.dinheiroEsperado) * 100) / 100;
    par("Contado no fechamento", brl(caixa.contado), true);
    par(
      Math.abs(dif) < 0.005 ? "Diferença (bateu certinho)" : dif > 0 ? "Diferença (SOBROU)" : "Diferença (FALTOU)",
      brl(dif),
      true,
    );
  }
  if (caixa.obsFechamento) par("Observação", caixa.obsFechamento);

  const sangrias = caixa.movimentos.filter((m) => m.tipo === "SANGRIA");
  const reforcos = caixa.movimentos.filter((m) => m.tipo === "REFORCO");
  titulo(`Sangrias (${sangrias.length})`);
  tabela(
    [
      { titulo: "Hora", largura: 16 },
      { titulo: "Motivo", largura: 82 },
      { titulo: "Categoria", largura: 30 },
      { titulo: "Quem", largura: 30 },
      { titulo: "Valor", largura: L - 158, direita: true },
    ],
    sangrias.map((m) => [hora(m.data), m.motivo, m.categoria ?? "-", nomePessoa(m.quem), brl(m.valor)]),
    "Nenhuma sangria.",
  );
  titulo(`Reforços (${reforcos.length})`);
  tabela(
    [
      { titulo: "Hora", largura: 16 },
      { titulo: "Motivo", largura: 112 },
      { titulo: "Quem", largura: 30 },
      { titulo: "Valor", largura: L - 158, direita: true },
    ],
    reforcos.map((m) => [hora(m.data), m.motivo, nomePessoa(m.quem), brl(m.valor)]),
    "Nenhum reforço.",
  );

  const formas = (v: Venda) =>
    [...new Set(v.pagamentos.map((p) => ROTULO_FORMA[p.forma]))].join(" + ") || "A prazo";
  titulo(`Vendas do turno (${d.vendas.length})`);
  tabela(
    [
      { titulo: "Hora", largura: 16 },
      { titulo: "Nº", largura: 18 },
      { titulo: "Cliente / mesa", largura: 64 },
      { titulo: "Pagamento", largura: 44 },
      { titulo: "Total", largura: L - 142, direita: true },
    ],
    d.vendas.map((v) => [
      hora(v.finalizadaEm ?? v.abertaEm),
      numeroVenda(v.numero),
      v.mesa || v.clienteNome ? nomeComanda(v) : "Consumidor final",
      formas(v),
      brl(totalVenda(v)),
    ]),
  );

  if (d.recebimentosAvulsos.length) {
    titulo("Recebimentos de outras vendas (fiado, mesa paga em partes)");
    tabela(
      [
        { titulo: "Hora", largura: 16 },
        { titulo: "Venda", largura: 96 },
        { titulo: "Forma", largura: 36 },
        { titulo: "Valor", largura: L - 148, direita: true },
      ],
      d.recebimentosAvulsos.map((x) => [
        hora(x.data),
        `${numeroVenda(x.venda.numero)} · ${x.venda.mesa || x.venda.clienteNome ? nomeComanda(x.venda) : "Consumidor final"}`,
        ROTULO_FORMA[x.forma],
        brl(x.valor),
      ]),
    );
  }

  if (d.canceladas.length) {
    titulo("Vendas canceladas");
    tabela(
      [
        { titulo: "Nº", largura: 20 },
        { titulo: "Cliente / mesa", largura: 128 },
        { titulo: "Total", largura: L - 148, direita: true },
      ],
      d.canceladas.map((v) => [numeroVenda(v.numero), nomeComanda(v), brl(totalVenda(v))]),
    );
  }

  titulo("Produtos vendidos");
  tabela(
    [
      { titulo: "Produto", largura: 120 },
      { titulo: "Qtd", largura: 25, direita: true },
      { titulo: "Total", largura: L - 145, direita: true },
    ],
    d.produtos.map((p) => [p.nome, String(p.qtd), brl(p.total)]),
  );

  // Assinaturas
  quebra(30);
  y += 18;
  doc.setDrawColor(120);
  doc.line(M, y, M + 75, y);
  doc.line(M + L - 75, y, M + L, y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Responsável pelo caixa", M, y + 4.5);
  doc.text("Conferido por", M + L - 75, y + 4.5);

  // Rodapé com página
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${EMPRESA.nome} · ${numeroCaixa(caixa.numero)} · página ${i} de ${total}`, M + L / 2, 297 - 8, {
      align: "center",
    });
    doc.setTextColor(0);
  }

  const dia = (caixa.fechadoEm ?? new Date().toISOString()).slice(0, 10);
  doc.save(`fechamento-caixa-${String(caixa.numero).padStart(3, "0")}-${dia}.pdf`);
}

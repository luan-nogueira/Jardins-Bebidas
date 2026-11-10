"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, Check, ChefHat, Copy, Smartphone, UtensilsCrossed } from "lucide-react";
import { Cabecalho, Metrica, Vazio } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { useAgora, useNomePessoa } from "@/components/Pedidos";
import { useDados } from "@/lib/store";
import { brl, hojeISO } from "@/lib/format";
import { diaLocal, numeroVenda, totalVenda, unidadesVenda } from "@/lib/vendas";
import { minutosDesde } from "@/lib/pedidos";
import type { Venda } from "@/lib/types";

/**
 * Painel do salão — só acompanhamento: quantas mesas estão abertas, quanto
 * tem em aberto, como está a cozinha e o desempenho de cada garçom.
 * Quem lança os pedidos é o garçom, pelo app dele (/garcom).
 */
export default function SalaoPage() {
  return (
    <Protegido chave="comandas">
      <Salao />
    </Protegido>
  );
}

function Salao() {
  const { vendas, pedidos, carregando } = useDados();
  const nomePessoa = useNomePessoa();
  const agora = useAgora();
  const hoje = hojeISO();

  const abertas = useMemo(
    () =>
      vendas
        .filter((v) => v.tipo === "COMANDA" && v.status === "ABERTA")
        .sort((a, b) => a.abertaEm.localeCompare(b.abertaEm)),
    [vendas],
  );
  const mesas = abertas.filter((v) => v.mesa);
  // Mesas (comandas com mesa) fechadas hoje.
  const fechadasHoje = useMemo(
    () => vendas.filter((v) => v.mesa && v.status === "FINALIZADA" && v.finalizadaEm && diaLocal(v.finalizadaEm) === hoje),
    [vendas, hoje],
  );
  const pedidosHoje = useMemo(() => pedidos.filter((p) => diaLocal(p.criadoEm) === hoje), [pedidos, hoje]);

  const valorAberto = abertas.reduce((s, v) => s + totalVenda(v), 0);
  const valorFechado = fechadasHoje.reduce((s, v) => s + totalVenda(v), 0);
  const naCozinha = pedidos.filter((p) => p.status === "NOVO" || p.status === "PREPARANDO").length;
  const prontos = pedidos.filter((p) => p.status === "PRONTO").length;
  const comTempo = pedidosHoje.filter((p) => p.prontoEm);
  const tempoMedio = comTempo.length
    ? Math.round(
        comTempo.reduce((s, p) => s + new Date(p.prontoEm!).getTime() - new Date(p.criadoEm).getTime(), 0) /
          comTempo.length /
          60000,
      )
    : null;
  const cancelados = pedidosHoje.flatMap((p) => p.itens.filter((i) => i.cancelado)).length;
  const ticket = mesas.length + fechadasHoje.length
    ? (mesas.reduce((s, v) => s + totalVenda(v), 0) + valorFechado) / (mesas.length + fechadasHoje.length)
    : 0;

  const porGarcom = useMemo(() => {
    const mapa = new Map<string, { nome: string; abertas: number; aberto: number; fechado: number; pedidos: number }>();
    const linha = (bruto: string) => {
      const nome = nomePessoa(bruto);
      if (!mapa.has(nome)) mapa.set(nome, { nome, abertas: 0, aberto: 0, fechado: 0, pedidos: 0 });
      return mapa.get(nome)!;
    };
    for (const v of abertas) if (v.garcom) {
      const l = linha(v.garcom);
      l.abertas++;
      l.aberto += totalVenda(v);
    }
    for (const v of fechadasHoje) if (v.garcom) linha(v.garcom).fechado += totalVenda(v);
    for (const p of pedidosHoje) if (p.garcom) linha(p.garcom).pedidos++;
    return [...mapa.values()].sort((a, b) => b.aberto + b.fechado - (a.aberto + a.fechado));
  }, [abertas, fechadasHoje, pedidosHoje, nomePessoa]);

  function statusCozinha(v: Venda) {
    const dela = pedidos.filter((p) => p.vendaId === v.id);
    return {
      prontos: dela.filter((p) => p.status === "PRONTO").length,
      preparo: dela.filter((p) => p.status === "NOVO" || p.status === "PREPARANDO").length,
    };
  }

  return (
    <>
      <Cabecalho titulo="Salão" subtitulo="Acompanhe as mesas em tempo real — atualiza sozinho" />

      <div className="grid grid-cols-2 gap-3 px-4 md:px-6 lg:grid-cols-4">
        <Metrica
          rotulo="Mesas ocupadas"
          valor={String(mesas.length)}
          detalhe={abertas.length > mesas.length ? `+ ${abertas.length - mesas.length} comanda(s) sem mesa` : `${abertas.length} comanda(s) aberta(s)`}
          destaque
        />
        <Metrica rotulo="Valor em aberto" valor={brl(valorAberto)} detalhe="nas comandas abertas" />
        <Metrica rotulo="Mesas fechadas hoje" valor={brl(valorFechado)} detalhe={`${fechadasHoje.length} mesa(s)`} />
        <Metrica rotulo="Ticket médio" valor={brl(ticket)} detalhe="por mesa, hoje" />
        <Metrica
          rotulo="Na cozinha"
          valor={String(naCozinha)}
          detalhe={prontos > 0 ? `${prontos} pronto(s) esperando o garçom` : "pedido(s) em andamento"}
        />
        <Metrica rotulo="Tempo de preparo" valor={tempoMedio === null ? "—" : `${tempoMedio} min`} detalhe="média de hoje" />
        <Metrica rotulo="Pedidos hoje" valor={String(pedidosHoje.length)} detalhe={`${cancelados} item(ns) cancelado(s)`} />
        <Metrica
          rotulo="Mesa mais antiga"
          valor={abertas[0] ? `${minutosDesde(abertas[0].abertaEm, agora)} min` : "—"}
          detalhe={abertas[0] ? (abertas[0].mesa ? `Mesa ${abertas[0].mesa}` : abertas[0].clienteNome) : "nenhuma aberta"}
        />
      </div>

      <div className="mt-6 grid gap-6 px-4 md:px-6 xl:grid-cols-[1fr_380px]">
        <section className="min-w-0">
          <h2 className="mb-2 font-bold">Mesas abertas</h2>
          {!carregando && abertas.length === 0 ? (
            <Vazio Icone={UtensilsCrossed} titulo="Nenhuma mesa aberta agora" />
          ) : (
            <ul className="card divide-y divide-borda overflow-hidden">
              {abertas.map((v) => {
                const st = statusCozinha(v);
                return (
                  <li key={v.id}>
                    <Link
                      href={`/admin/comandas/ver?id=${v.id}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-superficie-2"
                    >
                      <span
                        className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-black ${
                          st.prontos > 0 ? "bg-sky-500 text-white" : "bg-amber-400 text-amber-950"
                        }`}
                      >
                        {v.mesa ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {v.clienteNome ?? (v.mesa ? `Mesa ${v.mesa}` : "Sem nome")}
                        </span>
                        <span className="block text-xs text-texto-suave">
                          {numeroVenda(v.numero)} · {nomePessoa(v.garcom) || "—"} · {unidadesVenda(v)} itens · há{" "}
                          {minutosDesde(v.abertaEm, agora)} min
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {st.prontos > 0 && (
                            <span className="chip bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                              <BellRing className="h-3 w-3" />
                              {st.prontos} pronto(s)
                            </span>
                          )}
                          {st.preparo > 0 && (
                            <span className="chip bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                              <ChefHat className="h-3 w-3" />
                              {st.preparo} na cozinha
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-lg font-black text-acento tabular-nums">{brl(totalVenda(v))}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <section>
            <h2 className="mb-2 font-bold">Por garçom</h2>
            {porGarcom.length === 0 ? (
              <p className="card px-4 py-6 text-center text-sm text-texto-suave">Sem movimento hoje.</p>
            ) : (
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-superficie-2 text-left text-[11px] font-bold tracking-wide text-texto-suave uppercase">
                    <tr>
                      <th className="px-3 py-2">Garçom</th>
                      <th className="px-2 py-2 text-right">Mesas</th>
                      <th className="px-2 py-2 text-right">Pedidos</th>
                      <th className="px-3 py-2 text-right">Vendido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borda">
                    {porGarcom.map((g) => (
                      <tr key={g.nome}>
                        <td className="max-w-[120px] truncate px-3 py-2 font-semibold">{g.nome}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{g.abertas}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{g.pedidos}</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">{brl(g.aberto + g.fechado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-borda px-3 py-2 text-[11px] text-texto-suave">
                  Vendido = mesas abertas + fechadas hoje.
                </p>
              </div>
            )}
          </section>

          <LinkGarcom />
        </aside>
      </div>
    </>
  );
}

/** Link do app do garçom, pra mandar no WhatsApp da equipe. */
function LinkGarcom() {
  const [url, setUrl] = useState("");
  const [copiado, setCopiado] = useState(false);
  useEffect(() => setUrl(`${window.location.origin}/garcom`), []);

  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-bold">
        <Smartphone className="h-4 w-4 text-acento" />
        App do garçom
      </h2>
      <div className="flex gap-2">
        <input className="campo min-w-0 flex-1 text-sm" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button
          className="btn-secundario px-3"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {
              // sem permissão pra copiar: o campo já fica selecionável
            }
          }}
          aria-label="Copiar link"
        >
          {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-texto-suave">
        <li>
          Crie o login do garçom em <Link href="/admin/equipe" className="font-semibold text-acento">Equipe</Link>,
          escolhendo o tipo <strong>Garçom</strong>.
        </li>
        <li>Mande esse link pra ele e entre com o login no celular.</li>
        <li>
          Android: toque em <strong>Instalar</strong> no topo. iPhone: Compartilhar → <strong>Adicionar à Tela de Início</strong>.
        </li>
      </ol>
    </section>
  );
}

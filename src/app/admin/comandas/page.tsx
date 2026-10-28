"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Plus, Search } from "lucide-react";
import { Cabecalho, Modal, Vazio } from "@/components/ui";
import { Protegido } from "@/components/Protegido";
import { SeletorCliente, novaVenda } from "@/components/Vendas";
import { ChipStatusVenda, DetalheVenda } from "@/components/DetalheVenda";
import { useDados } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { brl, dataBR, dataHoraBR, hojeISO, normalizar } from "@/lib/format";
import { numeroVenda, saldoVenda, totalVenda, vendaEmAberto } from "@/lib/vendas";
import type { Cliente, Venda } from "@/lib/types";

type Aba = "abertas" | "receber" | "fechadas";

export default function ComandasPage() {
  return (
    <Protegido chave="comandas">
      <Suspense>
        <ComandasInterno />
      </Suspense>
    </Protegido>
  );
}

function ComandasInterno() {
  const router = useRouter();
  const params = useSearchParams();
  const { vendas, salvarVenda, proximoNumeroVenda, carregando } = useDados();
  const { usuario } = useAuth();
  const [aba, setAba] = useState<Aba>(() => (params.get("aba") === "receber" ? "receber" : "abertas"));
  const [busca, setBusca] = useState("");
  const [abrindo, setAbrindo] = useState(() => params.get("nova") === "1");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [vendo, setVendo] = useState<Venda | null>(null);

  const comandas = useMemo(() => vendas.filter((v) => v.tipo === "COMANDA"), [vendas]);
  const abertas = comandas.filter((v) => v.status === "ABERTA");
  // A receber inclui venda de balcão? Não — balcão sempre é pago na hora.
  const aReceber = comandas.filter(vendaEmAberto).sort((a, b) =>
    (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999"),
  );
  const fechadas = comandas.filter((v) => v.status !== "ABERTA" && !vendaEmAberto(v));

  const lista = (aba === "abertas" ? abertas : aba === "receber" ? aReceber : fechadas).filter(
    (v) => !busca || normalizar(v.clienteNome ?? "").includes(normalizar(busca)),
  );

  const hoje = hojeISO();
  const totalAberto = abertas.reduce((s, v) => s + totalVenda(v), 0);
  const totalReceber = aReceber.reduce((s, v) => s + saldoVenda(v), 0);

  async function abrir() {
    if (!cliente) return;
    const comanda = novaVenda(
      {
        tipo: "COMANDA",
        itens: [],
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        operador: usuario?.email ?? undefined,
      },
      proximoNumeroVenda(),
    );
    await salvarVenda(comanda);
    setAbrindo(false);
    setCliente(null);
    router.push(`/admin/comandas/ver?id=${comanda.id}`);
  }

  function clicar(v: Venda) {
    if (v.status === "ABERTA") router.push(`/admin/comandas/ver?id=${v.id}`);
    else setVendo(v);
  }

  return (
    <>
      <Cabecalho
        titulo="Comandas"
        subtitulo="Venda a prazo — o estoque só baixa quando a comanda é finalizada"
        acao={
          <button className="btn-primario" onClick={() => setAbrindo(true)}>
            <Plus className="h-4 w-4" />
            Nova comanda
          </button>
        }
      />

      <div className="px-4 md:px-6">
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-superficie-2 p-1">
          {(
            [
              ["abertas", `Abertas (${abertas.length})`],
              ["receber", `A receber (${aReceber.length})`],
              ["fechadas", "Quitadas"],
            ] as [Aba, string][]
          ).map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={`rounded-lg py-2 text-xs font-bold transition sm:text-sm ${
                aba === chave ? "bg-superficie shadow-sm" : "text-texto-suave"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {aba !== "fechadas" && (
          <p className="mb-3 text-sm text-texto-suave">
            {aba === "abertas" ? (
              <>Em aberto: <strong className="text-texto tabular-nums">{brl(totalAberto)}</strong></>
            ) : (
              <>Falta receber: <strong className="text-acento tabular-nums">{brl(totalReceber)}</strong></>
            )}
          </p>
        )}

        <div className="relative mb-4">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-texto-suave" />
          <input
            className="campo pl-9"
            placeholder="Buscar cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {!carregando && lista.length === 0 ? (
        <Vazio
          Icone={ClipboardList}
          titulo={aba === "abertas" ? "Nenhuma comanda aberta" : aba === "receber" ? "Nada a receber 🎉" : "Nenhuma comanda quitada"}
          descricao={aba === "abertas" ? "Abra uma comanda pro cliente ir pegando e pagar depois." : undefined}
        />
      ) : (
        <ul className="mx-4 space-y-2 md:mx-6">
          {lista.map((v) => {
            const vencida = !!v.vencimento && v.vencimento < hoje && vendaEmAberto(v);
            return (
              <li key={v.id}>
                <button
                  onClick={() => clicar(v)}
                  className={`card flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-superficie-2 ${
                    vencida ? "border-red-300 dark:border-red-900" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold">{v.clienteNome}</p>
                      <ChipStatusVenda venda={v} />
                    </div>
                    <p className="mt-0.5 text-xs text-texto-suave">
                      {numeroVenda(v.numero)} · {v.itens.reduce((s, i) => s + i.qtd, 0)} itens ·{" "}
                      {v.status === "ABERTA"
                        ? `aberta ${dataHoraBR(v.abertaEm)}`
                        : v.vencimento && vendaEmAberto(v)
                          ? `vence ${dataBR(v.vencimento)}`
                          : `fechada ${dataHoraBR(v.finalizadaEm ?? v.atualizadoEm)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-black tabular-nums">{brl(aba === "receber" ? saldoVenda(v) : totalVenda(v))}</p>
                    {aba === "receber" && (
                      <p className="text-[11px] text-texto-suave tabular-nums">de {brl(totalVenda(v))}</p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        aberto={abrindo}
        aoFechar={() => setAbrindo(false)}
        titulo="Nova comanda"
        rodape={
          <>
            <button className="btn-secundario" onClick={() => setAbrindo(false)}>
              Cancelar
            </button>
            <button className="btn-primario" disabled={!cliente} onClick={abrir}>
              Abrir comanda
            </button>
          </>
        }
      >
        <SeletorCliente clienteId={cliente?.id ?? ""} aoMudar={setCliente} obrigatorio />
        <p className="mt-3 text-xs text-texto-suave">
          A comanda precisa de um cliente cadastrado — é com ele que fica a conta a receber.
        </p>
      </Modal>

      {vendo && (
        <DetalheVenda venda={vendas.find((v) => v.id === vendo.id) ?? vendo} aoFechar={() => setVendo(null)} />
      )}
    </>
  );
}

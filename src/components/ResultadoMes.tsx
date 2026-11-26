import { brl } from "@/lib/format";
import type { resultadoDoMes } from "@/lib/gastos";

const pct = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toFixed(1).replace(".", ",")}%` : "");

/**
 * Resultado do mês, do jeito que o dono fecha a conta:
 * entrou − reposição = lucro bruto; − despesas fixas = lucro líquido.
 * Sangria (dinheiro que foi pro banco) aparece à parte, fora da conta.
 */
export function ResultadoMes({ resultado: r }: { resultado: ReturnType<typeof resultadoDoMes> }) {
  const linha = (rotulo: string, valor: number, sinal: "" | "−" | "=", forte = false) => (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${forte ? "font-bold" : "text-sm"}`}>
      <span className={forte ? "" : "text-texto-suave"}>
        {sinal && <span className="mr-1.5 inline-block w-3 text-center">{sinal}</span>}
        {rotulo}
      </span>
      <span className="tabular-nums">
        {brl(valor)}
        {sinal === "−" && <span className="ml-1.5 text-xs font-normal text-texto-suave">{pct(valor, r.entrou)}</span>}
      </span>
    </div>
  );
  const negativo = r.lucroLiquido < 0;
  return (
    <section className="card elevar px-5 py-4">
      <h2 className="text-[11px] font-bold tracking-[0.06em] text-texto-suave uppercase">Resultado do mês</h2>
      <div className="mt-1 divide-y divide-borda">
        <div>
          {linha("Entrou", r.entrou, "")}
          {linha("Reposição (fornecedores, carne, carvão, gelo)", r.reposicao, "−")}
        </div>
        <div>
          {linha("Lucro bruto", r.lucroBruto, "=", true)}
          {linha("Despesas fixas", r.fixas, "−")}
        </div>
        <div className="flex items-baseline justify-between gap-3 pt-2">
          <span className="font-black">
            <span className="mr-1.5 inline-block w-3 text-center">=</span>Lucro líquido
          </span>
          <span
            className={`text-2xl font-black tracking-tight tabular-nums ${
              negativo ? "text-red-600 dark:text-red-400" : "texto-degrade"
            }`}
          >
            {brl(r.lucroLiquido)}
          </span>
        </div>
      </div>
      {r.sangria > 0 && (
        <p className="mt-2 text-xs text-texto-suave">
          Sangria (depósito no banco): {brl(r.sangria)}. Não entra na conta, o dinheiro continua sendo da loja.
        </p>
      )}
    </section>
  );
}

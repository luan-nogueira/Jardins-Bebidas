import { brl } from "@/lib/format";
import type { resultadoDoMes } from "@/lib/gastos";

const pct = (v: number, total: number) => (total > 0 ? `${((v / total) * 100).toFixed(1).replace(".", ",")}%` : "");

/**
 * Resultado do mês, do jeito que o dono fecha a conta:
 * entrou − reposição = lucro bruto; − despesas fixas = lucro líquido.
 * Sangria (dinheiro que foi pro banco) e retirada de sócio aparecem à parte, fora da conta.
 * O Bafo (churrasco de terceiro) sai da venda e aparece num anexo: vendido, repassado, falta repassar.
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
          {r.bafo > 0 && (
            <>
              {linha("Bafo (de terceiro, repassado)", r.bafo, "−")}
              {linha("Venda da loja", r.vendaLoja, "=", true)}
            </>
          )}
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
      {r.bafo > 0 && (
        <div className="mt-3 rounded-xl bg-superficie-2 px-3 py-2 text-xs">
          <p className="font-bold">Bafo (anexo, não é da loja)</p>
          <div className="mt-1 grid grid-cols-3 gap-2 tabular-nums">
            <span>
              <span className="block text-texto-suave">Vendido no sistema</span>
              {brl(r.bafoVendido)}
            </span>
            <span>
              <span className="block text-texto-suave">Repassado</span>
              {brl(r.bafoRepassado)}
            </span>
            <span>
              <span className="block text-texto-suave">Falta repassar</span>
              {brl(Math.max(0, r.bafoVendido - r.bafoRepassado))}
            </span>
          </div>
        </div>
      )}
      {(r.sangria > 0 || r.retirada > 0) && (
        <div className="mt-2 space-y-0.5 text-xs text-texto-suave">
          <p className="font-semibold">Fora da conta:</p>
          {r.retirada > 0 && <p>Retirada de sócio: {brl(r.retirada)}</p>}
          {r.sangria > 0 && <p>Sangria depositada: {brl(r.sangria)}, o dinheiro continua sendo da loja</p>}
        </div>
      )}
    </section>
  );
}

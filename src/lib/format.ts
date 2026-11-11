const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numero = new Intl.NumberFormat("pt-BR");

export function brl(valor: number): string {
  return moeda.format(valor || 0);
}

/** Igual ao brl, mas mostra "—" no lugar de R$ 0,00 (como na planilha). */
export function brlOuTraco(valor: number): string {
  if (!valor) return "—";
  return moeda.format(valor);
}

export function num(valor: number): string {
  return numero.format(valor || 0);
}

/** "2026-09-09" -> "09/09/2026" sem sofrer com fuso horário. */
export function dataBR(iso: string): string {
  if (!iso) return "";
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}

export function dataHoraBR(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Data de hoje em ISO (YYYY-MM-DD) no fuso local, não em UTC. */
export function hojeISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

/** Remove acentos e baixa a caixa, pra busca funcionar sem o usuário acentuar. */
/** Busca de produto: cada palavra em qualquer parte do nome ("batata casa" acha "Batata da casa"). */
export function temPalavras(texto: string, termo: string): boolean {
  const alvo = normalizar(texto);
  return normalizar(termo).split(/s+/).every((palavra) => alvo.includes(palavra));
}

export function normalizar(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Lê número digitado por gente: "6,90", "6.90", "1.250,00", "R$ 8".
 * Se tem vírgula, o ponto é separador de milhar; se não tem, o ponto é decimal.
 */
export function paraNumero(valor: string | number | null | undefined): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  let s = (valor ?? "").toString().trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Número para string editável em campo de texto ("6.9" -> "6,90"). */
export function paraCampo(valor: number, casas = 2): string {
  if (!valor) return "";
  return valor.toFixed(casas).replace(".", ",");
}

export function telefoneBR(valor: string): string {
  const d = (valor || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

/**
 * Quebra uma quantidade em unidades em "X cx + Y un". Faz a conta no valor
 * absoluto e põe o sinal na frente: com Math.floor direto, um estoque
 * negativo arredondava pra longe do zero (-119 un em cx de 24 virava
 * "-5 cx" em vez de "-4 cx - 23 un").
 */
export function caixasEUnidades(totalUn: number, unPorCaixa: number, pacote = "cx"): string {
  if (unPorCaixa <= 1) return `${totalUn} un`;
  const negativo = totalUn < 0;
  const abs = Math.abs(totalUn);
  const cx = Math.floor(abs / unPorCaixa);
  const un = abs % unPorCaixa;
  const sinal = negativo ? "-" : "";
  const juntar = negativo ? " - " : " + ";
  if (cx === 0) return `${sinal}${un} un`;
  // "cx" não vai pro plural; "maço" vira "maços".
  const rotulo = pacote !== "cx" && cx > 1 ? `${pacote}s` : pacote;
  return un > 0 ? `${sinal}${cx} ${rotulo}${juntar}${un} un` : `${sinal}${cx} ${rotulo}`;
}

/** Soma dias a uma data YYYY-MM-DD, sem passar por UTC. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** "14:05" de um timestamp ISO, no fuso local. */
export function horaBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

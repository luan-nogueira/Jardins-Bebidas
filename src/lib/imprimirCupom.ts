/**
 * Imprime o que está em .so-impressao numa página do tamanho do cupom:
 * 80mm de largura, altura do próprio conteúdo e margem zero. Sem isso o
 * Chrome usa a página A4 dos relatórios e o cupom sai miúdo no meio da
 * bobina (e a térmica gasta papel em branco até o fim da "folha").
 */
export function imprimirCupom() {
  const area = document.querySelector<HTMLElement>(".so-impressao");
  if (!area) return;

  // Mede fora da tela: cada cupom é uma página; usa a altura do maior.
  const antes = area.style.cssText;
  area.style.cssText = "display:block;position:absolute;left:-10000px;top:0;";
  const alturas = [...area.children].map((c) => (c as HTMLElement).getBoundingClientRect().height);
  area.style.cssText = antes;
  const alturaMm = Math.ceil((Math.max(100, ...alturas) * 25.4) / 96) + 4;

  const estilo = document.createElement("style");
  estilo.textContent = `@page { size: 80mm ${alturaMm}mm; margin: 0; } @page cupom { size: 80mm ${alturaMm}mm; margin: 0; }`;
  document.head.appendChild(estilo);
  document.body.classList.add("imprimindo-cupom");
  try {
    window.print();
  } finally {
    document.body.classList.remove("imprimindo-cupom");
    estilo.remove();
  }
}

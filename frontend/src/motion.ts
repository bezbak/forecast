/** Мелкие анимации интерфейса. Все отключаются при prefers-reduced-motion. */

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Короткая подсветка элемента, значение которого изменилось. */
export function flash(el: Element | null): void {
  if (!el || reducedMotion()) return;
  el.classList.remove("flash");
  void (el as HTMLElement).offsetWidth; // перезапуск CSS-анимации
  el.classList.add("flash");
}

/** Пошаговая отрисовка набора точек: вызывает draw(k) для k = 1..n за duration мс. */
export function progressive(n: number, draw: (k: number) => void, duration = 420): () => void {
  if (reducedMotion() || n <= 1) {
    draw(n);
    return () => undefined;
  }
  let raf = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    draw(Math.max(1, Math.round(eased * n)));
    if (t < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

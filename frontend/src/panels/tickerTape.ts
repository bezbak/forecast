import * as data from "../data";
import { pct, price, trend } from "../format";
import * as store from "../store";

/** Бегущая строка котировок. Пауза при наведении; без анимации при prefers-reduced-motion. */
export function mountTickerTape(el: HTMLElement): void {
  data.tickers().then((rows) => {
    if (!rows.length) return;
    const track = document.createElement("div");
    track.className = "tape-track";
    const item = (r: (typeof rows)[number]) => {
      const t = trend(r.change_pct);
      const glyph = t === "up" ? "▲" : t === "down" ? "▼" : "■";
      return `<button class="tape-item" data-ticker="${r.ticker}"><b>${r.ticker}</b>`
        + `<span class="num">${price(r.last)}</span><span class="num ${t}">${glyph} ${pct(r.change_pct)}</span></button>`;
    };
    const html = rows.map(item).join("");
    // Две копии подряд: анимация сдвигает ленту на половину и бесшовно начинается заново.
    track.innerHTML = `<div class="tape-run">${html}</div><div class="tape-run" aria-hidden="true">${html}</div>`;
    track.style.setProperty("--duration", `${rows.length * 2.4}s`);
    el.append(track);
    track.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(".tape-item");
      if (b) store.set({ ticker: b.dataset.ticker! });
    });
  }, () => undefined);
}

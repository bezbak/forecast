import type { ApiError, TickerRow } from "../api";
import * as data from "../data";
import { pct, price, trend } from "../format";
import { sparkline } from "../spark";
import * as store from "../store";
import { panelShell, renderError, renderLoading } from "./status";


export function mountWatchlist(el: HTMLElement): void {
  const { body, aux } = panelShell(el, "01", "Бумаги");
  aux.innerHTML = `<span class="num wl-count"></span>`;
  el.classList.add("wl");

  const search = document.createElement("label");
  search.className = "wl-search";
  search.innerHTML = `<input type="search" placeholder="Тикер или компания" spellcheck="false" autocomplete="off" aria-label="Поиск бумаги" /><kbd>/</kbd>`;
  const head = document.createElement("div");
  head.className = "wl-row wl-head label";
  head.innerHTML = `<span>Бумага</span><span>30 дн.</span><span class="r">Цена · изм.</span>`;
  el.insertBefore(search, body);
  el.insertBefore(head, body);
  const input = search.querySelector("input") as HTMLInputElement;

  let rows: TickerRow[] = [];
  let visible: TickerRow[] = [];

  function render(): void {
    const q = input.value.trim().toLowerCase();
    visible = q ? rows.filter((r) => r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) : rows;
    (aux.firstElementChild as HTMLElement).textContent = q ? `${visible.length}/${rows.length}` : String(rows.length);
    if (!visible.length) {
      body.innerHTML = `<div class="wl-none">Ничего не найдено</div>`;
      return;
    }
    const current = store.get().ticker;
    body.innerHTML = `<ul class="wl-list" role="listbox" aria-label="Бумаги">${visible.map((r) => `
      <li class="wl-row" role="option" data-ticker="${r.ticker}" aria-selected="${r.ticker === current}" title="${r.name} · ${r.sector}">
        <span class="wl-id"><span class="num wl-t">${r.ticker}</span><span class="wl-n">${r.name}</span></span>
        ${sparkline(r.spark)}
        <span class="wl-px r"><span class="num">${price(r.last)}</span><span class="num ${trend(r.change_pct)}">${pct(r.change_pct)}</span></span>
      </li>`).join("")}</ul>`;
  }

  function scrollToSelected(block: ScrollLogicalPosition = "nearest"): void {
    body.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block });
  }

  /** Сдвиг выбора по видимому списку (стрелки). */
  function move(delta: number): void {
    if (!visible.length) return;
    const i = visible.findIndex((r) => r.ticker === store.get().ticker);
    const next = i < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, i + delta));
    store.set({ ticker: visible[next].ticker });
  }

  body.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>(".wl-row[data-ticker]");
    if (li) store.set({ ticker: li.dataset.ticker! });
  });
  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      render();
      input.blur();
      scrollToSelected("center");
    } else if (e.key === "Enter" && visible.length) {
      store.set({ ticker: visible[0].ticker });
      input.blur();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = e.target instanceof HTMLInputElement && e.target.type !== "range";
    if (e.key === "/" && !typing) {
      e.preventDefault();
      input.focus();
      input.select();
    } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && (!typing || e.target === input)) {
      if (e.target instanceof HTMLInputElement && e.target.type === "range") return;
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    }
  });

  store.subscribe((s, changed) => {
    if (!changed.has("ticker")) return;
    body.querySelectorAll<HTMLElement>(".wl-row[data-ticker]").forEach((li) =>
      li.setAttribute("aria-selected", String(li.dataset.ticker === s.ticker)));
    scrollToSelected();
  });

  function load(): void {
    renderLoading(body);
    data.tickers().then((r) => {
      rows = r;
      document.getElementById("market-count")!.textContent = String(r.length);
      render();
      scrollToSelected("center");
    }, (e: ApiError) => renderError(body, e, load));
  }
  load();
}

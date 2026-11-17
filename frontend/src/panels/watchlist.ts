import type { ApiError, TickerRow } from "../api";
import * as data from "../data";
import { pct, price, trend } from "../format";
import * as store from "../store";
import { panelShell, renderError, renderLoading } from "./status";

export function mountWatchlist(el: HTMLElement): void {
  const { body, aux } = panelShell(el, "01", "Бумаги");
  aux.innerHTML = `<span class="num wl-count"></span>`;
  el.classList.add("wl");

  const search = document.createElement("label");
  search.className = "wl-search";
  search.innerHTML = `<input type="search" placeholder="Тикер или компания" spellcheck="false" autocomplete="off" /><kbd>/</kbd>`;
  const head = document.createElement("div");
  head.className = "wl-row wl-head label";
  head.innerHTML = `<span>Тикер</span><span></span><span class="r">Цена</span><span class="r">Изм.</span>`;
  el.insertBefore(search, body);
  el.insertBefore(head, body);
  const input = search.querySelector("input") as HTMLInputElement;

  let rows: TickerRow[] = [];

  function render(): void {
    const q = input.value.trim().toLowerCase();
    const list = q ? rows.filter((r) => r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)) : rows;
    (aux.firstElementChild as HTMLElement).textContent = q ? `${list.length}/${rows.length}` : String(rows.length);
    const current = store.get().ticker;
    body.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "wl-list";
    ul.setAttribute("role", "listbox");
    for (const r of list) {
      const li = document.createElement("li");
      li.className = "wl-row";
      li.dataset.ticker = r.ticker;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(r.ticker === current));
      li.innerHTML = `<span class="num wl-t"></span><span class="wl-n"></span><span class="num r"></span><span class="num r ${trend(r.change_pct)}"></span>`;
      const [t, n, p, c] = li.children as unknown as HTMLElement[];
      t.textContent = r.ticker;
      n.textContent = r.name;
      n.title = `${r.name} · ${r.sector}`;
      p.textContent = price(r.last);
      c.textContent = pct(r.change_pct);
      ul.append(li);
    }
    if (!list.length) {
      body.innerHTML = `<div class="wl-none">Ничего не найдено</div>`;
      return;
    }
    body.append(ul);
  }

  body.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>(".wl-row[data-ticker]");
    if (li) store.set({ ticker: li.dataset.ticker! });
  });
  input.addEventListener("input", render);

  store.subscribe((s, changed) => {
    if (!changed.has("ticker")) return;
    body.querySelectorAll<HTMLElement>(".wl-row[data-ticker]").forEach((li) =>
      li.setAttribute("aria-selected", String(li.dataset.ticker === s.ticker)));
    body.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  });

  function load(): void {
    renderLoading(body);
    data.tickers().then((r) => {
      rows = r;
      document.getElementById("market-count")!.textContent = String(r.length);
      render();
      body.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
    }, (e: ApiError) => renderError(body, e, load));
  }
  load();
}

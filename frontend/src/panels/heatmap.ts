import type { ApiError, OverviewRow } from "../api";
import * as data from "../data";
import { pct, trend } from "../format";
import * as store from "../store";
import { MODEL_LABELS } from "../store";
import { panelShell, renderError, renderLoading } from "./status";

type Mode = "today" | "forecast";
const LIMIT: Record<Mode, number> = { today: 3, forecast: 5 }; // насыщенность цвета достигается при ±N%

const SECTORS_RU: Record<string, string> = {
  "Information Technology": "Технологии",
  "Communication Services": "Связь и медиа",
  "Consumer Discretionary": "Потребительский сектор",
  "Consumer Staples": "Товары первой необходимости",
  "Health Care": "Здравоохранение",
  Industrials: "Промышленность",
  Utilities: "Коммунальные",
  Energy: "Энергетика",
  Materials: "Материалы",
  Financials: "Финансы",
  "Real Estate": "Недвижимость",
};

/** Тепловая карта рынка: плитки по секторам, цвет — изменение сегодня или прогноз на 7 дней. */
export function mountHeatmap(el: HTMLElement, tabs: HTMLElement): { show: () => void } {
  const { body, aux } = panelShell(el, "05", "Карта рынка");
  el.classList.add("hm");
  let mode: Mode = "forecast";
  let rows: OverviewRow[] = [];
  let loaded = false;

  const seg = document.createElement("div");
  seg.className = "seg";
  seg.innerHTML = `<button data-mode="today">Сегодня</button><button data-mode="forecast" title="Прогноз лучшей по MAE модели, кроме Naive">Прогноз 7 дн.</button>`;
  seg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button[data-mode]");
    if (!b) return;
    mode = b.dataset.mode as Mode;
    render();
  });
  const legend = document.createElement("span");
  legend.className = "hm-legend num";
  aux.append(legend, seg, tabs);

  function render(): void {
    seg.querySelectorAll<HTMLElement>("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    const lim = LIMIT[mode];
    legend.innerHTML = `<span>−${lim}%</span><i></i><span>+${lim}%</span>`;
    if (!rows.length) return;
    const bySector = new Map<string, OverviewRow[]>();
    for (const r of rows) bySector.set(r.sector, [...(bySector.get(r.sector) ?? []), r]);
    const sectors = [...bySector.entries()].sort((a, b) => b[1].length - a[1].length);
    const current = store.get().ticker;
    body.innerHTML = `<div class="hm-grid">${sectors.map(([sector, list]) => `
      <section class="hm-sector" style="--n:${list.length}">
        <h3 class="label">${SECTORS_RU[sector] ?? sector} <span class="num">${list.length}</span></h3>
        <div class="hm-tiles">${list.map((r) => {
          const v = mode === "today" ? r.change_pct : r.forecast_pct;
          const k = v == null ? 0 : Math.min(1, Math.abs(v) / lim);
          const dir = v == null ? "none" : trend(Math.abs(v) < 0.05 ? 0 : v);
          const by = mode === "forecast" && r.forecast_model ? ` · модель ${MODEL_LABELS[r.forecast_model]}` : "";
          const text = v == null ? "нет прогноза" : pct(v) + by;
          return `<button class="hm-tile ${dir}" data-ticker="${r.ticker}" style="--k:${k.toFixed(3)}"`
            + ` aria-current="${r.ticker === current}" title="${r.ticker}: ${text}">`
            + `<b>${r.ticker}</b><span class="num">${v == null ? "—" : pct(v, 1)}</span></button>`;
        }).join("")}</div>
      </section>`).join("")}</div>`;
  }

  body.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(".hm-tile");
    if (b) store.set({ ticker: b.dataset.ticker! });
  });

  function load(): void {
    renderLoading(body);
    data.overview().then((r) => { rows = r; render(); }, (e: ApiError) => renderError(body, e, load));
  }

  store.subscribe((s, changed) => {
    if (!changed.has("ticker")) return;
    el.querySelectorAll<HTMLElement>(".hm-tile").forEach((t) => t.setAttribute("aria-current", String(t.dataset.ticker === s.ticker)));
  });

  return {
    /** Карта грузится при первом показе вкладки: этот запрос тяжелее остальных. */
    show(): void {
      if (loaded) return;
      loaded = true;
      load();
    },
  };
}

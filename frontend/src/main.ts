import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/ibm-plex-sans-condensed/400.css";
import "@fontsource/ibm-plex-sans-condensed/500.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/panels.css";
import "./styles/views.css";

import { getMeta } from "./api";
import { dateRu } from "./format";
import { mountChart } from "./panels/chart";
import { mountComparison } from "./panels/comparison";
import { mountHeatmap } from "./panels/heatmap";
import { mountModelPanel } from "./panels/modelPanel";
import { mountTickerTape } from "./panels/tickerTape";
import { mountWatchlist } from "./panels/watchlist";
import * as store from "./store";
import { MODELS } from "./store";

const $ = (id: string) => document.getElementById(id) as HTMLElement;

mountTickerTape($("tape"));
mountWatchlist($("watchlist"));
mountChart($("chart"));
mountModelPanel($("model"));

// Нижняя панель: вкладки «Модели» (сравнение) и «Рынок» (тепловая карта) в одной ячейке сетки
const tabSets: HTMLElement[] = [];
function makeTabs(): HTMLElement {
  const seg = document.createElement("div");
  seg.className = "seg seg-tabs";
  seg.innerHTML = `<button data-tab="models">Модели</button><button data-tab="market">Рынок</button>`;
  seg.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("button[data-tab]");
    if (b) showTab(b.dataset.tab as "models" | "market");
  });
  tabSets.push(seg);
  return seg;
}
mountComparison($("comparison"), makeTabs());
const heatmap = mountHeatmap($("heatmap"), makeTabs());
function showTab(tab: "models" | "market"): void {
  $("app").classList.toggle("show-heat", tab === "market");
  tabSets.forEach((s) => s.querySelectorAll<HTMLElement>("button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.tab === tab))));
  if (tab === "market") heatmap.show();
}
showTab("models");

// 1–4 — выбор модели, если фокус не в поле ввода
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement) return;
  const i = Number(e.key) - 1;
  if (Number.isInteger(i) && i >= 0 && i < MODELS.length) store.set({ model: MODELS[i] });
});

getMeta()
  .then((m) => {
    $("universe-asof").textContent = dateRu(m.universe_asof);
    $("data-asof").textContent = m.data_asof ? dateRu(m.data_asof) : "—";
  })
  .catch(() => $("conn-dot").classList.add("off"));

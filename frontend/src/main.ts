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
mountComparison($("comparison"));

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

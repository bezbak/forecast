import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/ibm-plex-sans-condensed/400.css";
import "@fontsource/ibm-plex-sans-condensed/500.css";
import "@fontsource/ibm-plex-sans-condensed/600.css";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/panels.css";

import { getMeta } from "./api";
import { dateRu } from "./format";
import { panelShell } from "./panels/status";

const $ = (id: string) => document.getElementById(id) as HTMLElement;

panelShell($("watchlist"), "01", "Бумаги");
panelShell($("chart"), "02", "График");
panelShell($("model"), "03", "Модель");
panelShell($("comparison"), "04", "Сравнение моделей");

getMeta()
  .then((m) => {
    $("universe-asof").textContent = dateRu(m.universe_asof);
    $("data-asof").textContent = m.data_asof ? dateRu(m.data_asof) : "—";
  })
  .catch(() => $("conn-dot").classList.add("off"));

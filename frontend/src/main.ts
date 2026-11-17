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
import { mountWatchlist } from "./panels/watchlist";

const $ = (id: string) => document.getElementById(id) as HTMLElement;

mountWatchlist($("watchlist"));
mountChart($("chart"));
mountModelPanel($("model"));
mountComparison($("comparison"));

getMeta()
  .then((m) => {
    $("universe-asof").textContent = dateRu(m.universe_asof);
    $("data-asof").textContent = m.data_asof ? dateRu(m.data_asof) : "—";
  })
  .catch(() => $("conn-dot").classList.add("off"));

import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  type IChartApi, type ISeriesApi, type MouseEventParams, type Time,
} from "lightweight-charts";
import type { ApiError, Candle, ForecastResponse, RangeName } from "../api";
import * as data from "../data";
import { compact, dateRu, pct, price, trend } from "../format";
import * as store from "../store";
import { MODEL_LABELS } from "../store";
import { flash, progressive } from "../motion";
import { panelShell, renderEmpty, renderError, renderLoading } from "./status";

const RANGES: [RangeName, string][] = [["1M", "1М"], ["3M", "3М"], ["6M", "6М"], ["1Y", "1Г"], ["5Y", "5Л"], ["ALL", "Всё"]];
const SVG = "http://www.w3.org/2000/svg";

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function mountChart(el: HTMLElement): void {
  const { body, aux } = panelShell(el, "02", "График");
  el.classList.add("ch");

  const seg = document.createElement("div");
  seg.className = "seg";
  for (const [r, label] of RANGES) {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.range = r;
    b.addEventListener("click", () => store.set({ range: r }));
    seg.append(b);
  }
  aux.append(seg);

  const quote = document.createElement("div");
  quote.className = "ch-quote";
  quote.innerHTML = `
    <div class="ch-id"><span class="num ch-ticker"></span><span class="ch-name"></span></div>
    <div class="ch-px"><span class="num ch-last"></span><span class="num ch-chg"></span></div>
    <div class="ch-fc"></div>
    <dl class="ch-ohlc num"></dl>`;
  el.insertBefore(quote, body);
  const q = (s: string) => quote.querySelector(s) as HTMLElement;

  const host = document.createElement("div");
  host.className = "ch-host";
  const overlay = document.createElementNS(SVG, "svg");
  overlay.classList.add("ch-overlay");
  const band = document.createElementNS(SVG, "path");
  band.classList.add("ch-band");
  const zone = document.createElementNS(SVG, "rect");
  zone.classList.add("ch-zone");
  const today = document.createElementNS(SVG, "line");
  today.classList.add("ch-today");
  const todayLabel = document.createElementNS(SVG, "text");
  todayLabel.classList.add("ch-today-label");
  todayLabel.textContent = "СЕГОДНЯ";
  overlay.append(zone, band, today, todayLabel);
  const stateBox = document.createElement("div");
  stateBox.className = "ch-state";

  let chart: IChartApi | null = null;
  let candleSeries: ISeriesApi<"Candlestick"> | null = null;
  let volumeSeries: ISeriesApi<"Histogram"> | null = null;
  let fcLine: ISeriesApi<"Line"> | null = null;
  let loLine: ISeriesApi<"Line"> | null = null;
  let hiLine: ISeriesApi<"Line"> | null = null;
  let candles: Candle[] = [];
  let fc: ForecastResponse | null = null;
  let shown = 0; // сколько точек прогноза уже нарисовано (для анимации)
  let stopAnim: () => void = () => undefined;

  function ensureChart(): void {
    if (chart) return;
    body.innerHTML = "";
    body.append(host, stateBox);
    host.append(overlay);
    const grid = css("--line");
    chart = createChart(host, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: css("--bg") },
        textColor: css("--fg-3"),
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        attributionLogo: false,
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: grid, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { borderColor: grid, rightOffset: 4, minBarSpacing: 1.5 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: css("--fg-3"), style: LineStyle.Dashed, labelBackgroundColor: css("--bg-3") },
        horzLine: { color: css("--fg-3"), style: LineStyle.Dashed, labelBackgroundColor: css("--bg-3") },
      },
      localization: { locale: "ru-RU", priceFormatter: (p: number) => price(p) },
    });
    const up = css("--up");
    const down = css("--down");
    candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false,
    });
    volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const accent = css("--accent");
    const bandOpts = {
      color: css("--accent-line"), lineWidth: 1 as const, lineStyle: LineStyle.Dotted,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
    };
    loLine = chart.addSeries(LineSeries, bandOpts);
    hiLine = chart.addSeries(LineSeries, bandOpts);
    fcLine = chart.addSeries(LineSeries, {
      color: accent, lineWidth: 2, lineStyle: LineStyle.Dashed, priceLineVisible: false,
      crosshairMarkerBackgroundColor: accent,
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(drawOverlay);
    chart.subscribeCrosshairMove(onCrosshair);
    new ResizeObserver(() => requestAnimationFrame(drawOverlay)).observe(host);
  }

  /** Полоса интервала и зона прогноза рисуются поверх графика в координатах графика. */
  function drawOverlay(): void {
    if (!chart || !candleSeries || !candles.length) return;
    const ts = chart.timeScale();
    const w = host.clientWidth;
    const h = host.clientHeight;
    overlay.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const x0 = ts.timeToCoordinate(candles[candles.length - 1].time as Time);
    const plotW = w - chart.priceScale("right").width();
    const plotH = h - ts.height();
    const visible = x0 != null && x0 >= 0 && x0 <= plotW;
    today.style.display = todayLabel.style.display = zone.style.display = visible ? "" : "none";
    if (visible) {
      today.setAttribute("x1", String(x0)); today.setAttribute("x2", String(x0));
      today.setAttribute("y1", "0"); today.setAttribute("y2", String(plotH));
      todayLabel.setAttribute("x", String(x0 + 6)); todayLabel.setAttribute("y", "14");
      zone.setAttribute("x", String(x0)); zone.setAttribute("y", "0");
      zone.setAttribute("width", String(Math.max(0, plotW - x0))); zone.setAttribute("height", String(plotH));
    }
    const pts = fc?.status === "ok" ? fc.points.slice(0, shown) : [];
    if (!pts.length || x0 == null) {
      band.setAttribute("d", "");
      return;
    }
    const last = candles[candles.length - 1];
    const top: string[] = [];
    const bottom: string[] = [];
    const y0 = candleSeries.priceToCoordinate(last.close);
    if (y0 == null) return;
    top.push(`${x0},${y0}`);
    bottom.push(`${x0},${y0}`);
    for (const p of pts) {
      const x = ts.timeToCoordinate(p.date as Time);
      const yh = candleSeries.priceToCoordinate(p.hi);
      const yl = candleSeries.priceToCoordinate(p.lo);
      if (x == null || yh == null || yl == null) continue;
      top.push(`${x},${yh}`);
      bottom.push(`${x},${yl}`);
    }
    band.setAttribute("d", `M${top.join("L")}L${bottom.reverse().join("L")}Z`);
  }

  function setOhlc(c: Candle | undefined): void {
    const dl = q(".ch-ohlc");
    if (!c) { dl.innerHTML = ""; return; }
    const cls = trend(c.close - c.open);
    dl.innerHTML = `<dt>${dateRu(c.time)}</dt>`
      + [["О", c.open], ["М", c.high], ["Н", c.low], ["З", c.close]]
        .map(([k, v]) => `<dt>${k}</dt><dd class="${cls}">${price(v as number)}</dd>`).join("")
      + `<dt>Об</dt><dd>${compact(c.volume)}</dd>`;
  }

  function onCrosshair(p: MouseEventParams): void {
    drawOverlay();
    if (!p.time) { setOhlc(candles[candles.length - 1]); return; }
    setOhlc(candles.find((c) => c.time === p.time) ?? candles[candles.length - 1]);
  }

  function renderForecastLines(animate = false): void {
    if (!fcLine || !loLine || !hiLine || !candles.length) return;
    stopAnim();
    const last = candles[candles.length - 1];
    const ok = fc?.status === "ok" && fc.points.length > 0;
    const start = { time: last.time as Time, value: last.close };
    const pts = ok ? fc!.points : [];
    const series = (key: "value" | "lo" | "hi") => [start, ...pts.map((p) => ({ time: p.date as Time, value: p[key] }))];
    const all = { value: series("value"), lo: series("lo"), hi: series("hi") };
    const draw = (k: number) => {
      shown = k;
      fcLine!.setData(ok ? all.value.slice(0, k + 1) : []);
      loLine!.setData(ok ? all.lo.slice(0, k + 1) : []);
      hiLine!.setData(ok ? all.hi.slice(0, k + 1) : []);
      drawOverlay();
    };
    if (animate && ok) {
      draw(1);
      stopAnim = progressive(pts.length, draw);
    } else {
      draw(pts.length);
    }
    const box = q(".ch-fc");
    const s = store.get();
    if (ok) {
      const end = fc!.points[fc!.points.length - 1];
      const change = (end.value / fc!.last_close - 1) * 100;
      box.innerHTML = `<span class="label">Прогноз · ${MODEL_LABELS[s.model]} · ${s.horizon} дн.</span>`
        + `<span class="num">${price(end.value)}</span><span class="num ${trend(change)}">${pct(change)}</span>`;
      if (animate) box.querySelectorAll(".num").forEach(flash);
    } else {
      const why = fc?.status === "insufficient_data" ? "недостаточно истории"
        : fc?.status === "failed" ? "ошибка обучения модели" : "нет прогноза";
      box.innerHTML = `<span class="label">Прогноз · ${MODEL_LABELS[s.model]}</span><span class="ch-fc-off">${why}</span>`;
    }
  }

  function renderQuote(): void {
    const s = store.get();
    q(".ch-ticker").textContent = s.ticker;
    data.tickers().then((rows) => {
      const r = rows.find((x) => x.ticker === s.ticker);
      q(".ch-name").textContent = r?.name ?? "";
      q(".ch-last").textContent = r ? price(r.last) : "—";
      const chg = q(".ch-chg");
      chg.textContent = r ? pct(r.change_pct) : "";
      chg.className = `num ch-chg ${trend(r?.change_pct)}`;
    }, () => undefined);
  }

  const nextCandles = data.latest();
  function loadCandles(): void {
    const s = store.get();
    const isCurrent = nextCandles();
    if (!chart) renderLoading(body);
    data.candles(s.ticker, s.range).then((rows) => {
      if (!isCurrent()) return;
      ensureChart();
      stateBox.innerHTML = "";
      candles = rows;
      candleSeries!.setData(rows.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
      const upVol = css("--up-dim");
      const downVol = css("--down-dim");
      volumeSeries!.setData(rows.map((c) => ({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? upVol : downVol })));
      setOhlc(rows[rows.length - 1]);
      renderForecastLines();
      chart!.timeScale().fitContent();
    }, (e: ApiError) => {
      if (!isCurrent()) return;
      chart?.remove();
      chart = null;
      candles = [];
      setOhlc(undefined);
      if (e.status === 404) renderEmpty(body, e.message);
      else renderError(body, e, () => { loadCandles(); loadForecast(); });
    });
  }

  const nextForecast = data.latest();
  function loadForecast(): void {
    const s = store.get();
    const isCurrent = nextForecast();
    data.forecast(s.ticker, s.model, s.horizon).then((f) => {
      if (!isCurrent()) return;
      fc = f;
      renderForecastLines(true);
    }, () => {
      if (!isCurrent()) return;
      fc = null;
      renderForecastLines();
    });
  }

  store.subscribe((s, changed) => {
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === s.range)));
    if (changed.has("ticker")) { fc = null; renderQuote(); }
    if (changed.has("ticker") || changed.has("range")) loadCandles();
    if (changed.has("ticker") || changed.has("model") || changed.has("horizon")) loadForecast();
  });
}

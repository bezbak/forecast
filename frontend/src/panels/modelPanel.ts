import type { ApiError, MetricsResponse, ModelMetrics } from "../api";
import * as data from "../data";
import { dateRu, pct, price, trend } from "../format";
import * as store from "../store";
import { MODEL_LABELS, MODELS } from "../store";
import { flash } from "../motion";
import { panelShell, renderEmpty, renderError, renderLoading } from "./status";

export const MODEL_NOTES: Record<string, string> = {
  naive: "Завтра = сегодня. Базовая линия",
  arima: "Статистическая модель временного ряда",
  boosting: "Деревья решений по тех. признакам",
  lstm: "Нейросеть, окно 60 торговых дней",
};

const HORIZON_MARKS = [1, 5, 10, 15, 20, 25, 30];

function metricOf(m: MetricsResponse | null, name: string): ModelMetrics | undefined {
  return m?.models.find((x) => x.model === name);
}

export function mountModelPanel(el: HTMLElement): void {
  const { body } = panelShell(el, "03", "Модель");
  el.classList.add("mp");
  let metrics: MetricsResponse | null = null;

  body.innerHTML = `
    <div class="mp-models" role="radiogroup" aria-label="Модель прогноза"></div>
    <div class="mp-section">
      <div class="mp-row"><span class="label">Горизонт</span><span class="num mp-h"></span></div>
      <input class="mp-range" type="range" min="1" max="30" step="1" aria-label="Горизонт прогноза в торговых днях" />
      <div class="mp-ticks num">${HORIZON_MARKS.map((d) => `<span>${d}</span>`).join("")}</div>
    </div>
    <div class="mp-section mp-result"></div>
    <div class="mp-section mp-quality"></div>
    <p class="mp-note">Точность — на последних 252 торговых днях: модель каждый день прогнозирует следующий, не видя будущего.</p>`;
  const $ = (s: string) => body.querySelector(s) as HTMLElement;
  const range = $(".mp-range") as HTMLInputElement;

  const models = $(".mp-models");
  MODELS.forEach((name, i) => {
    const b = document.createElement("button");
    b.className = "mp-model";
    b.dataset.model = name;
    b.setAttribute("role", "radio");
    b.innerHTML = `<kbd>${i + 1}</kbd><span class="mp-mname">${MODEL_LABELS[name]}</span>`
      + `<span class="num mp-mape"></span><span class="mp-mnote">${MODEL_NOTES[name]}</span>`;
    b.addEventListener("click", () => store.set({ model: name }));
    models.append(b);
  });

  function setRangeFill(): void {
    range.style.setProperty("--fill", `${((Number(range.value) - 1) / 29) * 100}%`);
  }
  range.addEventListener("input", () => {
    $(".mp-h").textContent = `${range.value} дн.`;
    setRangeFill();
  });
  range.addEventListener("change", () => store.set({ horizon: Number(range.value) }));

  function renderModels(): void {
    const s = store.get();
    models.querySelectorAll<HTMLElement>(".mp-model").forEach((b) => {
      const name = b.dataset.model!;
      b.setAttribute("aria-checked", String(name === s.model));
      const m = metricOf(metrics, name);
      const cell = b.querySelector(".mp-mape") as HTMLElement;
      cell.textContent = m?.mape != null ? `${m.mape.toFixed(2)}%` : "—";
      cell.title = "MAPE — средняя ошибка в процентах";
    });
  }

  function renderQuality(): void {
    const box = $(".mp-quality");
    const s = store.get();
    if (metrics?.status === "insufficient_data") {
      box.innerHTML = `<span class="label">Точность</span><p class="mp-warn">Недостаточно истории для прогноза</p>`;
      return;
    }
    const m = metricOf(metrics, s.model);
    if (!m || m.status !== "ok") {
      const why = m?.status === "failed" ? "Модель не обучилась на этой бумаге" : "Нет данных о точности";
      box.innerHTML = `<span class="label">Точность</span><p class="mp-warn">${why}</p>`;
      return;
    }
    const tag = m.beats_naive === false ? `<span class="tag tag-down">Не лучше базовой модели</span>`
      : m.beats_naive ? `<span class="tag tag-up">Лучше базовой модели</span>` : "";
    box.innerHTML = `<div class="mp-row"><span class="label">Точность · ${MODEL_LABELS[m.model]}</span>${tag}</div>
      <dl class="mp-kv">
        <dt>MAPE</dt><dd class="num">${m.mape!.toFixed(2)}%</dd>
        <dt>MAE</dt><dd class="num">${price(m.mae!)} $</dd>
        <dt>Направление</dt><dd class="num">${m.direction != null ? `${m.direction.toFixed(1)}%` : "—"}</dd>
      </dl>`;
  }

  const nextResult = data.latest();
  function renderResult(): void {
    const box = $(".mp-result");
    const s = store.get();
    const isCurrent = nextResult();
    data.forecast(s.ticker, s.model, s.horizon).then((f) => {
      if (!isCurrent()) return;
      if (f.status !== "ok" || !f.points.length) {
        box.innerHTML = `<span class="label">Прогноз</span><p class="mp-warn">Прогноз недоступен</p>`;
        return;
      }
      const end = f.points[f.points.length - 1];
      const change = (end.value / f.last_close - 1) * 100;
      box.innerHTML = `
        <span class="label">Прогноз на ${s.horizon} торг. дн. · к ${dateRu(end.date)}</span>
        <div class="mp-big"><span class="num mp-price">${price(end.value)}</span><span class="num ${trend(change)}">${pct(change)}</span></div>
        <div class="mp-iv"><span class="label">80% интервал</span><span class="num">${price(end.lo)} — ${price(end.hi)}</span></div>`;
      box.querySelectorAll(".mp-big .num").forEach(flash);
    }, (e: ApiError) => {
      if (!isCurrent()) return;
      if (e.status === 404) renderEmpty(box, e.message);
      else renderError(box, e, renderResult);
    });
  }

  const nextMetrics = data.latest();
  function loadMetrics(): void {
    const isCurrent = nextMetrics();
    metrics = null;
    renderModels();
    data.metrics(store.get().ticker).then((m) => {
      if (!isCurrent()) return;
      metrics = m;
      renderModels();
      renderQuality();
    }, () => {
      if (!isCurrent()) return;
      renderModels();
      renderQuality();
    });
  }

  renderLoading($(".mp-result"));
  store.subscribe((s, changed) => {
    range.value = String(s.horizon);
    $(".mp-h").textContent = `${s.horizon} дн.`;
    setRangeFill();
    if (changed.has("ticker")) loadMetrics();
    else if (changed.has("model")) { renderModels(); renderQuality(); }
    renderResult();
  });
}

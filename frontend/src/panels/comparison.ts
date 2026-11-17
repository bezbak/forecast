import type { ApiError, MetricsResponse, ModelMetrics, ModelName } from "../api";
import * as data from "../data";
import { price } from "../format";
import * as store from "../store";
import { MODEL_LABELS } from "../store";
import { MODEL_NOTES } from "./modelPanel";
import { panelShell, renderEmpty, renderError, renderLoading } from "./status";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function mountComparison(el: HTMLElement, tabs?: HTMLElement): void {
  const { body, aux } = panelShell(el, "04", "Сравнение моделей");
  el.classList.add("cmp");
  aux.innerHTML = `<span class="cmp-legend"><i class="sw sw-best"></i>лучшая по MAE<i class="sw sw-bad"></i>хуже Naive</span>`;
  if (tabs) aux.append(tabs);
  let metrics: MetricsResponse | null = null;

  function row(m: ModelMetrics, best: ModelMetrics | null, maxMape: number, selected: ModelName): string {
    const cls = [m.model === selected ? "is-sel" : "", m === best ? "is-best" : "", m.beats_naive === false ? "is-bad" : ""].join(" ");
    const name = `<td><span class="cmp-name">${MODEL_LABELS[m.model]}</span><span class="cmp-note">${MODEL_NOTES[m.model]}</span></td>`;
    if (m.status !== "ok") {
      const text = m.status === "failed" ? "ошибка обучения" : "не рассчитана";
      return `<tr class="${cls}" data-model="${m.model}">${name}<td colspan="5" class="cmp-off" title="${esc(m.error ?? "")}">${text}</td></tr>`;
    }
    const verdict = m.beats_naive == null ? `<span class="cmp-base">база</span>`
      : m.beats_naive ? `<span class="up">лучше</span>` : `<span class="down">хуже</span>`;
    return `<tr class="${cls}" data-model="${m.model}">${name}
      <td class="num r">${price(m.mae!)}</td>
      <td class="num r">${price(m.rmse!)}</td>
      <td class="num r cmp-mape"><span class="bar" style="--w:${(m.mape! / maxMape) * 100}%"></span>${m.mape!.toFixed(2)}%</td>
      <td class="num r">${m.direction != null ? `${m.direction.toFixed(1)}%` : "—"}</td>
      <td class="r">${verdict}</td></tr>`;
  }

  function render(): void {
    if (!metrics) return;
    if (metrics.status === "insufficient_data") {
      renderEmpty(body, "Недостаточно истории для прогноза");
      return;
    }
    const ok = metrics.models.filter((m) => m.status === "ok");
    const best = ok.reduce<ModelMetrics | null>((a, m) => (!a || m.mae! < a.mae! ? m : a), null);
    const maxMape = Math.max(...ok.map((m) => m.mape!), 0.0001);
    const selected = store.get().model;
    body.innerHTML = `<table class="cmp-table">
      <thead><tr class="label"><th>Модель</th><th class="r">MAE, $</th><th class="r">RMSE, $</th><th class="r">MAPE</th><th class="r">Направление</th><th class="r">vs Naive</th></tr></thead>
      <tbody>${metrics.models.map((m) => row(m, best, maxMape, selected)).join("")}</tbody></table>`;
  }

  body.addEventListener("click", (e) => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>("tr[data-model]");
    if (tr) store.set({ model: tr.dataset.model as ModelName });
  });

  const next = data.latest();
  function load(): void {
    const isCurrent = next();
    metrics = null;
    renderLoading(body);
    data.metrics(store.get().ticker).then((m) => {
      if (!isCurrent()) return;
      metrics = m;
      render();
    }, (e: ApiError) => {
      if (!isCurrent()) return;
      if (e.status === 404) renderEmpty(body, e.message);
      else renderError(body, e, () => store.refresh());
    });
  }

  store.subscribe((_s, changed) => {
    if (changed.has("ticker")) load();
    else if (changed.has("model")) render();
  });
}

import type { ModelName, RangeName } from "./api";

export interface State { ticker: string; model: ModelName; horizon: number; range: RangeName }
type Listener = (s: State, changed: Set<keyof State>) => void;

export const MODELS: ModelName[] = ["naive", "arima", "boosting", "lstm"];
export const MODEL_LABELS: Record<ModelName, string> = { naive: "Naive", arima: "ARIMA", boosting: "Бустинг", lstm: "LSTM" };
const RANGES: RangeName[] = ["1M", "3M", "6M", "1Y", "5Y", "ALL"];
const DEFAULTS: State = { ticker: "NVDA", model: "lstm", horizon: 7, range: "1Y" };

function fromHash(): State {
  const [ticker, model, horizon, range] = location.hash.replace(/^#/, "").split("/");
  const h = Number(horizon);
  return {
    ticker: ticker ? decodeURIComponent(ticker).toUpperCase() : DEFAULTS.ticker,
    model: MODELS.includes(model as ModelName) ? (model as ModelName) : DEFAULTS.model,
    horizon: Number.isInteger(h) && h >= 1 && h <= 30 ? h : DEFAULTS.horizon,
    range: RANGES.includes(range as RangeName) ? (range as RangeName) : DEFAULTS.range,
  };
}

let state = fromHash();
const listeners = new Set<Listener>();

export function get(): State { return state; }

export function set(patch: Partial<State>): void {
  const changed = new Set<keyof State>();
  for (const k of Object.keys(patch) as (keyof State)[]) if (patch[k] !== undefined && patch[k] !== state[k]) changed.add(k);
  if (!changed.size) return;
  state = { ...state, ...patch };
  history.replaceState(null, "", `#${state.ticker}/${state.model}/${state.horizon}/${state.range}`);
  listeners.forEach((fn) => fn(state, changed));
}

/** Оповестить подписчиков, будто бумага выбрана заново (перезагрузка данных после переобучения). */
export function refresh(): void {
  listeners.forEach((fn) => fn(state, new Set<keyof State>(["ticker"])));
}

/** Подписка; слушатель сразу получает текущее состояние со всеми ключами как изменёнными. */
export function subscribe(fn: Listener): void {
  listeners.add(fn);
  fn(state, new Set(Object.keys(state) as (keyof State)[]));
}

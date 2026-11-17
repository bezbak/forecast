export type ModelName = "naive" | "arima" | "boosting" | "lstm";
export type RangeName = "1M" | "3M" | "6M" | "1Y" | "5Y" | "ALL";

export interface TickerRow {
  ticker: string; name: string; sector: string;
  last: number; change_pct: number; spark: number[];
}
export interface Candle { time: string; open: number; high: number; low: number; close: number; volume: number }
export interface ForecastPoint { date: string; value: number; lo: number; hi: number }
export interface ForecastResponse {
  ticker: string; model: ModelName; asof: string; last_close: number;
  status: "ok" | "failed" | "missing" | "insufficient_data"; points: ForecastPoint[];
}
export interface ModelMetrics {
  model: ModelName; status: "ok" | "failed" | "missing";
  mae: number | null; rmse: number | null; mape: number | null; direction: number | null;
  beats_naive: boolean | null; error?: string | null;
}
export interface MetricsResponse { ticker: string; status: "ok" | "insufficient_data"; models: ModelMetrics[] }
export interface OverviewRow { ticker: string; sector: string; change_pct: number; forecast_pct: number | null }
export interface Meta { universe_asof: string; data_asof: string | null }

export class ApiError extends Error {
  constructor(public status: number | null, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path);
  } catch {
    throw new ApiError(null, "Нет связи с сервером");
  }
  if (!res.ok) {
    let message = `Ошибка сервера (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") message = body.detail;
    } catch { /* тело не JSON — оставляем общее сообщение */ }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;
export const getTickers = () => request<TickerRow[]>("/api/tickers");
export const getCandles = (t: string, range: RangeName) => request<Candle[]>(`/api/candles/${enc(t)}?range=${range}`);
export const getForecast = (t: string, model: ModelName, horizon: number) =>
  request<ForecastResponse>(`/api/forecast/${enc(t)}?model=${model}&horizon=${horizon}`);
export const getMetrics = (t: string) => request<MetricsResponse>(`/api/metrics/${enc(t)}`);
export const getOverview = () => request<OverviewRow[]>("/api/overview");
export const getMeta = () => request<Meta>("/api/meta");

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
export interface OverviewRow {
  ticker: string; sector: string; change_pct: number;
  forecast_pct: number | null; forecast_model: ModelName | null;
}
export interface Meta { universe_asof: string; data_asof: string | null }
export interface Job {
  id: string; ticker: string; status: "running" | "done" | "failed";
  progress: number; model: ModelName | null; error: string | null;
}

export class ApiError extends Error {
  constructor(public status: number | null, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await send(path, init)).json() as Promise<T>;
}

/** Запрос с единой обработкой ошибок; возвращает успешный ответ. */
async function send(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await (init ? fetch(path, init) : fetch(path));
  } catch {
    throw new ApiError(null, "Нет связи с сервером");
  }
  if (res.status === 502 || res.status === 504) {
    // Прокси (dev-сервер) не достучался до бэкенда — для пользователя это то же «нет связи».
    throw new ApiError(null, "Нет связи с сервером");
  }
  if (!res.ok) {
    let message = `Ошибка сервера (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") message = body.detail;
      else if (Array.isArray(body?.detail) && body.detail[0]?.msg) message = String(body.detail[0].msg).replace(/^Value error, /, "");
    } catch { /* тело не JSON — оставляем общее сообщение */ }
    throw new ApiError(res.status, message);
  }
  return res;
}

const post = <T>(path: string, body?: unknown) => request<T>(path, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const enc = encodeURIComponent;
export const getTickers = () => request<TickerRow[]>("/api/tickers");
export const getCandles = (t: string, range: RangeName) => request<Candle[]>(`/api/candles/${enc(t)}?range=${range}`);
export const getForecast = (t: string, model: ModelName, horizon: number) =>
  request<ForecastResponse>(`/api/forecast/${enc(t)}?model=${model}&horizon=${horizon}`);
export const getMetrics = (t: string) => request<MetricsResponse>(`/api/metrics/${enc(t)}`);
export const getOverview = () => request<OverviewRow[]>("/api/overview");
export const getMeta = () => request<Meta>("/api/meta");
export const retrain = (t: string) => request<{ job_id: string }>(`/api/retrain/${enc(t)}`, { method: "POST" });
export const getJob = (id: string) => request<Job>(`/api/jobs/${enc(id)}`);

// ── Аккаунт и демо-оплата
export interface User { id: number; email: string; plan: "free" | "pro"; pro_until: string | null }
export interface Plan { id: string; name: string; amount: number; currency: string; days: number; features: string[] }
export interface Payment { id: string; plan: string; amount: number; currency: string; status: "pending" | "paid" | "cancelled" }

export const me = () => request<User | null>("/api/auth/me");
export const login = (email: string, password: string) => post<User>("/api/auth/login", { email, password });
export const register = (email: string, password: string) => post<User>("/api/auth/register", { email, password });
export const logout = () => post<{ ok: boolean }>("/api/auth/logout");
export const getPlans = () => request<Plan[]>("/api/billing/plans");
export const checkout = (plan: string) => post<Payment>("/api/billing/checkout", { plan });
export const payDemo = (id: string) => post<{ payment: Payment; user: User }>(`/api/billing/${enc(id)}/pay`);
export const cancelPayment = (id: string) => post<Payment>(`/api/billing/${enc(id)}/cancel`);

// ── ИИ-аналитик
export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface Summary { ticker: string; source: "ai" | "template"; text: string }

export const aiStatus = () => request<{ enabled: boolean; pro: boolean }>("/api/ai/status");
export const aiSummary = (t: string) => request<Summary>(`/api/ai/summary/${enc(t)}`);

/** Ответ ИИ потоком: onChunk получает текст по мере генерации; возвращается весь ответ. */
export async function chatStream(ticker: string, messages: ChatMessage[], onChunk: (text: string) => void): Promise<string> {
  const res = await send("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, messages }),
  });
  if (!res.body) {
    const text = await res.text();
    onChunk(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) { full += text; onChunk(text); }
  }
  return full;
}

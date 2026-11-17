import * as api from "./api";
import type { ModelName, RangeName } from "./api";

/** Кэш запросов: один и тот же запрос не уходит дважды; ошибка из кэша удаляется, чтобы «Повторить» сработал. */
const cache = new Map<string, Promise<unknown>>();

function memo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn().catch((e) => {
      cache.delete(key);
      throw e;
    });
    cache.set(key, p);
  }
  return p;
}

export const tickers = () => memo("tickers", api.getTickers);
export const candles = (t: string, r: RangeName) => memo(`candles/${t}/${r}`, () => api.getCandles(t, r));
export const forecast = (t: string, m: ModelName, h: number) => memo(`forecast/${t}/${m}/${h}`, () => api.getForecast(t, m, h));
export const metrics = (t: string) => memo(`metrics/${t}`, () => api.getMetrics(t));

/** Защита от гонок: учитывается только ответ на последний запрос панели. */
export function latest() {
  let n = 0;
  return () => {
    const my = ++n;
    return () => my === n;
  };
}

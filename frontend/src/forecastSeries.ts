import type { Time } from "lightweight-charts";
import type { ForecastResponse } from "./api";

export interface SeriesPoint { time: Time; value: number }

/**
 * Данные для линий прогноза. Линия начинается в дате, на которую построен прогноз (asof),
 * а не в последней свече: если котировки обновили, а модели ещё нет, порядок дат не ломается,
 * и старый прогноз честно виден поверх реальных свечей.
 */
export function forecastSeries(fc: ForecastResponse) {
  const start: SeriesPoint = { time: fc.asof as Time, value: fc.last_close };
  const line = (key: "value" | "lo" | "hi"): SeriesPoint[] =>
    [start, ...fc.points.map((p) => ({ time: p.date as Time, value: p[key] }))];
  return {
    start,
    value: line("value"),
    lo: line("lo"),
    hi: line("hi"),
    /** Прогноз построен раньше последней свечи. */
    stale: (lastCandle: string) => fc.asof < lastCandle,
  };
}

import { expect, test } from "vitest";
import { forecastSeries } from "../src/forecastSeries";
import type { ForecastResponse } from "../src/api";

const fc = (asof: string, dates: string[]): ForecastResponse => ({
  ticker: "AAA", model: "lstm", asof, last_close: 100, status: "ok",
  points: dates.map((d, i) => ({ date: d, value: 100 + i, lo: 95 + i, hi: 105 + i })),
});

const ascending = (xs: string[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]);

test("fresh forecast starts at the forecast date and stays ascending", () => {
  const s = forecastSeries(fc("2026-11-16", ["2026-11-17", "2026-11-18"]));
  expect(s.start).toEqual({ time: "2026-11-16", value: 100 });
  expect(s.value.map((p) => p.time)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  expect(s.stale("2026-11-16")).toBe(false);
});

test("forecast older than the candles still renders in ascending order", () => {
  const s = forecastSeries(fc("2026-11-10", ["2026-11-11", "2026-11-12"]));
  for (const key of ["value", "lo", "hi"] as const) expect(ascending(s[key].map((p) => p.time as string))).toBe(true);
  expect(s.value[0].time).toBe("2026-11-10");
  expect(s.stale("2026-11-16")).toBe(true);
});

test("band series carry lo and hi values", () => {
  const s = forecastSeries(fc("2026-11-16", ["2026-11-17"]));
  expect(s.lo.map((p) => p.value)).toEqual([100, 95]);
  expect(s.hi.map((p) => p.value)).toEqual([100, 105]);
});

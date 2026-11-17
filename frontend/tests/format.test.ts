import { describe, expect, test } from "vitest";
import { compact, dateRu, pct, price } from "../src/format";

describe("format", () => {
  test("pct keeps sign and uses a real minus", () => {
    expect(pct(1.2345)).toBe("+1.23%");
    expect(pct(-0.4)).toBe("−0.40%");
    expect(pct(0)).toBe("0.00%");
  });

  test("price groups thousands with a non-breaking space", () => {
    expect(price(1234.5)).toBe("1 234.50");
    expect(price(12.3456)).toBe("12.35");
  });

  test("compact uses Russian units", () => {
    expect(compact(12_345_678)).toBe("12.3 млн");
    expect(compact(2_500_000_000)).toBe("2.5 млрд");
    expect(compact(950_000)).toBe("950 тыс");
  });

  test("dateRu", () => {
    expect(dateRu("2026-11-17")).toBe("17 ноя 2026");
    expect(dateRu("2026-05-01")).toBe("1 мая 2026");
  });
});

import { expect, test } from "vitest";
import { sparkline } from "../src/spark";

const points = (svg: string) => svg.match(/points="([^"]+)"/)![1].split(" ").map((p) => p.split(",").map(Number));

test("rising series is green and spans the full box", () => {
  const svg = sparkline([10, 11, 12, 15]);
  expect(svg).toContain('class="spark up"');
  const pts = points(svg);
  expect(pts).toHaveLength(4);
  expect(pts[0][0]).toBe(0);
  expect(pts[3][0]).toBe(56);
  expect(pts[3][1]).toBeLessThan(pts[0][1]); // выше на экране = меньше y
});

test("falling series is red", () => {
  expect(sparkline([15, 12, 10])).toContain('class="spark down"');
});

test("flat series does not divide by zero", () => {
  const pts = points(sparkline([5, 5, 5]));
  expect(pts.every(([, y]) => Number.isFinite(y))).toBe(true);
});

test("fewer than two values renders nothing", () => {
  expect(sparkline([1])).toBe("");
});

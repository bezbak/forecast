import { trend } from "./format";

const SPARK_W = 56;
const SPARK_H = 18;

/** Мини-график цены (SVG-строка); пунктир — уровень первого дня, цвет — по итоговому изменению. */
export function sparkline(values: number[]): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * SPARK_W;
  const y = (v: number) => SPARK_H - 1 - ((v - min) / span) * (SPARK_H - 2);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const cls = trend(values[values.length - 1] - values[0]);
  const base = y(values[0]).toFixed(1);
  return `<svg class="spark ${cls}" viewBox="0 0 ${SPARK_W} ${SPARK_H}" width="${SPARK_W}" height="${SPARK_H}" aria-hidden="true">`
    + `<line x1="0" x2="${SPARK_W}" y1="${base}" y2="${base}" class="spark-base"/>`
    + `<polyline points="${pts}"/></svg>`;
}

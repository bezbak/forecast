const NBSP = " ";
const MINUS = "−";
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function group(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Цена: две цифры после точки, тысячи через неразрывный пробел. */
export function price(n: number, digits = 2): string {
  const [int, frac] = Math.abs(n).toFixed(digits).split(".");
  return (n < 0 ? MINUS : "") + group(int) + (frac ? "." + frac : "");
}

/** Изменение в процентах со знаком и настоящим минусом. */
export function pct(n: number, digits = 2): string {
  const s = Math.abs(n).toFixed(digits);
  if (Number(s) === 0) return `${(0).toFixed(digits)}%`;
  return `${n > 0 ? "+" : MINUS}${s}%`;
}

/** Компактная запись больших чисел: тыс, млн, млрд. */
export function compact(n: number): string {
  const units: [number, string][] = [[1e9, "млрд"], [1e6, "млн"], [1e3, "тыс"]];
  for (const [base, unit] of units) {
    if (Math.abs(n) >= base) {
      const v = n / base;
      return `${v >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, "")}${NBSP}${unit}`;
    }
  }
  return String(Math.round(n));
}

/** "2026-11-17" → "17 ноя 2026". */
export function dateRu(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Знак числа для раскраски: up / down / flat. */
export function trend(n: number | null | undefined): "up" | "down" | "flat" {
  if (n == null || Math.abs(n) < 1e-9) return "flat";
  return n > 0 ? "up" : "down";
}

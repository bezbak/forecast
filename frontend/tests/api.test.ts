import { afterEach, expect, test, vi } from "vitest";
import { ApiError, getMetrics } from "../src/api";

afterEach(() => vi.unstubAllGlobals());

test("server error detail becomes ApiError message", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Тикер не найден" }), { status: 404 })));
  const err = await getMetrics("ZZZ").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(404);
  expect(err.message).toBe("Тикер не найден");
});

test("network failure becomes 'no connection'", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  const err = await getMetrics("AAA").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBeNull();
  expect(err.message).toBe("Нет связи с сервером");
});

test("proxy gateway errors also mean 'no connection'", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 502 })));
  const err = await getMetrics("AAA").catch((e) => e);
  expect(err.status).toBeNull();
  expect(err.message).toBe("Нет связи с сервером");
});

test("success returns parsed json", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ticker: "AAA", status: "ok", models: [] }))));
  expect((await getMetrics("AAA")).ticker).toBe("AAA");
});

import { afterEach, expect, test, vi } from "vitest";
import { ApiError, chatStream, login, me } from "../src/api";

afterEach(() => vi.unstubAllGlobals());

test("login posts JSON credentials", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 1, email: "a@b.kg", plan: "free", pro_until: null })));
  vi.stubGlobal("fetch", fetchMock);
  const user = await login("a@b.kg", "password1");
  expect(user.email).toBe("a@b.kg");
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/auth/login");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body as string)).toEqual({ email: "a@b.kg", password: "password1" });
  expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
});

test("me returns null for anonymous", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("null")));
  expect(await me()).toBeNull();
});

test("chatStream delivers chunks in order and returns the full text", async () => {
  const body = new ReadableStream({
    start(c) {
      const enc = new TextEncoder();
      for (const s of ["Модель ", "ждёт ", "рост."]) c.enqueue(enc.encode(s));
      c.close();
    },
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  const seen: string[] = [];
  const full = await chatStream("AAA", [{ role: "user", content: "?" }], (t) => seen.push(t));
  expect(seen.join("")).toBe("Модель ждёт рост.");
  expect(full).toBe("Модель ждёт рост.");
});

test("chatStream surfaces server errors", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Доступно в тарифе Про" }), { status: 403 })));
  const err = await chatStream("AAA", [{ role: "user", content: "?" }], () => undefined).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(403);
  expect(err.message).toBe("Доступно в тарифе Про");
});

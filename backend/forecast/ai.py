"""ИИ-аналитик: сводка по бумаге и чат на основе данных терминала (Claude API).

Без ключа API работает только сводка по шаблону; чат честно отвечает, что ИИ не настроен.
"""
import json
import os
from typing import AsyncIterator

from forecast.results import load_result
from forecast.store import load_candles
from forecast.universe import load_universe

MODEL = "claude-opus-5-5"
MODEL_LABELS = {"naive": "Naive", "arima": "ARIMA", "boosting": "Бустинг", "lstm": "LSTM"}
DISCLAIMER = "Это учебный анализ и не является инвестиционной рекомендацией."

SYSTEM = """Ты — ИИ-аналитик учебного терминала прогнозирования акций Nasdaq-100.
Отвечай по-русски, коротко и по делу, обычным текстом без markdown-таблиц.
Опирайся только на данные терминала ниже: котировки, прогнозы четырёх моделей
(Naive — базовая «завтра = сегодня», ARIMA, градиентный бустинг, нейросеть LSTM) и их точность
на последних 252 торговых днях (MAE, MAPE, доля угаданных направлений).
Если модель не обгоняет Naive, прямо скажи об этом: на дневных данных это частый результат.
Не давай инвестиционных рекомендаций и не обещай доходность; если просят «купить или продать»,
объясни, что терминал учебный, и опиши, что показывают модели.
Если вопрос не о рынке или данных терминала, вежливо верни разговор к ним."""

_summary_cache: dict[tuple[str, str], str] = {}


def ai_enabled() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


def get_client():
    import anthropic

    return anthropic.AsyncAnthropic()


def build_context(ticker: str) -> dict:
    """Всё, что терминал знает о бумаге, в компактном виде для сводки и чата."""
    company = next((c for c in load_universe() if c.ticker == ticker), None)
    ctx: dict = {"ticker": ticker, "name": company.name if company else ticker,
                 "sector": company.sector if company else None, "models": [], "status": "missing"}
    try:
        close = load_candles(ticker)["close"]
        ctx["last_close"] = round(float(close.iloc[-1]), 2)
        ctx["data_asof"] = close.index[-1].strftime("%Y-%m-%d")
        if len(close) >= 2:
            ctx["change_1d_pct"] = round((close.iloc[-1] / close.iloc[-2] - 1) * 100, 2)
        if len(close) >= 22:
            ctx["change_1m_pct"] = round((close.iloc[-1] / close.iloc[-22] - 1) * 100, 2)
    except FileNotFoundError:
        pass
    try:
        res = load_result(ticker)
    except FileNotFoundError:
        return ctx
    ctx["status"] = res["status"]
    ctx["forecast_asof"] = res["asof"]
    for name, m in res.get("models", {}).items():
        if m["status"] != "ok":
            ctx["models"].append({"model": name, "status": m["status"]})
            continue
        path, last = m["path"], res["last_close"]
        ctx["models"].append({
            "model": name,
            "forecast_7d_pct": round((path[6]["value"] / last - 1) * 100, 2),
            "forecast_30d_pct": round((path[-1]["value"] / last - 1) * 100, 2),
            "interval_7d": [round(path[6]["lo"], 2), round(path[6]["hi"], 2)],
            "mae": round(m["metrics"]["mae"], 3),
            "mape": round(m["metrics"]["mape"], 3),
            "direction_pct": None if m["metrics"]["direction"] is None else round(m["metrics"]["direction"], 1),
            "beats_naive": m.get("beats_naive"),
        })
    return ctx


def template_summary(ctx: dict) -> str:
    """Сводка без языковой модели — собирается из тех же чисел."""
    t = ctx["ticker"]
    head = f"{t} ({ctx['name']})"
    if "last_close" in ctx:
        head += f": последняя цена {ctx['last_close']}"
        if "change_1d_pct" in ctx:
            head += f", за день {ctx['change_1d_pct']:+.2f}%"
    head += "."
    if ctx["status"] == "missing":
        return f"{head} Прогноз для этой бумаги ещё не рассчитан. {DISCLAIMER}"
    if ctx["status"] == "insufficient_data":
        return f"{head} Истории котировок недостаточно для прогноза. {DISCLAIMER}"
    ok = [m for m in ctx["models"] if "mape" in m]
    if not ok:
        return f"{head} Модели не обучились на этой бумаге. {DISCLAIMER}"
    best = min(ok, key=lambda m: m["mae"])
    parts = [head]
    smart = [m for m in ok if m["model"] != "naive"]
    if smart:
        views = ", ".join(f"{MODEL_LABELS[m['model']]} {m['forecast_7d_pct']:+.2f}%" for m in smart)
        parts.append(f"Прогноз на 7 торговых дней: {views}.")
    parts.append(f"Точнее всех на истории — {MODEL_LABELS[best['model']]} (MAPE {best['mape']:.2f}%).")
    losers = [MODEL_LABELS[m["model"]] for m in smart if m.get("beats_naive") is False]
    if losers:
        parts.append(f"Не лучше базовой модели «завтра = сегодня»: {', '.join(losers)}.")
    parts.append(DISCLAIMER)
    return " ".join(parts)


def _system(ctx: dict) -> str:
    return f"{SYSTEM}\n\nДанные терминала по выбранной бумаге (JSON):\n{json.dumps(ctx, ensure_ascii=False)}"


def _stream(client, ctx: dict, messages: list[dict], effort: str):
    # Сервер сам перезапустит запрос на запасной модели, если основная откажет (fallbacks).
    return client.beta.messages.stream(
        model=MODEL,
        max_tokens=4000,
        system=_system(ctx),
        messages=messages,
        output_config={"effort": effort},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )


async def summarize(ctx: dict) -> str:
    key = (ctx["ticker"], ctx.get("forecast_asof", ""))
    if key in _summary_cache:
        return _summary_cache[key]
    prompt = ("Сделай сводку по бумаге для трейдера в 3–4 предложениях: что ждут модели на неделю, "
              "какой модели стоит доверять больше по точности и в чём главная оговорка.")
    async with _stream(get_client(), ctx, [{"role": "user", "content": prompt}], "low") as stream:
        msg = await stream.get_final_message()
    if getattr(msg, "stop_reason", None) == "refusal":
        raise RuntimeError("ИИ отказался отвечать")
    text = "".join(b.text for b in msg.content if b.type == "text").strip()
    _summary_cache[key] = text
    return text


async def chat(ctx: dict, messages: list[dict]) -> AsyncIterator[str]:
    async with _stream(get_client(), ctx, messages, "low") as stream:
        async for text in stream.text_stream:
            yield text


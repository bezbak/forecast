"""HTTP API терминала и раздача собранного фронтенда."""
from typing import Literal

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles

from forecast import config
from forecast.config import MAX_HORIZON, MODEL_NAMES
from forecast.jobs import JobManager
from forecast.results import load_result
from forecast.store import has_candles, load_candles
from forecast.universe import Company, load_universe, universe_asof

ModelName = Literal["naive", "arima", "boosting", "lstm"]
RangeName = Literal["1M", "3M", "6M", "1Y", "5Y", "ALL"]
RANGE_MONTHS = {"1M": 1, "3M": 3, "6M": 6, "1Y": 12, "5Y": 60}
OVERVIEW_DAY = 7

app = FastAPI(title="AI Forecast Terminal")


def _company(ticker: str) -> Company:
    for c in load_universe():
        if c.ticker == ticker:
            return c
    raise HTTPException(404, "Тикер не найден")


def _candles(ticker: str) -> pd.DataFrame:
    _company(ticker)
    try:
        return load_candles(ticker)
    except FileNotFoundError:
        raise HTTPException(404, "Нет котировок для этого тикера") from None


def _result(ticker: str) -> dict:
    _company(ticker)
    try:
        return load_result(ticker)
    except FileNotFoundError:
        raise HTTPException(404, "Прогноз для этого тикера ещё не рассчитан") from None


def _try_result(ticker: str) -> dict | None:
    try:
        return load_result(ticker)
    except FileNotFoundError:
        return None


def _best_model(result: dict) -> dict | None:
    ok = [m for m in result.get("models", {}).values() if m["status"] == "ok"]
    return min(ok, key=lambda m: m["metrics"]["mae"]) if ok else None


@app.get("/api/tickers")
def tickers():
    rows = []
    for c in load_universe():
        if not has_candles(c.ticker):
            continue
        close = load_candles(c.ticker)["close"]
        if len(close) < 2:  # бумага не торгуется (например, снята с биржи)
            continue
        last, prev = float(close.iloc[-1]), float(close.iloc[-2])
        rows.append({
            "ticker": c.ticker, "name": c.name, "sector": c.sector,
            "last": last, "change_pct": (last / prev - 1) * 100,
            "spark": [float(x) for x in close.iloc[-30:]],
        })
    return rows


@app.get("/api/candles/{ticker}")
def candles(ticker: str, range: RangeName = "1Y"):  # noqa: A002 — имя параметра из API
    df = _candles(ticker)
    if range != "ALL":
        df = df[df.index > df.index[-1] - pd.DateOffset(months=RANGE_MONTHS[range])]
    return [
        {"time": d.strftime("%Y-%m-%d"), "open": r.open, "high": r.high, "low": r.low,
         "close": r.close, "volume": r.volume}
        for d, r in zip(df.index, df.itertuples(index=False))
    ]


@app.get("/api/forecast/{ticker}")
def forecast(ticker: str, model: ModelName = "lstm", horizon: int = Query(7, ge=1, le=MAX_HORIZON)):
    res = _result(ticker)
    m = res["models"].get(model)
    if res["status"] != "ok":
        status, points = res["status"], []
    elif m is None:
        status, points = "missing", []
    else:
        status, points = m["status"], (m.get("path") or [])[:horizon]
    return {"ticker": ticker, "model": model, "asof": res["asof"], "last_close": res["last_close"],
            "status": status, "points": points}


@app.get("/api/metrics/{ticker}")
def metrics(ticker: str):
    res = _result(ticker)
    rows = []
    for name in MODEL_NAMES:
        m = res["models"].get(name)
        if m is None:
            rows.append({"model": name, "status": "missing", "mae": None, "rmse": None, "mape": None,
                         "direction": None, "beats_naive": None})
            continue
        met = m.get("metrics", {})
        rows.append({"model": name, "status": m["status"], "mae": met.get("mae"), "rmse": met.get("rmse"),
                     "mape": met.get("mape"), "direction": met.get("direction"),
                     "beats_naive": m.get("beats_naive"), "error": m.get("error")})
    return {"ticker": ticker, "status": res["status"], "models": rows}


@app.get("/api/overview")
def overview():
    rows = []
    for row in tickers():
        res = _try_result(row["ticker"])
        best = _best_model(res) if res else None
        forecast_pct = None
        if best:
            forecast_pct = (best["path"][OVERVIEW_DAY - 1]["value"] / res["last_close"] - 1) * 100
        rows.append({"ticker": row["ticker"], "sector": row["sector"], "change_pct": row["change_pct"],
                     "forecast_pct": forecast_pct})
    return rows


@app.get("/api/meta")
def meta():
    dates = [load_candles(c.ticker).index[-1] for c in load_universe() if has_candles(c.ticker)]
    return {"universe_asof": universe_asof(),
            "data_asof": max(dates).strftime("%Y-%m-%d") if dates else None}


jobs = JobManager()


@app.post("/api/retrain/{ticker}")
def retrain(ticker: str):
    _candles(ticker)  # 404 для неизвестной бумаги или бумаги без котировок
    return {"job_id": jobs.start(ticker)}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "Задача не найдена")
    return job


if config.FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=config.FRONTEND_DIST, html=True), name="frontend")

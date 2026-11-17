"""Обучение и оценка всех моделей для одного тикера."""
import math
from dataclasses import asdict
from typing import Callable

import pandas as pd

from forecast.backtest import evaluate, forecast_path
from forecast.config import MAX_HORIZON, MIN_ROWS
from forecast.models.base import Forecaster

ModelFactories = dict[str, Callable[[], Forecaster]]


def default_models(lstm_epochs: int = 30) -> ModelFactories:
    from forecast.models.arima import ArimaForecaster
    from forecast.models.boosting import BoostingForecaster
    from forecast.models.lstm import LstmForecaster
    from forecast.models.naive import NaiveForecaster

    return {
        "naive": NaiveForecaster,
        "arima": ArimaForecaster,
        "boosting": BoostingForecaster,
        "lstm": lambda: LstmForecaster(epochs=lstm_epochs),
    }


def _train_one(factory: Callable[[], Forecaster], close: pd.Series) -> dict:
    bt = evaluate(factory(), close)
    path = forecast_path(factory(), close, MAX_HORIZON, bt.sigma)
    metrics = {"mae": bt.mae, "rmse": bt.rmse, "mape": bt.mape, "direction": bt.direction}
    numbers = [v for v in metrics.values() if v is not None]
    numbers += [x for p in path for x in (p.value, p.lo, p.hi)]
    if not all(math.isfinite(x) for x in numbers):
        raise ValueError("модель выдала нечисловой результат")
    return {"status": "ok", "metrics": metrics, "path": [asdict(p) for p in path]}


def train_ticker(ticker: str, close: pd.Series, models: ModelFactories | None = None,
                 on_progress: Callable[[str], None] | None = None) -> dict:
    models = models or default_models()
    result = {
        "ticker": ticker,
        "asof": close.index[-1].strftime("%Y-%m-%d"),
        "last_close": float(close.iloc[-1]),
        "status": "ok",
        "models": {},
    }
    if len(close) < MIN_ROWS:
        result["status"] = "insufficient_data"
        return result

    for name, factory in models.items():
        if on_progress:
            on_progress(name)
        try:
            result["models"][name] = _train_one(factory, close)
        except Exception as e:  # noqa: BLE001 — сбой одной модели не роняет остальные
            result["models"][name] = {"status": "failed", "error": str(e)}

    naive = result["models"].get("naive", {})
    naive_mae = naive["metrics"]["mae"] if naive.get("status") == "ok" else None
    for name, m in result["models"].items():
        if m["status"] != "ok":
            continue
        m["beats_naive"] = None if name == "naive" or naive_mae is None else m["metrics"]["mae"] < naive_mae
    return result

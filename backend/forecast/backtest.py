"""Проверка модели на отложенной выборке и построение пути прогноза."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

from forecast.config import HOLDOUT_DAYS, INTERVAL_Z
from forecast.metrics import direction_accuracy, mae, mape, rmse
from forecast.models.base import Forecaster, ForecastPoint


@dataclass
class BacktestResult:
    mae: float
    rmse: float
    mape: float
    direction: float | None
    sigma: float


def evaluate(model: Forecaster, close: pd.Series, holdout: int = HOLDOUT_DAYS) -> BacktestResult:
    """Обучение на close[:-holdout], затем прогноз на день вперёд для каждого дня выборки."""
    n = len(close)
    model.fit(close.iloc[: n - holdout])
    values = close.to_numpy(dtype=float)
    r_hat = np.array([model.predict_next(close.iloc[:t]) for t in range(n - holdout, n)])
    prev = values[n - holdout - 1 : n - 1]
    actual = values[n - holdout :]
    r_true = np.log(actual / prev)
    p_hat = prev * np.exp(r_hat)
    return BacktestResult(
        mae=mae(actual, p_hat),
        rmse=rmse(actual, p_hat),
        mape=mape(actual, p_hat),
        direction=direction_accuracy(r_true, r_hat),
        sigma=float(np.std(r_true - r_hat)),
    )


def forecast_path(model: Forecaster, close: pd.Series, horizon: int, sigma: float) -> list[ForecastPoint]:
    """Обучение на всей истории и путь цен на horizon рабочих дней вперёд с интервалом."""
    model.fit(close)
    r = np.asarray(model.forecast(close, horizon), dtype=float)
    last = float(close.iloc[-1])
    values = last * np.exp(np.cumsum(r))
    iv = model.interval(close, horizon, sigma)
    if iv is None:
        k = np.arange(1, horizon + 1)
        spread = np.exp(INTERVAL_Z * sigma * np.sqrt(k))
        lo, hi = values / spread, values * spread
    else:
        lo, hi = iv
    dates = pd.bdate_range(close.index[-1] + pd.offsets.BDay(1), periods=horizon)
    return [
        ForecastPoint(date=d.strftime("%Y-%m-%d"), value=float(v), lo=float(a), hi=float(b))
        for d, v, a, b in zip(dates, values, lo, hi)
    ]

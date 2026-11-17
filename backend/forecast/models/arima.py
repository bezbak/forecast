"""ARIMA(1,1,1) с дрейфом по логарифму цены."""
import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA

# Для фильтрации нового дня хватает недавней истории: старые значения
# не влияют на состояние ARMA(1,1), а пересчёт всего ряда медленный.
APPLY_TAIL = 300


class ArimaForecaster:
    name = "arima"

    def __init__(self, order: tuple[int, int, int] = (1, 1, 1)):
        self.order = order
        self.res = None

    @staticmethod
    def _logs(close: pd.Series) -> np.ndarray:
        return np.log(close.to_numpy(dtype=float))

    def fit(self, close: pd.Series) -> None:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            self.res = ARIMA(self._logs(close), order=self.order, trend="t").fit()

    def _applied(self, close: pd.Series):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            return self.res.apply(self._logs(close.iloc[-APPLY_TAIL:]))

    def predict_next(self, close: pd.Series) -> float:
        logs = self._logs(close)
        return float(self._applied(close).forecast(1)[0] - logs[-1])

    def forecast(self, close: pd.Series, horizon: int) -> np.ndarray:
        path = self._applied(close).forecast(horizon)
        return np.diff(np.concatenate([[self._logs(close)[-1]], path]))

    def interval(self, close: pd.Series, horizon: int, sigma: float):
        ci = self._applied(close).get_forecast(horizon).conf_int(alpha=0.2)
        return np.exp(ci[:, 0]), np.exp(ci[:, 1])

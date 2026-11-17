"""Общий интерфейс моделей прогноза."""
from dataclasses import dataclass
from typing import Protocol

import numpy as np
import pandas as pd


@dataclass
class ForecastPoint:
    date: str
    value: float
    lo: float
    hi: float


class Forecaster(Protocol):
    name: str

    def fit(self, close: pd.Series) -> None:
        """Обучение на истории цен закрытия."""

    def predict_next(self, close: pd.Series) -> float:
        """Лог-доходность на следующий день по истории close (без переобучения)."""

    def forecast(self, close: pd.Series, horizon: int) -> np.ndarray:
        """horizon лог-доходностей вперёд."""

    def interval(self, close: pd.Series, horizon: int, sigma: float) -> tuple[np.ndarray, np.ndarray] | None:
        """Собственный интервал цен (lo, hi) или None — тогда остаточный."""

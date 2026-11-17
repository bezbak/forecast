"""Базовая модель: завтра цена такая же, как сегодня."""
import numpy as np
import pandas as pd


class NaiveForecaster:
    name = "naive"

    def fit(self, close: pd.Series) -> None:
        pass

    def predict_next(self, close: pd.Series) -> float:
        return 0.0

    def forecast(self, close: pd.Series, horizon: int) -> np.ndarray:
        return np.zeros(horizon)

    def interval(self, close: pd.Series, horizon: int, sigma: float):
        return None

"""Градиентный бустинг по техническим признакам."""
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from forecast.features import build_features

# Самый длинный признак смотрит на 20 дней назад; берём с запасом.
FEATURE_TAIL = 40


class BoostingForecaster:
    name = "boosting"

    def __init__(self):
        self.model = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, random_state=0)

    def fit(self, close: pd.Series) -> None:
        feats = build_features(close)
        target = np.log(close).diff().shift(-1).reindex(feats.index)
        mask = target.notna()
        self.model.fit(feats[mask].to_numpy(), target[mask].to_numpy())

    def predict_next(self, close: pd.Series) -> float:
        feats = build_features(close.iloc[-FEATURE_TAIL:])
        return float(self.model.predict(feats.iloc[[-1]].to_numpy())[0])

    def forecast(self, close: pd.Series, horizon: int) -> np.ndarray:
        hist = close.iloc[-FEATURE_TAIL:].copy()
        out = np.empty(horizon)
        for i in range(horizon):
            r = self.predict_next(hist)
            out[i] = r
            nxt = hist.index[-1] + pd.offsets.BDay(1)
            hist = pd.concat([hist.iloc[1:], pd.Series([hist.iloc[-1] * np.exp(r)], index=[nxt])])
        return out

    def interval(self, close: pd.Series, horizon: int, sigma: float):
        return None

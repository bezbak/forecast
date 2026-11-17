"""Преобразования ряда цен в признаки для моделей."""
import numpy as np
import pandas as pd


def log_returns(close: pd.Series) -> pd.Series:
    """Дневные лог-доходности; первое значение (NaN) отброшено."""
    return np.log(close).diff().iloc[1:]


def _rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100.0).where(gain.notna())


def build_features(close: pd.Series) -> pd.DataFrame:
    """Признаки на день t только по данным до t включительно.

    Лаги доходности 1..10, средние доходности 5/20, волатильность 5/20,
    RSI(14), отклонение цены от SMA20. Строки с пропусками отброшены.
    """
    r = np.log(close).diff()
    f = pd.DataFrame(index=close.index)
    for lag in range(1, 11):
        f[f"ret_{lag}"] = r.shift(lag - 1)
    f["mean_5"] = r.rolling(5).mean()
    f["mean_20"] = r.rolling(20).mean()
    f["vol_5"] = r.rolling(5).std()
    f["vol_20"] = r.rolling(20).std()
    f["rsi_14"] = _rsi(close) / 100
    f["sma_gap_20"] = close / close.rolling(20).mean() - 1
    return f.dropna()

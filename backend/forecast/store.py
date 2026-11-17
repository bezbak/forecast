"""Хранилище дневных свечей: data/candles/<TICKER>.parquet."""
import pandas as pd

from forecast import config

COLUMNS = ["open", "high", "low", "close", "volume"]


def _path(ticker: str):
    return config.CANDLES_DIR / f"{ticker}.parquet"


def save_candles(ticker: str, df: pd.DataFrame) -> None:
    out = df[COLUMNS].astype(float).dropna(subset=["close"]).sort_index()
    out.index = pd.DatetimeIndex(out.index).normalize()
    out.index.name = "date"
    config.CANDLES_DIR.mkdir(parents=True, exist_ok=True)
    out.to_parquet(_path(ticker))


def load_candles(ticker: str) -> pd.DataFrame:
    path = _path(ticker)
    if not path.exists():
        raise FileNotFoundError(f"Нет свечей для {ticker}")
    return pd.read_parquet(path)


def has_candles(ticker: str) -> bool:
    return _path(ticker).exists()

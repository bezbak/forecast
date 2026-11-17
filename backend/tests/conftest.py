import numpy as np
import pandas as pd
import pytest

from forecast import config


@pytest.fixture
def tmp_data(tmp_path, monkeypatch):
    """Перенаправляет каталоги данных во временную папку."""
    candles, results = tmp_path / "candles", tmp_path / "results"
    candles.mkdir()
    results.mkdir()
    monkeypatch.setattr(config, "CANDLES_DIR", candles)
    monkeypatch.setattr(config, "RESULTS_DIR", results)
    return tmp_path


def make_close(n: int = 1200, seed: int = 0, drift: float = 0.0003, vol: float = 0.015) -> pd.Series:
    rng = np.random.default_rng(seed)
    r = rng.normal(drift, vol, n)
    idx = pd.bdate_range("2015-01-01", periods=n)
    return pd.Series(100 * np.exp(np.cumsum(r)), index=idx, name="close")


def make_candles(n: int = 1200, seed: int = 0) -> pd.DataFrame:
    close = make_close(n, seed)
    return pd.DataFrame({
        "open": close.shift(1).fillna(close.iloc[0]),
        "high": close * 1.01,
        "low": close * 0.99,
        "close": close,
        "volume": 1e6,
    })


@pytest.fixture
def synthetic_close():
    return make_close()

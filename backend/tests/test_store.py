import numpy as np
import pandas as pd

from forecast.store import load_candles, save_candles
from forecast.universe import load_universe
from tests.conftest import make_candles


def test_roundtrip(tmp_data):
    df = make_candles(50)
    save_candles("AAA", df.iloc[::-1])
    out = load_candles("AAA")
    assert list(out.columns) == ["open", "high", "low", "close", "volume"]
    assert out.index.is_monotonic_increasing
    pd.testing.assert_frame_equal(out, df, check_freq=False, check_names=False)


def test_drops_nan_rows(tmp_data):
    df = make_candles(10)
    df.iloc[3, df.columns.get_loc("close")] = np.nan
    save_candles("AAA", df)
    assert len(load_candles("AAA")) == 9


def test_missing_ticker_raises(tmp_data):
    import pytest
    with pytest.raises(FileNotFoundError):
        load_candles("NOPE")


def test_universe_loads():
    companies = load_universe()
    tickers = [c.ticker for c in companies]
    assert len(tickers) >= 95
    assert len(set(tickers)) == len(tickers)

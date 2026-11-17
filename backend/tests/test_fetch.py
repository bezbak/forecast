import pandas as pd

from forecast import config
from scripts.fetch_data import fetch_all
from tests.conftest import make_candles


def test_fetch_continues_on_failure(tmp_data):
    def download(t):
        if t == "BAD":
            raise RuntimeError("network")
        if t == "EMPTY":
            return pd.DataFrame()
        df = make_candles(30)
        df.columns = [c.capitalize() for c in df.columns]
        return df

    failed = fetch_all(["AAA", "BAD", "EMPTY"], download)
    assert failed == ["BAD", "EMPTY"]
    assert (config.CANDLES_DIR / "AAA.parquet").exists()

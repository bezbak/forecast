import numpy as np
import pandas as pd

from forecast.backtest import evaluate, forecast_path
from forecast.features import log_returns
from forecast.models.naive import NaiveForecaster


def test_log_returns(synthetic_close):
    r = log_returns(synthetic_close)
    assert len(r) == len(synthetic_close) - 1
    assert np.isclose(r.iloc[0], np.log(synthetic_close.iloc[1] / synthetic_close.iloc[0]))


def test_naive_backtest(synthetic_close):
    res = evaluate(NaiveForecaster(), synthetic_close)
    assert res.direction is None
    assert res.mae > 0
    assert res.sigma > 0


def test_naive_path_is_flat(synthetic_close):
    path = forecast_path(NaiveForecaster(), synthetic_close, horizon=5, sigma=0.01)
    assert len(path) == 5
    last = synthetic_close.iloc[-1]
    widths = []
    for p in path:
        assert p.value == last
        assert p.lo < p.value < p.hi
        widths.append(p.hi - p.lo)
    assert all(b > a for a, b in zip(widths, widths[1:]))
    first = pd.Timestamp(path[0].date)
    assert first > synthetic_close.index[-1]
    assert first.weekday() < 5


class SpyForecaster(NaiveForecaster):
    def __init__(self):
        self.seen: list[int] = []

    def predict_next(self, close):
        self.seen.append(len(close))
        return 0.0


def test_evaluate_no_lookahead(synthetic_close):
    spy = SpyForecaster()
    evaluate(spy, synthetic_close, holdout=50)
    assert len(spy.seen) == 50
    assert max(spy.seen) == len(synthetic_close) - 1

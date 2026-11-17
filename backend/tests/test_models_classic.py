import numpy as np
import pytest

from forecast.backtest import evaluate
from forecast.features import build_features
from forecast.models.arima import ArimaForecaster
from forecast.models.boosting import BoostingForecaster

MODELS = [ArimaForecaster, BoostingForecaster]


@pytest.mark.parametrize("cls", MODELS)
def test_runs_and_shapes(cls, synthetic_close):
    res = evaluate(cls(), synthetic_close)
    assert np.isfinite([res.mae, res.rmse, res.mape, res.sigma]).all()
    assert res.direction is None or 0 <= res.direction <= 100
    m = cls()
    m.fit(synthetic_close)
    r = m.forecast(synthetic_close, 30)
    assert r.shape == (30,)
    assert np.isfinite(r).all()


@pytest.mark.parametrize("cls", MODELS)
def test_deterministic(cls, synthetic_close):
    a, b = cls(), cls()
    a.fit(synthetic_close)
    b.fit(synthetic_close)
    assert np.allclose(a.forecast(synthetic_close, 10), b.forecast(synthetic_close, 10))


def test_features_no_nan(synthetic_close):
    f = build_features(synthetic_close)
    assert not f.isna().any().any()
    assert len(f) > len(synthetic_close) - 30


def test_features_no_future(synthetic_close):
    t = 500
    base = build_features(synthetic_close)
    changed = synthetic_close.copy()
    changed.iloc[t + 1 :] *= 1.5
    after = build_features(changed)
    day = synthetic_close.index[t]
    assert np.allclose(base.loc[day].to_numpy(), after.loc[day].to_numpy())


def test_arima_interval(synthetic_close):
    m = ArimaForecaster()
    m.fit(synthetic_close)
    lo, hi = m.interval(synthetic_close, 5, 0.01)
    assert lo.shape == hi.shape == (5,)
    assert (lo < hi).all()
    widths = hi - lo
    assert (np.diff(widths) > 0).all()

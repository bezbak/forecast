import numpy as np
import pandas as pd

from forecast.backtest import evaluate
from forecast.models.lstm import LstmForecaster
from tests.conftest import make_close


def test_lstm_runs():
    close = make_close(600)
    res = evaluate(LstmForecaster(epochs=2), close)
    assert np.isfinite([res.mae, res.rmse, res.mape, res.sigma]).all()
    m = LstmForecaster(epochs=2)
    m.fit(close)
    r = m.forecast(close, 30)
    assert r.shape == (30,)
    assert np.isfinite(r).all()


def test_lstm_deterministic():
    close = make_close(600)
    a, b = LstmForecaster(epochs=3, seed=0), LstmForecaster(epochs=3, seed=0)
    a.fit(close)
    b.fit(close)
    assert np.allclose(a.forecast(close, 10), b.forecast(close, 10))


def test_lstm_learns_sine():
    n = 800
    t = np.arange(n)
    r = 0.01 * np.sin(2 * np.pi * t / 20)
    close = pd.Series(100 * np.exp(np.cumsum(r)), index=pd.bdate_range("2015-01-01", periods=n))
    m = LstmForecaster(epochs=30)
    m.fit(close.iloc[:-100])
    true_r = np.log(close).diff().to_numpy()
    preds = np.array([m.predict_next(close.iloc[:k]) for k in range(n - 100, n)])
    lstm_mae = np.mean(np.abs(true_r[n - 100 :] - preds))
    naive_mae = np.mean(np.abs(true_r[n - 100 :]))
    assert lstm_mae < naive_mae / 2

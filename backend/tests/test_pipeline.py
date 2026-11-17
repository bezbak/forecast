import json

from forecast import config
from forecast.models.naive import NaiveForecaster
from forecast.pipeline import train_ticker
from forecast.results import load_result, save_result
from tests.conftest import make_close


class Broken(NaiveForecaster):
    name = "arima"

    def fit(self, close):
        raise RuntimeError("не сошлось")


class Drifting(NaiveForecaster):
    name = "boosting"

    def predict_next(self, close):
        return 0.001

    def forecast(self, close, horizon):
        import numpy as np
        return np.full(horizon, 0.001)


FAST = {"naive": NaiveForecaster, "arima": Broken, "boosting": Drifting}


def test_short_history():
    res = train_ticker("NEW", make_close(200), models=FAST)
    assert res["status"] == "insufficient_data"
    assert res["models"] == {}


def test_failed_model_isolated():
    res = train_ticker("AAA", make_close(), models=FAST)
    assert res["status"] == "ok"
    assert res["models"]["arima"]["status"] == "failed"
    assert "не сошлось" in res["models"]["arima"]["error"]
    assert res["models"]["naive"]["status"] == "ok"
    assert len(res["models"]["naive"]["path"]) == config.MAX_HORIZON


def test_beats_naive_flag():
    res = train_ticker("AAA", make_close(), models=FAST)
    assert res["models"]["naive"]["beats_naive"] is None
    assert isinstance(res["models"]["boosting"]["beats_naive"], bool)


def test_result_header():
    close = make_close()
    res = train_ticker("AAA", close, models=FAST)
    assert res["ticker"] == "AAA"
    assert res["asof"] == close.index[-1].strftime("%Y-%m-%d")
    assert res["last_close"] == float(close.iloc[-1])


def test_progress_callback():
    seen = []
    train_ticker("AAA", make_close(), models=FAST, on_progress=seen.append)
    assert seen == ["naive", "arima", "boosting"]


def test_result_roundtrip(tmp_data):
    res = train_ticker("AAA", make_close(), models=FAST)
    save_result(res)
    assert load_result("AAA") == res
    json.loads((config.RESULTS_DIR / "AAA.json").read_text(encoding="utf-8"))

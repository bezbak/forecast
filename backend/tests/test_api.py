import json

import pytest
from fastapi.testclient import TestClient

from forecast import config, universe
from forecast.models.naive import NaiveForecaster
from forecast.pipeline import train_ticker
from forecast.results import save_result
from forecast.store import save_candles
from tests.conftest import make_candles
from tests.test_pipeline import Drifting


@pytest.fixture
def client(tmp_data, monkeypatch):
    uni = tmp_data / "universe.json"
    uni.write_text(json.dumps({"asof": "2025-12-22", "companies": [
        {"ticker": "AAA", "name": "Aaa Inc.", "sector": "Tech"},
        {"ticker": "BBB", "name": "Bbb Corp.", "sector": "Energy"},
        {"ticker": "CCC", "name": "Ccc Ltd.", "sector": "Tech"},
    ]}), encoding="utf-8")
    monkeypatch.setattr(config, "UNIVERSE_FILE", uni)
    universe._read.cache_clear()
    for i, t in enumerate(["AAA", "BBB"]):
        save_candles(t, make_candles(1200, seed=i))
    candles = make_candles(1200, seed=0)
    save_result(train_ticker("AAA", candles["close"], models={"naive": NaiveForecaster, "boosting": Drifting}))
    from forecast.api.app import app
    yield TestClient(app)
    universe._read.cache_clear()


def test_tickers_shape(client):
    rows = client.get("/api/tickers").json()
    assert [r["ticker"] for r in rows] == ["AAA", "BBB"]
    row = rows[0]
    assert set(row) == {"ticker", "name", "sector", "last", "change_pct", "spark"}
    assert len(row["spark"]) == 30
    assert row["spark"][-1] == row["last"]


def test_tickers_skip_single_candle(client):
    save_candles("CCC", make_candles(1))
    rows = client.get("/api/tickers")
    assert rows.status_code == 200
    assert "CCC" not in [r["ticker"] for r in rows.json()]
    assert client.get("/api/overview").status_code == 200


def test_candles_range(client):
    rows = client.get("/api/candles/AAA?range=1M").json()
    assert 15 <= len(rows) <= 23
    dates = [r["time"] for r in rows]
    assert dates == sorted(dates)
    assert set(rows[0]) == {"time", "open", "high", "low", "close", "volume"}
    assert len(client.get("/api/candles/AAA?range=ALL").json()) == 1200


def test_forecast_horizon(client):
    body = client.get("/api/forecast/AAA?model=boosting&horizon=7").json()
    assert body["model"] == "boosting"
    assert body["status"] == "ok"
    assert len(body["points"]) == 7
    assert set(body["points"][0]) == {"date", "value", "lo", "hi"}


def test_forecast_missing_model_in_result(client):
    body = client.get("/api/forecast/AAA?model=lstm&horizon=7").json()
    assert body["status"] == "missing"
    assert body["points"] == []


def test_metrics_order(client):
    body = client.get("/api/metrics/AAA").json()
    assert [m["model"] for m in body["models"]] == ["naive", "arima", "boosting", "lstm"]
    naive = body["models"][0]
    assert naive["status"] == "ok" and naive["beats_naive"] is None
    assert body["models"][1]["status"] == "missing"


def test_overview(client):
    rows = {r["ticker"]: r for r in client.get("/api/overview").json()}
    assert rows["AAA"]["forecast_pct"] is not None
    assert rows["BBB"]["forecast_pct"] is None
    assert rows["AAA"]["sector"] == "Tech"


def test_meta(client):
    body = client.get("/api/meta").json()
    assert body["universe_asof"] == "2025-12-22"
    assert len(body["data_asof"]) == 10


def test_unknown_ticker_404(client):
    r = client.get("/api/candles/ZZZ")
    assert r.status_code == 404
    assert r.json()["detail"] == "Тикер не найден"


def test_no_results_404(client):
    r = client.get("/api/forecast/BBB?model=naive&horizon=5")
    assert r.status_code == 404
    assert r.json()["detail"] == "Прогноз для этого тикера ещё не рассчитан"


def test_bad_horizon_422(client):
    assert client.get("/api/forecast/AAA?model=naive&horizon=31").status_code == 422


def test_bad_model_422(client):
    assert client.get("/api/forecast/AAA?model=gpt&horizon=5").status_code == 422

"""Результаты обучения: data/results/<TICKER>.json."""
import json
import os

from forecast import config


def _path(ticker: str):
    return config.RESULTS_DIR / f"{ticker}.json"


def save_result(result: dict) -> None:
    """Атомарная запись: файл заменяется только целиком."""
    config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    path = _path(result["ticker"])
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    os.replace(tmp, path)


def load_result(ticker: str) -> dict:
    path = _path(ticker)
    if not path.exists():
        raise FileNotFoundError(f"Нет результатов для {ticker}")
    return json.loads(path.read_text(encoding="utf-8"))

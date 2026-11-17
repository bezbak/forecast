"""Обучает все модели и сохраняет прогнозы в data/results.

Использование:
    python scripts/train_all.py              # все тикеры со скачанными свечами
    python scripts/train_all.py AAPL NVDA    # выбранные
    python scripts/train_all.py --fast AAPL  # быстрый режим для отладки (LSTM 5 эпох)
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from forecast.pipeline import default_models, train_ticker  # noqa: E402
from forecast.results import save_result  # noqa: E402
from forecast.store import has_candles, load_candles  # noqa: E402
from forecast.universe import load_universe  # noqa: E402


def main(argv: list[str]) -> int:
    fast = "--fast" in argv
    tickers = [a for a in argv if a != "--fast"] or [c.ticker for c in load_universe() if has_candles(c.ticker)]
    models = default_models(lstm_epochs=5 if fast else 30)
    for i, t in enumerate(tickers, 1):
        start = time.perf_counter()
        res = train_ticker(t, load_candles(t)["close"], models=models)
        save_result(res)
        states = " ".join(f"{k}:{v['status']}" for k, v in res["models"].items()) or res["status"]
        print(f"[{i}/{len(tickers)}] {t} {time.perf_counter() - start:.1f}s {states}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

"""Скачивает дневные свечи с Yahoo Finance в data/candles.

Использование:
    python scripts/fetch_data.py            # весь состав Nasdaq-100
    python scripts/fetch_data.py AAPL NVDA  # выбранные тикеры
"""
import sys
from pathlib import Path
from typing import Callable

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from forecast.config import HISTORY_YEARS  # noqa: E402
from forecast.store import save_candles  # noqa: E402
from forecast.universe import load_universe  # noqa: E402


def yahoo_download(ticker: str) -> pd.DataFrame:
    import yfinance as yf

    df = yf.Ticker(ticker).history(period=f"{HISTORY_YEARS}y", auto_adjust=True)
    if not df.empty:
        df.index = df.index.tz_localize(None)
    return df


def fetch_all(tickers: list[str], download: Callable[[str], pd.DataFrame] = yahoo_download) -> list[str]:
    """Скачивает и сохраняет свечи; возвращает тикеры, которые не удалось получить."""
    failed = []
    for i, t in enumerate(tickers, 1):
        try:
            df = download(t)
            if df is None or df.empty:
                raise ValueError("пустой ответ")
            df = df.rename(columns=str.lower)
            save_candles(t, df)
            print(f"[{i}/{len(tickers)}] {t} ok ({len(df)} дн.)")
        except Exception as e:  # noqa: BLE001 — один тикер не должен ронять загрузку
            print(f"[{i}/{len(tickers)}] {t} ОШИБКА: {e}")
            failed.append(t)
    return failed


def main(argv: list[str]) -> int:
    tickers = argv or [c.ticker for c in load_universe()]
    failed = fetch_all(tickers)
    print(f"\nГотово: {len(tickers) - len(failed)}/{len(tickers)}")
    if failed:
        print("Не удалось:", " ".join(failed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

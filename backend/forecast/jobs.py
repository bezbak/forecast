"""Фоновое переобучение моделей одной бумаги."""
import threading
import uuid
from typing import Callable

import pandas as pd

from forecast.pipeline import ModelFactories, default_models, train_ticker
from forecast.results import save_result
from forecast.store import load_candles


def _load_close(ticker: str) -> pd.Series:
    return load_candles(ticker)["close"]


class JobManager:
    """Одна задача на бумагу одновременно; результат пишется только после успешного обучения."""

    def __init__(self, load_close: Callable[[str], pd.Series] = _load_close,
                 models: ModelFactories | None = None, train: Callable[..., dict] = train_ticker):
        self._load_close = load_close
        self._models = models
        self._train = train
        self._jobs: dict[str, dict] = {}
        self._running: dict[str, str] = {}  # тикер → id активной задачи
        self._lock = threading.Lock()

    def start(self, ticker: str) -> str:
        with self._lock:
            if ticker in self._running:
                return self._running[ticker]
            job_id = uuid.uuid4().hex[:12]
            self._jobs[job_id] = {"id": job_id, "ticker": ticker, "status": "running",
                                  "progress": 0.0, "model": None, "error": None}
            self._running[ticker] = job_id
        threading.Thread(target=self._run, args=(job_id, ticker), daemon=True).start()
        return job_id

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def _update(self, job_id: str, **fields) -> None:
        with self._lock:
            self._jobs[job_id].update(fields)

    def _run(self, job_id: str, ticker: str) -> None:
        models = self._models or default_models()
        names = list(models)

        def on_progress(name: str) -> None:
            self._update(job_id, model=name, progress=names.index(name) / len(names))

        try:
            result = self._train(ticker, self._load_close(ticker), models=models, on_progress=on_progress)
            save_result(result)
            final = {"status": "done", "progress": 1.0}
        except Exception as e:  # noqa: BLE001 — ошибка уходит в статус задачи
            final = {"status": "failed", "error": str(e)}
        # Статус и снятие с учёта — атомарно, чтобы новый start() не получил завершённую задачу.
        with self._lock:
            self._jobs[job_id].update(final)
            self._running.pop(ticker, None)

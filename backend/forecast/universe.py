"""Состав индекса Nasdaq-100 (статичный файл data/nasdaq100.json)."""
import json
from dataclasses import dataclass
from functools import lru_cache

from forecast import config


@dataclass(frozen=True)
class Company:
    ticker: str
    name: str
    sector: str


@lru_cache(maxsize=1)
def _read() -> dict:
    return json.loads(config.UNIVERSE_FILE.read_text(encoding="utf-8"))


def load_universe() -> list[Company]:
    return [Company(**c) for c in _read()["companies"]]


def universe_asof() -> str:
    return _read()["asof"]
